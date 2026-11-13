/**
 * WEB-038 — Purga excepcional de datos de prueba.
 *
 * EXCEPCIÓN DOCTRINAL AUTORIZADA POR EL DIRECTOR:
 * borra asientos de `historial_auditoria_inventario` (append-only, §8.B).
 * Es una operación única de mantenimiento sobre datos de prueba.
 *
 * PROHIBIDO importar este script desde Server Actions o desde código de la app.
 * La garantía append-only de producción permanece intacta.
 *
 * Uso:
 *   npx tsx scripts/purge-web038-test-data.ts --project=tiendalasmotos
 *   npx tsx scripts/purge-web038-test-data.ts --project=tiendalasmotos --mode=purge-apply --yes
 *   npx tsx scripts/purge-web038-test-data.ts --project=tiendalasmotos --mode=verify
 *
 * Sin flags = DRY-RUN. Cero escrituras.
 * El apply exige --mode=purge-apply Y --yes.
 */
import { writeFileSync } from 'node:fs';
import { deleteApp, initializeApp } from 'firebase-admin/app';
import {
    FieldPath,
    getFirestore,
    type DocumentData,
    type Firestore,
} from 'firebase-admin/firestore';

const PROJECT_ID = 'tiendalasmotos';
const BACKUP_PATH =
    '/private/var/folders/wv/332j5kzn75d7kjnsj6l_3hhc0000gn/T/opencode/purge-web038-backup.json';

const COLECCIONES_WEB038 = [
    'conteos_pendientes_repuestos',
    'inventario_repuestos',
    'historial_auditoria_inventario',
] as const;

type ColeccionWeb038 = (typeof COLECCIONES_WEB038)[number];

const WHITELIST: Record<ColeccionWeb038, readonly string[]> = {
    conteos_pendientes_repuestos: [
        // Grupo A — 3 del Auditor
        '61f993ee-42ff-4832-a1b0-824e2760383b',
        '6cf38511-9383-47ab-912c-8c3494cbc434',
        'f7678934-6f2f-4e85-8457-3ed5dbc56589',
        // Grupo B — 3 del Auditor
        '88085ef1-ee01-4c79-b93a-3f554e6d254e',
        'cfea3928-2b3e-4bea-9b82-d584557c4701',
        '936cb019-f522-4205-8900-c280370dd0c3',
        // Grupo C — 1 resuelto por query read-only (ID completo)
        '62924f9b-eeeb-48fc-bccf-6b0c62dc2058',
    ],
    inventario_repuestos: [
        'TEST-WEB038-001',
        'TEST-LEDGER-1793823509602',
        'TEST-LEDGER-1793823558240-NEW',
    ],
    historial_auditoria_inventario: [
        'MQOLHZw2O19aEOXA7fid',
        'Z32okyRWHTx6M3Ui9j21',
        'NuZMp6z0lUDLjBHhcsjR',
        '9BZZiMPJaPmmuVEaCZO7',
        'UyOeTgSckbtwmH6zfaN9',
        'LzoI9hpcK9jEiWxXVXXl',
        'Pf87u7eFCykAhzdUecc3',
        'reconciliacion_MQOLHZw2O19aEOXA7fid',
        'reconciliacion_Z32okyRWHTx6M3Ui9j21',
    ],
};

const GRUPO_C_ID = '62924f9b-eeeb-48fc-bccf-6b0c62dc2058';
const GRUPO_C_TRUNCADO = '62924f9b';
const CONOCIDOS_SIN_C = new Set<string>([
    ...WHITELIST.conteos_pendientes_repuestos.slice(0, 6),
]);

const PROHIBIDAS = [
    'creditos',
    'clientes_credito',
    'pagos_y_multas',
    'pagos_inversores',
    'remisiones_dinero',
    'historial_auditoria',
    'fotos_inventario',
] as const;

const FASE9_BASELINE: Record<string, number> = {
    creditos: 1,
    clientes_credito: 2,
    pagos_y_multas: 1,
    pagos_inversores: 0,
    remisiones_dinero: 1,
    historial_auditoria: 12,
};

const FOTOS_INVENTARIO_BASELINE = 3;
const FOTOS_INVENTARIO_IDS = [
    '61f993ee-42ff-4832-a1b0-824e2760383b',
    '6cf38511-9383-47ab-912c-8c3494cbc434',
    'f7678934-6f2f-4e85-8457-3ed5dbc56589',
] as const;

