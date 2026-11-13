/**
 * WEB-038-H1 — Purga excepcional de metadatos huérfanos de fotos.
 *
 * Alcance: SOLO `fotos_inventario` (Firestore). NO toca Storage.
 * Excepción autorizada para completar la paridad 1:1 de datos de prueba.
 * PROHIBIDO importar este script desde Server Actions o código de la app.
 *
 * Uso:
 *   npx tsx scripts/purge-web038-fotos-test-data.ts --project=tiendalasmotos
 *   npx tsx scripts/purge-web038-fotos-test-data.ts --project=tiendalasmotos --mode=purge-apply --yes
 *   npx tsx scripts/purge-web038-fotos-test-data.ts --project=tiendalasmotos --mode=verify
 *
 * Sin flags = DRY-RUN. Cero escrituras.
 * El apply exige --mode=purge-apply Y --yes, y solo borra HUÉRFANOS certificados.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { deleteApp, initializeApp } from 'firebase-admin/app';
import {
    getFirestore,
    type DocumentData,
    type Firestore,
} from 'firebase-admin/firestore';

const PROJECT_ID = 'tiendalasmotos';
const COLECCION_FOTOS = 'fotos_inventario';
const COLECCION_CONTEOS = 'conteos_pendientes_repuestos';
const BACKUP_PATH =
    '/private/var/folders/wv/332j5kzn75d7kjnsj6l_3hhc0000gn/T/opencode/purge-web038-fotos-backup.json';

const COLECCIONES_WEB038 = [
    'conteos_pendientes_repuestos',
    'inventario_repuestos',
    'historial_auditoria_inventario',
] as const;

const FASE9_BASELINE: Record<string, number> = {
    creditos: 1,
    clientes_credito: 2,
    pagos_y_multas: 1,
    pagos_inversores: 0,
    remisiones_dinero: 1,
    historial_auditoria: 12,
};

const FOTOS_HUERFANAS_CERTIFICADAS = [
    '61f993ee-42ff-4832-a1b0-824e2760383b',
    '6cf38511-9383-47ab-912c-8c3494cbc434',
    'f7678934-6f2f-4e85-8457-3ed5dbc56589',
] as const;

type Modo = 'dry-run' | 'purge-apply' | 'verify';

interface Opciones {
    projectId: string;
    modo: Modo;
    yes: boolean;
}

interface FotoLeida {
    docId: string;
    conteoId: string;
    asesorEmail: string;
    creadoEn: string;
    mimeType: string;
    tamanoBytes: number;
    data: DocumentData;
    clasificacion: 'HUERFANO' | 'CON_PADRE';
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

function exigirTexto(valor: unknown, contexto: string): string {
    if (typeof valor !== 'string' || !valor.trim()) {
        throw new Error(`${contexto}: texto requerido ausente.`);
    }
    return valor.trim();
}

function exigirNumero(valor: unknown, contexto: string): number {
    if (typeof valor !== 'number' || !Number.isFinite(valor)) {
        throw new Error(`${contexto}: número requerido inválido.`);
    }
    return valor;
}

function fechaISO(valor: unknown, contexto: string): string {
    if (!valor) {
        throw new Error(`${contexto}: creado_en ausente.`);
    }

    if (valor instanceof Date) {
        if (Number.isNaN(valor.getTime())) {
            throw new Error(`${contexto}: creado_en inválido.`);
        }
        return valor.toISOString();
    }

    if (typeof valor === 'object') {
        const candidato = valor as { toDate?: () => Date };
        if (typeof candidato.toDate === 'function') {
            const fecha = candidato.toDate();
            if (!(fecha instanceof Date) || Number.isNaN(fecha.getTime())) {
                throw new Error(`${contexto}: creado_en inválido.`);
            }
            return fecha.toISOString();
        }
    }

    throw new Error(`${contexto}: creado_en no es Timestamp.`);
}

async function clasificarFotos(db: Firestore): Promise<FotoLeida[]> {
    const snap = await db.collection(COLECCION_FOTOS).get();
    const fotos: FotoLeida[] = [];

    for (const doc of snap.docs) {
        const data = doc.data();
        const conteoId = exigirTexto(data.conteo_id, `${doc.id}.conteo_id`);
        if (doc.id !== conteoId) {
            throw new Error(
                `NAMING LOCK roto en ${doc.id}: docId != conteo_id (${conteoId}).`
            );
        }

        const asesorEmail = exigirTexto(
            data.asesor_email,
            `${doc.id}.asesor_email`
        );
        const creadoEn = fechaISO(data.creado_en, `${doc.id}.creado_en`);
        const mimeType = exigirTexto(data.mime_type, `${doc.id}.mime_type`);
        const tamanoBytes = exigirNumero(
            data.tamano_bytes,
            `${doc.id}.tamano_bytes`
        );

        const padre = await db.collection(COLECCION_CONTEOS).doc(conteoId).get();
        const clasificacion = padre.exists ? 'CON_PADRE' : 'HUERFANO';

        fotos.push({
            docId: doc.id,
            conteoId,
            asesorEmail,
            creadoEn,
            mimeType,
            tamanoBytes,
            data,
            clasificacion,
        });
    }

    return fotos;
}

function imprimirFotos(fotos: FotoLeida[]): void {
    console.log('\nDocumentos en fotos_inventario:');
    for (const foto of fotos) {
        console.log(
            JSON.stringify(
                {
                    docId: foto.docId,
                    conteo_id: foto.conteoId,
                    asesor_email: foto.asesorEmail,
                    creado_en: foto.creadoEn,
                    mime_type: foto.mimeType,
                    tamano_bytes: foto.tamanoBytes,
                    clasificacion: foto.clasificacion,
                },
                null,
                2
            )
        );
    }
}

function imprimirDiagnosticoH1(): void {
    console.log('\nDiagnóstico H-1 — causa raíz:');
    console.log(
        'No fue un bug de ejecución de purge-web038-test-data.ts. Fue una ' +
            'decisión de alcance del ticket anterior: fotos_inventario se ' +
            'incluyó en PROHIBIDAS y se fijó FOTOS_INVENTARIO_BASELINE=3, ' +
            'con la instrucción explícita "sin fotos_inventario en el borrado".'
    );
    console.log(
        'Consecuencia: la purga de 19 docs dejó los 3 metadatos de fotos ' +
            'sin padre. La decisión fue consciente, pero contradictoria con ' +
            'el objetivo del Director de purgar todo el residuo de prueba.'
    );
}

function validarCertificado(fotos: FotoLeida[]): void {
    const certificadas = new Set<string>(FOTOS_HUERFANAS_CERTIFICADAS);
    const presentes = new Set(fotos.map((foto) => foto.docId));

    if (fotos.length === 0) {
        return;
    }

    if (fotos.length !== certificadas.size) {
        throw new Error(
            `fotos_inventario: se esperaban ${certificadas.size} huérfanas ` +
                `certificadas, encontradas ${fotos.length}. Abortando.`
        );
    }

    for (const foto of fotos) {
        if (!certificadas.has(foto.docId)) {
            throw new Error(
                `Foto no certificada: ${foto.docId}. Abortando con cero escrituras.`
            );
        }
        if (foto.clasificacion !== 'HUERFANO') {
            throw new Error(
                `Foto ${foto.docId} tiene padre en ${COLECCION_CONTEOS}. ` +
                    'No se puede borrar. Abortando.'
            );
        }
    }

    for (const id of certificadas) {
        if (!presentes.has(id)) {
            throw new Error(
                `Falta la foto certificada ${id}. Abortando con cero escrituras.`
            );
        }
    }
}

async function validarColeccionesEnCero(db: Firestore): Promise<void> {
    for (const coleccion of COLECCIONES_WEB038) {
        const snap = await db.collection(coleccion).count().get();
        if (snap.data().count !== 0) {
            throw new Error(
                `${coleccion}: se esperaba 0, encontrado ${snap.data().count}.`
            );
        }
    }
}

async function validarFase9(db: Firestore): Promise<Record<string, number>> {
    const conteos: Record<string, number> = {};
    for (const [coleccion, esperado] of Object.entries(FASE9_BASELINE)) {
        const snap = await db.collection(coleccion).count().get();
        const actual = snap.data().count;
        if (actual !== esperado) {
            throw new Error(
                `Fase 9 ${coleccion}: se esperaba ${esperado}, encontrado ${actual}.`
            );
        }
        conteos[coleccion] = actual;
    }
    return conteos;
}

async function modoDryRun(db: Firestore): Promise<void> {
    const fotos = await clasificarFotos(db);
    imprimirFotos(fotos);

    const huerfanas = fotos.filter((foto) => foto.clasificacion === 'HUERFANO');
    const conPadre = fotos.filter((foto) => foto.clasificacion === 'CON_PADRE');

    console.log('\nResumen:');
    console.log(`- Total: ${fotos.length}`);
    console.log(`- Huérfanas: ${huerfanas.length}`);
    console.log(`- Con padre: ${conPadre.length}`);

    imprimirDiagnosticoH1();

    await validarColeccionesEnCero(db);
    const fase9 = await validarFase9(db);
    console.log('\nFase 9 (solo count, sin escritura):');
    for (const [coleccion, total] of Object.entries(fase9)) {
        console.log(`- ${coleccion}: ${total}`);
    }

    console.log('\nDRY-RUN: cero escrituras.');
    console.log(
        'El apply requiere --mode=purge-apply --yes y autorización explícita ' +
            'del Auditor sobre este dry-run.'
    );
}

async function modoApply(db: Firestore): Promise<void> {
    const fotos = await clasificarFotos(db);
    imprimirFotos(fotos);

    const huerfanas = fotos.filter((foto) => foto.clasificacion === 'HUERFANO');
    const conPadre = fotos.filter((foto) => foto.clasificacion === 'CON_PADRE');
    console.log(
        `\nResumen: total=${fotos.length}, huérfanas=${huerfanas.length}, con_padre=${conPadre.length}`
    );

    if (fotos.length === 0) {
        console.log(
            `\nApply: 0 borrados, ${FOTOS_HUERFANAS_CERTIFICADAS.length} omitidos (no existentes).`
        );
        return;
    }

    validarCertificado(fotos);
    await validarColeccionesEnCero(db);
    await validarFase9(db);

    const backup = {
        projectId: PROJECT_ID,
        exportadoEn: new Date().toISOString(),
        coleccion: COLECCION_FOTOS,
        documentos: fotos.map((foto) => ({
            docId: foto.docId,
            data: foto.data,
        })),
    };

    writeFileSync(BACKUP_PATH, JSON.stringify(backup, null, 2));
    console.log(`\nBackup local: ${BACKUP_PATH}`);

    const batch = db.batch();
    for (const foto of fotos) {
        batch.delete(db.collection(COLECCION_FOTOS).doc(foto.docId));
    }
    await batch.commit();

    console.log(
        `\nApply: ${fotos.length} borrados, 0 omitidos. ` +
            'Solo se borraron metadatos HUÉRFANO; Storage no fue tocado.'
    );
}

async function modoVerify(db: Firestore): Promise<void> {
    const fotos = await clasificarFotos(db);

    console.log(`\nfotos_inventario restantes: ${fotos.length}`);
    console.log('Esperado (CON_PADRE del dry-run certificado): 0');
    if (fotos.length !== 0) {
        throw new Error(
            `fotos_inventario: quedan ${fotos.length} documentos; ` +
                'se esperaban 0.'
        );
    }

    const certificadas = new Set<string>(FOTOS_HUERFANAS_CERTIFICADAS);
    for (const foto of fotos) {
        if (certificadas.has(foto.docId)) {
            throw new Error(
                `Sobrevivió la foto huérfana certificada ${foto.docId}.`
            );
        }
    }

    await validarColeccionesEnCero(db);
    const fase9 = await validarFase9(db);
    console.log('\nFase 9 (post-purga):');
    for (const [coleccion, total] of Object.entries(fase9)) {
        console.log(`- ${coleccion}: ${total}`);
    }

    if (!existsSync(BACKUP_PATH)) {
        throw new Error(`No existe el backup ${BACKUP_PATH}.`);
    }
    const backup = JSON.parse(readFileSync(BACKUP_PATH, 'utf8')) as {
        documentos?: unknown[];
    };
    if (!Array.isArray(backup.documentos) || backup.documentos.length !== 3) {
        throw new Error('Backup inválido o incompleto.');
    }
    console.log(`\nBackup íntegro: ${BACKUP_PATH} (3 documentos).`);

    console.log('\nVERIFY OK: fotos huérfanas en 0, WEB-038 en 0, Fase 9 intacta.');
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
    console.error('[purge-web038-fotos] Falló:', error);
    process.exit(1);
});
