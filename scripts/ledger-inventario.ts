/**
 * WEB-038 — Reconciliación append-only del ledger de inventario.
 *
 * Modos:
 *   --mode=audit   Solo lectura. Clasifica los 3 asientos históricos.
 *   --mode=apply   Crea únicamente los asientos de reconciliación faltantes.
 *   --mode=verify  Solo lectura. Verifica la consulta canónica por estado.
 *
 * Uso:
 *   npx tsx scripts/ledger-inventario.ts --project=tiendalasmotos --mode=audit
 *   npx tsx scripts/ledger-inventario.ts --project=tiendalasmotos --mode=apply
 *   npx tsx scripts/ledger-inventario.ts --project=tiendalasmotos --mode=verify \
 *     --conteo-ids=id1,id2,id3
 *
 * Reglas duras:
 * - Los 3 documentos originales son inmutables: este script nunca los
 *   actualiza, sobrescribe ni elimina.
 * - Las correcciones se crean con tx.create() sobre IDs deterministas.
 * - El script no escribe si la validación previa falla.
 */
import { deleteApp, initializeApp } from 'firebase-admin/app';
import {
    getFirestore,
    type DocumentData,
    type Firestore,
} from 'firebase-admin/firestore';
import { esEstadoConteo } from '../src/lib/actions/inventario-schemas';
import { reconciliarDatosNuevosLegado } from '../src/lib/actions/inventario-ledger';

const COLECCION = 'historial_auditoria_inventario';
const PREFIJO_RECONCILIACION = 'reconciliacion_';

const ASIENTOS_LEGADO = [
    'MQOLHZw2O19aEOXA7fid',
    'Z32okyRWHTx6M3Ui9j21',
    'NuZMp6z0lUDLjBHhcsjR',
] as const;

type Modo = 'audit' | 'apply' | 'verify';
type Clasificacion = 'NOOP' | 'CORREGIR';

interface Opciones {
    projectId: string;
    modo: Modo;
    conteoIds: string[];
}

interface Correccion {
    asientoOriginalId: string;
    correccionId: string;
    payload: DocumentData;
}

interface AsientoLeido {
    id: string;
    data: DocumentData;
}

function parseOpciones(argv: string[]): Opciones {
    let projectId = '';
    let modo: Modo = 'audit';
    let conteoIds: string[] = [];

    for (const arg of argv) {
        if (!arg.startsWith('--')) continue;
        const [clave, valor = ''] = arg.slice(2).split('=', 2);

        if (clave === 'project') {
            projectId = valor.trim();
        } else if (clave === 'mode') {
            if (valor !== 'audit' && valor !== 'apply' && valor !== 'verify') {
                throw new Error(`Modo inválido: ${valor}`);
            }
            modo = valor;
        } else if (clave === 'conteo-ids') {
            conteoIds = valor
                .split(',')
                .map((id) => id.trim())
                .filter(Boolean);
        }
    }

    if (!projectId) {
        throw new Error('Falta --project. Este script no asume proyecto.');
    }

    return { projectId, modo, conteoIds };
}

function exigirObjeto(
    valor: unknown,
    contexto: string
): Record<string, unknown> {
    if (!valor || typeof valor !== 'object' || Array.isArray(valor)) {
        throw new Error(`${contexto}: datos_nuevos inválido.`);
    }
    return valor as Record<string, unknown>;
}

function clavesEstado(datos: Record<string, unknown>): string[] {
    return ['estado', 'estado_conteo'].filter((clave) =>
        Object.prototype.hasOwnProperty.call(datos, clave)
    );
}

function clasificar(data: DocumentData): Clasificacion {
    const datosNuevos = exigirObjeto(data.datos_nuevos, 'Asiento de ledger');
    const claves = clavesEstado(datosNuevos);

    if (claves.length === 0) {
        throw new Error('Asiento de ledger sin clave de estado.');
    }
    if (claves.length > 1) {
        throw new Error(
            'Asiento de ledger ambiguo: contiene estado y estado_conteo.'
        );
    }
    return claves[0] === 'estado' ? 'NOOP' : 'CORREGIR';
}