const COUNTS_ANTES: Record<ColeccionWeb038, number> = {
    conteos_pendientes_repuestos: 7,
    inventario_repuestos: 3,
    historial_auditoria_inventario: 9,
};

const COUNTS_DESPUES: Record<ColeccionWeb038, number> = {
    conteos_pendientes_repuestos: 0,
    inventario_repuestos: 0,
    historial_auditoria_inventario: 0,
};

type Modo = 'dry-run' | 'purge-apply' | 'verify';

interface Opciones {
    projectId: string;
    modo: Modo;
    yes: boolean;
}

interface DocumentoLeido {
    coleccion: ColeccionWeb038;
    id: string;
    data: DocumentData;
}

function parseOpciones(argv: string[]): Opciones {
    let projectId = '';
    let modo: Modo = 'dry-run';
    let yes = false;

    for (const arg of argv) {
        if (arg === '--yes') {
            yes = true;
            continue;
        }
        if (!arg.startsWith('--')) continue;
        const [clave, valor = ''] = arg.slice(2).split('=', 2);

        if (clave === 'project') {
            projectId = valor.trim();
        } else if (clave === 'mode') {
            if (
                valor !== 'dry-run' &&
                valor !== 'purge-apply' &&
                valor !== 'verify'
            ) {
                throw new Error(`Modo inválido: ${valor}`);
            }
            modo = valor;
        }
    }

    if (!projectId) {
        throw new Error('Falta --project. Este script no asume proyecto.');
    }
    if (projectId !== PROJECT_ID) {
        throw new Error(
            `Proyecto no autorizado: ${projectId}. Solo ${PROJECT_ID}.`
        );
    }
    if (modo === 'purge-apply' && !yes) {
        throw new Error('purge-apply exige --yes explícito.');
    }

    return { projectId, modo, yes };
}

function todosLosIds(): string[] {
    const ids = COLECCIONES_WEB038.flatMap((coleccion) => [
        ...WHITELIST[coleccion],
    ]);
    if (new Set(ids).size !== ids.length) {
        throw new Error('La whitelist contiene IDs duplicados.');
    }
    return ids;
}

function exigirObjeto(valor: unknown, contexto: string): Record<string, unknown> {
    if (!valor || typeof valor !== 'object' || Array.isArray(valor)) {
        throw new Error(`${contexto}: documento inválido.`);
    }
    return valor as Record<string, unknown>;
}

function exigirTexto(valor: unknown, contexto: string): string {
    if (typeof valor !== 'string' || !valor.trim()) {
        throw new Error(`${contexto}: texto requerido ausente.`);
    }
    return valor.trim();
}

async function resolverGrupoC(
    db: Firestore
): Promise<{ id: string; referencia: string }> {
    const snap = await db
        .collection('conteos_pendientes_repuestos')
        .where('referencia_confirmada', '>=', 'TEST-')
        .where('referencia_confirmada', '<', 'TESU')
        .get();

    const candidatos = snap.docs.filter(
        (doc) => !CONOCIDOS_SIN_C.has(doc.id)
    );

    if (candidatos.length !== 1) {
        throw new Error(
            `Grupo C: se esperaba 1 conteo TEST- fuera del grupo A/B, ` +
                `encontrados ${candidatos.length} (${candidatos
                    .map((doc) => doc.id)
                    .join(', ')}).`
        );
    }

    const candidato = candidatos[0];
    if (!candidato.id.startsWith(GRUPO_C_TRUNCADO)) {
        throw new Error(
            `Grupo C: el ID resuelto ${candidato.id} no coincide con el prefijo autorizado ${GRUPO_C_TRUNCADO}.`
        );
    }
    if (candidato.id !== GRUPO_C_ID) {
        throw new Error(
            `Grupo C: el ID resuelto ${candidato.id} no coincide con el ID completo hardcodeado ${GRUPO_C_ID}.`
        );
    }

    const referencia = exigirTexto(
        candidato.data().referencia_confirmada,
        `Grupo C ${candidato.id}`
    );

    return { id: candidato.id, referencia };
}

function validarContenido(doc: DocumentoLeido): void {
    const data = doc.data;
    const contexto = `${doc.coleccion}/${doc.id}`;

    if (doc.coleccion === 'conteos_pendientes_repuestos') {
        const referencia = exigirTexto(
            data.referencia_confirmada,
            contexto
        );
        if (!referencia.startsWith('TEST-')) {
            throw new Error(
                `${contexto}: referencia_confirmada no empieza con TEST-.`
            );
        }
        return;
    }

    if (doc.coleccion === 'inventario_repuestos') {
        const referencia = exigirTexto(data.referencia, contexto);
        if (!referencia.startsWith('TEST-')) {
            throw new Error(`${contexto}: referencia no empieza con TEST-.`);
        }
        return;
    }

    const esCorreccion = doc.id.startsWith('reconciliacion_');
    const conteoId =
        typeof data.conteo_id === 'string' ? data.conteo_id : '';
    const referencia =
        typeof data.referencia === 'string' ? data.referencia : '';
    const conteoIdsPrueba = new Set(
        WHITELIST.conteos_pendientes_repuestos
    );

    if (
        !esCorreccion &&
        !conteoIdsPrueba.has(conteoId) &&
        !referencia.startsWith('TEST-')
    ) {
        throw new Error(
            `${contexto}: el asiento no coincide con conteo_id/referencia de prueba ni con el prefijo reconciliacion_.`
        );
    }
}

async function inspeccionarWhitelist(
    db: Firestore
): Promise<{
    docs: Map<ColeccionWeb038, Map<string, DocumentData>>;
    faltantes: string[];
}> {
    const resultado = new Map<
        ColeccionWeb038,
        Map<string, DocumentData>
    >();
    const faltantes: string[] = [];

    for (const coleccion of COLECCIONES_WEB038) {
        const docs = new Map<string, DocumentData>();
        for (const id of WHITELIST[coleccion]) {
            const snap = await db.collection(coleccion).doc(id).get();
            if (!snap.exists) {
                faltantes.push(`${coleccion}/${id}`);
                continue;
            }
            const data = snap.data() as DocumentData;
            docs.set(id, data);
            validarContenido({ coleccion, id, data });
        }
        resultado.set(coleccion, docs);
    }

    return { docs: resultado, faltantes };
}

async function validarColecciones(
    db: Firestore,
    docsWhitelist: Map<ColeccionWeb038, Map<string, DocumentData>>
): Promise<Record<ColeccionWeb038, DocumentData[]>> {
    const todos = await Promise.all(
        COLECCIONES_WEB038.map(async (coleccion) => {
            const snap = await db.collection(coleccion).get();
            return { coleccion, docs: snap.docs };
        })
    );

    const porColeccion = {} as Record<ColeccionWeb038, DocumentData[]>;
    const idsVistos = new Map<string, ColeccionWeb038>();

    for (const { coleccion, docs } of todos) {
        porColeccion[coleccion] = docs.map((doc) => doc.data());

        for (const doc of docs) {
            if (!WHITELIST[coleccion].includes(doc.id)) {
                throw new Error(
                    `Documento fuera de whitelist en ${coleccion}: ${doc.id}. Abortando.`
                );
            }
            if (idsVistos.has(doc.id)) {
                throw new Error(
                    `ID duplicado entre colecciones: ${doc.id} en ${idsVistos.get(doc.id)} y ${coleccion}.`
                );
            }
            idsVistos.set(doc.id, coleccion);
        }
    }

    for (const coleccion of COLECCIONES_WEB038) {
        const esperados = WHITELIST[coleccion];
        if (porColeccion[coleccion].length !== esperados.length) {
            throw new Error(
                `${coleccion}: se esperaban ${esperados.length} documentos, ` +
                    `encontrados ${porColeccion[coleccion].length}.`
            );
        }
    }

    return porColeccion;
}

async function validarColeccionesVacias(db: Firestore): Promise<void> {
    for (const coleccion of COLECCIONES_WEB038) {
        const snap = await db.collection(coleccion).get();
        if (!snap.empty) {
            throw new Error(
                `${coleccion}: no hay IDs de la whitelist, pero existen ` +
                    `${snap.size} documentos ajenos (${snap.docs
                        .map((doc) => doc.id)
                        .join(', ')}). Abortando.`
            );
        }
    }
}