async function leerAsiento(
    db: Firestore,
    id: string
): Promise<AsientoLeido> {
    const snap = await db.collection(COLECCION).doc(id).get();
    if (!snap.exists) {
        throw new Error(`No existe el asiento histórico ${id}.`);
    }
    return { id, data: snap.data() as DocumentData };
}

async function construirCorrecciones(
    db: Firestore
): Promise<{
    clasificaciones: Array<{
        id: string;
        clasificacion: Clasificacion;
        correccionId: string | null;
    }>;
    correcciones: Correccion[];
}> {
    const clasificaciones: Array<{
        id: string;
        clasificacion: Clasificacion;
        correccionId: string | null;
    }> = [];
    const correcciones: Correccion[] = [];

    for (const id of ASIENTOS_LEGADO) {
        const asiento = await leerAsiento(db, id);
        const clasificacion = clasificar(asiento.data);
        const correccionId =
            clasificacion === 'CORREGIR'
                ? `${PREFIJO_RECONCILIACION}${id}`
                : null;

        clasificaciones.push({ id, clasificacion, correccionId });

        if (clasificacion === 'CORREGIR') {
            const datosNuevos = exigirObjeto(
                asiento.data.datos_nuevos,
                `Asiento ${id}`
            );
            const datosCorregidos = reconciliarDatosNuevosLegado(datosNuevos);
            if (!datosCorregidos) {
                throw new Error(
                    `El asiento ${id} fue clasificado CORREGIR pero no produjo corrección.`
                );
            }

            correcciones.push({
                asientoOriginalId: id,
                correccionId: correccionId as string,
                payload: {
                    ...asiento.data,
                    datos_nuevos: datosCorregidos,
                },
            });
        }
    }

    return { clasificaciones, correcciones };
}

function imprimirClasificaciones(
    clasificaciones: Awaited<
        ReturnType<typeof construirCorrecciones>
    >['clasificaciones']
): void {
    console.log('\nClasificación de asientos históricos:');
    for (const item of clasificaciones) {
        console.log(
            `- ${item.id}: ${item.clasificacion}` +
                (item.correccionId
                    ? ` -> ${item.correccionId}`
                    : ' (sin escritura)')
        );
    }
}

function validarCorreccion(correccion: Correccion): void {
    const datosNuevos = exigirObjeto(
        correccion.payload.datos_nuevos,
        `Corrección ${correccion.correccionId}`
    );
    const claves = clavesEstado(datosNuevos);

    if (
        claves.length !== 1 ||
        claves[0] !== 'estado' ||
        !esEstadoConteo(datosNuevos.estado)
    ) {
        throw new Error(
            `Corrección ${correccion.correccionId} inválida: se esperaba solo estado.`
        );
    }
}

async function modoAudit(db: Firestore): Promise<void> {
    const { clasificaciones, correcciones } = await construirCorrecciones(db);
    imprimirClasificaciones(clasificaciones);

    console.log('\nPayloads propuestos (no se escribe nada):');
    for (const correccion of correcciones) {
        validarCorreccion(correccion);
        console.log(`\n${correccion.correccionId}:`);
        console.log(JSON.stringify(correccion.payload, null, 2));
    }

    console.log(
        `\nResumen audit: ${correcciones.length} CORREGIR, ` +
            `${clasificaciones.length - correcciones.length} NOOP.`
    );
}