async function validarProhibidas(
    db: Firestore,
    ids: string[]
): Promise<Record<string, number>> {
    const conteos: Record<string, number> = {};

    for (const coleccion of PROHIBIDAS) {
        if (coleccion === 'fotos_inventario') {
            // Excepción topológica: los 3 docs de fotos comparten ID con los
            // 3 conteos originales. Están fuera del alcance de la purga y no
            // se tocan, pero se valida que sean exactamente esos 3.
            const esperadas = await db
                .collection(coleccion)
                .where(
                    FieldPath.documentId(),
                    'in',
                    [...FOTOS_INVENTARIO_IDS]
                )
                .count()
                .get();
            if (esperadas.data().count !== FOTOS_INVENTARIO_BASELINE) {
                throw new Error(
                    `fotos_inventario: se esperaban los ${FOTOS_INVENTARIO_BASELINE} ` +
                        `IDs conocidos, encontrados ${esperadas.data().count}. Abortando.`
                );
            }
            const totalFotos = await db.collection(coleccion).count().get();
            if (totalFotos.data().count !== FOTOS_INVENTARIO_BASELINE) {
                throw new Error(
                    `fotos_inventario: se esperaban ${FOTOS_INVENTARIO_BASELINE} ` +
                        `documentos totales, encontrados ${totalFotos.data().count}. Abortando.`
                );
            }
            conteos[coleccion] = totalFotos.data().count;
            continue;
        }

        const colision = await db
            .collection(coleccion)
            .where(FieldPath.documentId(), 'in', ids)
            .count()
            .get();
        if (colision.data().count > 0) {
            throw new Error(
                `Colisión en colección prohibida ${coleccion}: ` +
                    `${colision.data().count} IDs de la whitelist. Abortando.`
            );
        }

        const total = await db.collection(coleccion).count().get();
        conteos[coleccion] = total.data().count;
    }

    return conteos;
}

async function validarFase9(
    conteos: Record<string, number>
): Promise<void> {
    for (const [coleccion, esperado] of Object.entries(FASE9_BASELINE)) {
        const actual = conteos[coleccion];
        if (actual !== esperado) {
            throw new Error(
                `Fase 9 ${coleccion}: se esperaba ${esperado}, encontrado ${actual}. Abortando.`
            );
        }
    }
    if (conteos.fotos_inventario !== FOTOS_INVENTARIO_BASELINE) {
        throw new Error(
            `fotos_inventario: se esperaba ${FOTOS_INVENTARIO_BASELINE}, ` +
                `encontrado ${conteos.fotos_inventario}. Abortando.`
        );
    }
}

async function validarTodo(db: Firestore): Promise<{
    docs: Map<ColeccionWeb038, Map<string, DocumentData>>;
    grupoC: { id: string; referencia: string } | null;
    fase9: Record<string, number>;
    noop: boolean;
}> {
    const ids = todosLosIds();
    const presencia = await inspeccionarWhitelist(db);
    const presentes = [...presencia.docs.values()].reduce(
        (total, coleccion) => total + coleccion.size,
        0
    );

    if (presentes === 0) {
        await validarColeccionesVacias(db);
        const fase9 = await validarProhibidas(db, ids);
        await validarFase9(fase9);
        return {
            docs: presencia.docs,
            grupoC: null,
            fase9,
            noop: true,
        };
    }

    if (presentes !== ids.length) {
        throw new Error(
            `Presencia parcial: ${presentes}/${ids.length}. ` +
                `Faltan: ${presencia.faltantes.join(', ')}. ` +
                'Abortando con cero escrituras.'
        );
    }

    const grupoC = await resolverGrupoC(db);
    await validarColecciones(db, presencia.docs);
    const fase9 = await validarProhibidas(db, ids);
    await validarFase9(fase9);

    return {
        docs: presencia.docs,
        grupoC,
        fase9,
        noop: false,
    };
}

function imprimirResumen(
    docs: Map<ColeccionWeb038, Map<string, DocumentData>>,
    grupoC: { id: string; referencia: string },
    fase9: Record<string, number>
): void {
    console.log('\nWhitelist por colección:');
    for (const coleccion of COLECCIONES_WEB038) {
        const ids = WHITELIST[coleccion];
        console.log(
            `- ${coleccion}: ${ids.length} IDs (${COUNTS_ANTES[coleccion]} docs actuales)`
        );
        for (const id of ids) {
            const data = docs.get(coleccion)?.get(id);
            const referencia =
                data?.referencia_confirmada ?? data?.referencia ?? '';
            console.log(`  · ${id}${referencia ? ` — ${referencia}` : ''}`);
        }
    }

    console.log('\nGrupo C resuelto por query read-only:');
    console.log(`- ${grupoC.id} — ${grupoC.referencia}`);

    console.log('\nPresencia: 19/19.');
    console.log('\nFase 9 (solo count, sin escritura):');
    for (const [coleccion, total] of Object.entries(fase9)) {
        console.log(`- ${coleccion}: ${total}`);
    }
}