async function modoApply(db: Firestore): Promise<void> {
    const { clasificaciones, correcciones } = await construirCorrecciones(db);
    imprimirClasificaciones(clasificaciones);

    for (const correccion of correcciones) {
        validarCorreccion(correccion);
    }

    const creados: string[] = [];
    const omitidos: string[] = [];

    await db.runTransaction(async (tx) => {
        creados.length = 0;
        omitidos.length = 0;

        const refs = correcciones.map((correccion) =>
            db.collection(COLECCION).doc(correccion.correccionId)
        );
        const existencias: boolean[] = [];

        for (const ref of refs) {
            const snap = await tx.get(ref);
            existencias.push(snap.exists);
        }

        for (let i = 0; i < correcciones.length; i++) {
            const correccion = correcciones[i];
            if (existencias[i]) {
                omitidos.push(correccion.correccionId);
                continue;
            }

            tx.create(refs[i], correccion.payload);
            creados.push(correccion.correccionId);
        }
    });

    console.log(
        `\nApply: ${creados.length} creados, ${omitidos.length} omitidos.`
    );
    for (const id of creados) {
        console.log(`- creado ${id}`);
    }
    for (const id of omitidos) {
        console.log(`- omitido ${id} (ya existía)`);
    }
}

function serializar(valor: unknown): string {
    return JSON.stringify(valor);
}

const CAMPOS_PRESERVADOS = [
    'coleccion_afectada',
    'documento_id',
    'referencia',
    'conteo_id',
    'operacion',
    'datos_anteriores',
    'campos_modificados',
    'registrado_por',
    'registrado_por_email',
    'creado_en',
    'version',
] as const;

function validarAsientoCanonico(
    id: string,
    data: DocumentData,
    estadoEsperado: string
): void {
    const datosNuevos = exigirObjeto(data.datos_nuevos, `Asiento ${id}`);
    const claves = clavesEstado(datosNuevos);

    if (claves.length !== 1 || claves[0] !== 'estado') {
        throw new Error(
            `Asiento ${id}: se esperaba solo estado, encontrado ${claves.join(', ') || 'ninguna clave'}.`
        );
    }
    if (datosNuevos.estado !== estadoEsperado) {
        throw new Error(
            `Asiento ${id}: estado ${String(datosNuevos.estado)} != ${estadoEsperado}.`
        );
    }
}

async function modoVerify(db: Firestore, conteoIds: string[]): Promise<void> {
    const aprobados = await db
        .collection(COLECCION)
        .where('datos_nuevos.estado', '==', 'aprobado')
        .get();
    const rechazados = await db
        .collection(COLECCION)
        .where('datos_nuevos.estado', '==', 'rechazado')
        .get();

    for (const doc of aprobados.docs) {
        validarAsientoCanonico(doc.id, doc.data(), 'aprobado');
    }
    for (const doc of rechazados.docs) {
        validarAsientoCanonico(doc.id, doc.data(), 'rechazado');
    }

    console.log(
        `\nConsulta canónica: ${aprobados.size} aprobados, ${rechazados.size} rechazados.`
    );
    console.log('Aprobados:');
    for (const doc of aprobados.docs) {
        console.log(`- ${doc.id}`);
    }
    console.log('Rechazados:');
    for (const doc of rechazados.docs) {
        console.log(`- ${doc.id}`);
    }

    const legado = await db
        .collection(COLECCION)
        .where('datos_nuevos.estado_conteo', '==', 'aprobado')
        .get();
    const idsLegado = legado.docs.map((doc) => doc.id).sort();
    const idsLegadoEsperados = [
        'MQOLHZw2O19aEOXA7fid',
        'Z32okyRWHTx6M3Ui9j21',
    ];

    if (JSON.stringify(idsLegado) !== JSON.stringify(idsLegadoEsperados)) {
        throw new Error(
            `Consulta estado_conteo devolvió ${JSON.stringify(idsLegado)}; ` +
                `se esperaban solo los 2 originales.`
        );
    }

    console.log(
        `Consulta estado_conteo (solo legado): ${idsLegado.join(', ')}`
    );

    for (const id of idsLegadoEsperados) {
        const asiento = await leerAsiento(db, id);
        const datosNuevos = exigirObjeto(
            asiento.data.datos_nuevos,
            `Original ${id}`
        );
        if (!('estado_conteo' in datosNuevos) || 'estado' in datosNuevos) {
            throw new Error(
                `El original ${id} fue alterado: debe conservar estado_conteo y no estado.`
            );
        }
    }

    for (const id of idsLegadoEsperados) {
        const correccionId = `${PREFIJO_RECONCILIACION}${id}`;
        const original = await leerAsiento(db, id);
        const correccion = await leerAsiento(db, correccionId);
        validarAsientoCanonico(correccionId, correccion.data, 'aprobado');

        for (const campo of CAMPOS_PRESERVADOS) {
            if (
                serializar(original.data[campo]) !==
                serializar(correccion.data[campo])
            ) {
                throw new Error(
                    `Corrección ${correccionId}: campo ${campo} no coincide con el original.`
                );
            }
        }

        const datosEsperados = reconciliarDatosNuevosLegado(
            exigirObjeto(original.data.datos_nuevos, `Original ${id}`)
        );
        if (
            !datosEsperados ||
            serializar(datosEsperados) !==
                serializar(correccion.data.datos_nuevos)
        ) {
            throw new Error(
                `Corrección ${correccionId}: datos_nuevos no es copia fiel del original.`
            );
        }

        console.log(`Corrección fiel: ${correccionId}`);
    }

    const nuzm = await leerAsiento(db, 'NuZMp6z0lUDLjBHhcsjR');
    validarAsientoCanonico('NuZMp6z0lUDLjBHhcsjR', nuzm.data, 'rechazado');

    if (conteoIds.length > 0) {
        console.log('\nVerificación de flujos nuevos por conteo_id:');
        for (const conteoId of conteoIds) {
            const snap = await db
                .collection(COLECCION)
                .where('conteo_id', '==', conteoId)
                .get();
            const canonicos = snap.docs.filter((doc) => {
                const datosNuevos = doc.data().datos_nuevos;
                if (!datosNuevos || typeof datosNuevos !== 'object') {
                    return false;
                }
                return clavesEstado(
                    datosNuevos as Record<string, unknown>
                ).length > 0;
            });

            if (canonicos.length !== 1) {
                throw new Error(
                    `conteo_id ${conteoId}: se esperaba 1 asiento canónico, ` +
                        `encontrados ${canonicos.length}.`
                );
            }

            const data = canonicos[0].data();
            const datosNuevos = exigirObjeto(
                data.datos_nuevos,
                `conteo_id ${conteoId}`
            );
            const claves = clavesEstado(datosNuevos);

            if (claves.length !== 1 || claves[0] !== 'estado') {
                throw new Error(
                    `conteo_id ${conteoId}: claves de estado ${claves.join(', ')}.`
                );
            }
            if (!esEstadoConteo(datosNuevos.estado)) {
                throw new Error(
                    `conteo_id ${conteoId}: estado inválido.`
                );
            }

            console.log(
                `- ${conteoId}: ${canonicos[0].id} ` +
                    `operacion=${String(data.operacion)} ` +
                    `estado=${datosNuevos.estado} claves=${claves.join(',')}`
            );
        }
    }

    console.log('\nVERIFY OK');
}

async function main(): Promise<void> {
    const opciones = parseOpciones(process.argv.slice(2));
    const app = initializeApp({ projectId: opciones.projectId });
    const db = getFirestore(app);

    try {
        console.log(`Proyecto: ${opciones.projectId}`);
        console.log(`Modo: ${opciones.modo}`);

        if (opciones.modo === 'audit') {
            await modoAudit(db);
        } else if (opciones.modo === 'apply') {
            await modoApply(db);
        } else {
            await modoVerify(db, opciones.conteoIds);
        }
    } finally {
        await deleteApp(app);
    }
}

main().catch((error: unknown) => {
    console.error('[ledger-inventario] Falló:', error);
    process.exit(1);
});