async function modoDryRun(db: Firestore): Promise<void> {
    const { docs, grupoC, fase9, noop } = await validarTodo(db);

    if (noop) {
        console.log('\nPresencia: 0/19. No-op idempotente.');
        console.log('\nFase 9 (solo count, sin escritura):');
        for (const [coleccion, total] of Object.entries(fase9)) {
            console.log(`- ${coleccion}: ${total}`);
        }
        console.log('\nDRY-RUN: cero escrituras. Nada que purgar.');
        return;
    }

    if (!grupoC) {
        throw new Error('Grupo C no resuelto en presencia completa.');
    }
    imprimirResumen(docs, grupoC, fase9);
    console.log('\nDRY-RUN: cero escrituras.');
    console.log(
        'Para ejecutar: --mode=purge-apply --yes (requiere autorización del Auditor).'
    );
}

async function modoApply(db: Firestore): Promise<void> {
    const { docs, grupoC, fase9, noop } = await validarTodo(db);

    if (noop) {
        console.log('\nApply: 0 borrados, 19 omitidos (no existentes).');
        return;
    }

    if (!grupoC) {
        throw new Error('Grupo C no resuelto en presencia completa.');
    }
    imprimirResumen(docs, grupoC, fase9);

    const backup: Record<string, Record<string, DocumentData>> = {};
    for (const coleccion of COLECCIONES_WEB038) {
        backup[coleccion] = {};
        for (const [id, data] of docs.get(coleccion) ?? []) {
            backup[coleccion][id] = data;
        }
    }

    writeFileSync(
        BACKUP_PATH,
        JSON.stringify(
            {
                projectId: PROJECT_ID,
                exportedAt: new Date().toISOString(),
                collections: backup,
            },
            null,
            2
        )
    );
    console.log(`\nBackup local: ${BACKUP_PATH}`);

    const batch = db.batch();
    let borrados = 0;
    let omitidos = 0;

    for (const coleccion of COLECCIONES_WEB038) {
        for (const id of WHITELIST[coleccion]) {
            const ref = db.collection(coleccion).doc(id);
            batch.delete(ref);
            borrados++;
        }
    }

    // 19/19 verificados antes de construir el batch; no hay omisiones parciales.
    await batch.commit();

    console.log(`\nApply: ${borrados} borrados, ${omitidos} omitidos.`);
    console.log('Backup completo de los 19 documentos conservado fuera del repo.');
}

async function contarColeccion(
    db: Firestore,
    coleccion: string
): Promise<number> {
    const snap = await db.collection(coleccion).count().get();
    return snap.data().count;
}

async function modoVerify(db: Firestore): Promise<void> {
    const ids = todosLosIds();

    console.log('\nConteos antes/después:');
    for (const coleccion of COLECCIONES_WEB038) {
        const actual = await contarColeccion(db, coleccion);
        console.log(
            `- ${coleccion}: antes=${COUNTS_ANTES[coleccion]} ` +
                `después=${actual} esperado=${COUNTS_DESPUES[coleccion]}`
        );
        if (actual !== COUNTS_DESPUES[coleccion]) {
            throw new Error(
                `${coleccion}: quedan ${actual} documentos; se esperaban 0.`
            );
        }
    }

    for (const id of ids) {
        for (const coleccion of COLECCIONES_WEB038) {
            const snap = await db.collection(coleccion).doc(id).get();
            if (snap.exists) {
                throw new Error(
                    `Sobrevivió ${coleccion}/${id} a la purga.`
                );
            }
        }
    }

    const fase9 = await validarProhibidas(db, ids);
    await validarFase9(fase9);

    console.log('\nFase 9 (post-purga):');
    for (const [coleccion, total] of Object.entries(fase9)) {
        console.log(`- ${coleccion}: ${total}`);
    }
    console.log('\nVERIFY OK: ledger de inventario vacío y Fase 9 intacta.');
}

async function main(): Promise<void> {
    const opciones = parseOpciones(process.argv.slice(2));
    const app = initializeApp({ projectId: opciones.projectId });
    const db = getFirestore(app);

    try {
        console.log(`Proyecto: ${opciones.projectId}`);
        console.log(`Modo: ${opciones.modo}`);

        if (opciones.modo === 'dry-run') {
            await modoDryRun(db);
        } else if (opciones.modo === 'purge-apply') {
            await modoApply(db);
        } else {
            await modoVerify(db);
        }
    } finally {
        await deleteApp(app);
    }
}

main().catch((error: unknown) => {
    console.error('[purge-web038] Falló:', error);
    process.exit(1);
});
