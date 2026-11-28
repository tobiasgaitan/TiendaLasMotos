/**
 * WEB-INV-053 — Seed y verificación de las categorías canónicas (opción A).
 *
 * Bajo la opción A los seis valores existentes de `inventario_repuestos` son
 * canónicos: el script crea/verifica la colección `categorias_repuestos` y NO
 * reescribe los documentos de inventario.
 *
 * Uso:
 *   npx tsx scripts/inv-053-categorias.ts --dry-run
 *   npx tsx scripts/inv-053-categorias.ts --apply --authorized-by=<email>
 *   npx tsx scripts/inv-053-categorias.ts --verify
 *
 * `--out` es opcional y por defecto apunta a un directorio temporal fuera del
 * repositorio. `--apply` exige TTY, confirmación exacta y `--authorized-by`.
 */
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { getFirestore } from 'firebase-admin/firestore';
import type {
    DocumentSnapshot,
    QueryDocumentSnapshot,
} from 'firebase-admin/firestore';
import {
    assertOutDirOutsideRepo,
    initFirebaseGuarded,
    requireConfirmation,
    writeManifestAndReport,
} from './lib/forensic-utils';
import {
    CATEGORIAS_CANONICAS_V1,
    NOMBRES_CANONICOS_V1,
} from '../src/lib/inventario/categorias-canonicas';
import { claveCategoria } from '../src/lib/inventario/categorias';

const TICKET = 'WEB-INV-053';
const PROJECT_ID = 'tiendalasmotos';
const COLECCION_CATEGORIAS = 'categorias_repuestos';
const COLECCION_INVENTARIO = 'inventario_repuestos';
const COLECCION_LEDGER = 'historial_auditoria_inventario';
const PAGE_SIZE = 500;

type Modo = 'dry-run' | 'apply' | 'verify';

const USAGE = [
    'Uso:',
    '  npx tsx scripts/inv-053-categorias.ts --dry-run [--out=<fuera-del-repo>]',
    '  npx tsx scripts/inv-053-categorias.ts --apply --authorized-by=<email> [--out=...]',
    '  npx tsx scripts/inv-053-categorias.ts --verify [--out=...]',
].join('\n');

interface CliOptions {
    modo: Modo;
    outDir: string;
    authorizedBy: string | null;
}

interface ValorInventario {
    valor: string;
    documentos: number;
}

interface Reporte {
    ticket: string;
    proyecto: string;
    modo: Modo;
    ejecutado_en: string;
    autorizado_por: string | null;
    inventario: {
        total: number;
        valores: ValorInventario[];
        vacios: number;
        desconocidos: ValorInventario[];
    };
    categorias_existentes: string[];
    categorias_faltantes: string[];
    categorias_con_nombre_distinto: string[];
    categorias_obsoletas: string[];
    sembradas: string[];
    inventario_actualizado: number;
    verificacion: {
        total: number;
        normalizados: number;
        huerfanos: number;
        detalle_huerfanos: ValorInventario[];
    };
}

function parseArgs(argv: string[]): CliOptions {
    let apply = false;
    let verify = false;
    let outDir = join(tmpdir(), `inv-053-categorias-${Date.now()}`);
    let authorizedBy: string | null = null;

    for (const raw of argv) {
        if (raw === '--apply') {
            apply = true;
            continue;
        }
        if (raw === '--verify') {
            verify = true;
            continue;
        }
        if (raw === '--dry-run') {
            apply = false;
            verify = false;
            continue;
        }
        if (raw.startsWith('--out=')) {
            outDir = raw.slice('--out='.length);
            continue;
        }
        if (raw.startsWith('--authorized-by=')) {
            const value = raw.slice('--authorized-by='.length).trim();
            authorizedBy = value || null;
            continue;
        }
        if (raw === '--help' || raw === '-h') {
            console.log(USAGE);
            process.exit(0);
        }
        throw new Error(`ARGUMENTO_NO_RECONOCIDO: ${raw}`);
    }

    if (apply && verify) {
        throw new Error('MODO_AMBIGUO: --apply y --verify son excluyentes.');
    }

    return {
        modo: verify ? 'verify' : apply ? 'apply' : 'dry-run',
        outDir,
        authorizedBy,
    };
}

function esEmail(valor: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valor);
}

async function leerCategoriasInventario(
    db: ReturnType<typeof getFirestore>
): Promise<{ total: number; conteos: Map<string, number> }> {
    const conteos = new Map<string, number>();
    let total = 0;
    let cursor: QueryDocumentSnapshot | null = null;

    for (;;) {
        let query = db
            .collection(COLECCION_INVENTARIO)
            .select('categoria')
            .orderBy('__name__')
            .limit(PAGE_SIZE);

        if (cursor) {
            query = query.startAfter(cursor);
        }

        const snap = await query.get();
        for (const doc of snap.docs) {
            const data = doc.data();
            const valor =
                typeof data.categoria === 'string'
                    ? data.categoria.trim()
                    : '';
            conteos.set(valor, (conteos.get(valor) ?? 0) + 1);
            total += 1;
        }

        if (snap.size < PAGE_SIZE) break;
        cursor = snap.docs[snap.size - 1] ?? null;
        if (!cursor) break;
    }

    return { total, conteos };
}

async function leerCategoriasCanonicas(
    db: ReturnType<typeof getFirestore>
): Promise<Map<string, DocumentSnapshot>> {
    const snap = await db.collection(COLECCION_CATEGORIAS).get();
    const mapa = new Map<string, DocumentSnapshot>();
    for (const doc of snap.docs) {
        mapa.set(doc.id, doc);
    }
    return mapa;
}

function ordenarValores(
    conteos: Map<string, number>,
    filtro: (valor: string) => boolean
): ValorInventario[] {
    return [...conteos.entries()]
        .filter(([valor]) => filtro(valor))
        .map(([valor, documentos]) => ({ valor, documentos }))
        .sort(
            (a, b) =>
                b.documentos - a.documentos || a.valor.localeCompare(b.valor)
        );
}

function construirReporte(
    modo: Modo,
    authorizedBy: string | null,
    total: number,
    conteos: Map<string, number>,
    canonicas: Map<string, DocumentSnapshot>,
    sembradas: string[],
    inventarioActualizado: number
): Reporte {
    const valores = ordenarValores(conteos, () => true);
    const vacios = conteos.get('') ?? 0;
    const desconocidos = ordenarValores(
        conteos,
        (valor) => valor !== '' && !NOMBRES_CANONICOS_V1.includes(valor)
    );

    const faltantes: string[] = [];
    const nombreDistinto: string[] = [];
    for (const seed of CATEGORIAS_CANONICAS_V1) {
        const clave = claveCategoria(seed.nombre);
        const doc = canonicas.get(clave);
        if (!doc) {
            faltantes.push(seed.nombre);
            continue;
        }
        const data = doc.data() ?? {};
        if (
            typeof data.nombre !== 'string' ||
            data.nombre.trim().toUpperCase() !== seed.nombre
        ) {
            nombreDistinto.push(seed.nombre);
        }
    }

    const nombresCanonicos = new Set(NOMBRES_CANONICOS_V1);
    const resolubles = new Set<string>();
    for (const doc of canonicas.values()) {
        const data = doc.data() ?? {};
        const nombre =
            typeof data.nombre === 'string'
                ? data.nombre.trim().toUpperCase()
                : '';
        if (nombresCanonicos.has(nombre)) {
            resolubles.add(nombre);
        }
    }

    const obsoletas = [...canonicas.values()]
        .filter((doc) => {
            const data = doc.data() ?? {};
            const nombre =
                typeof data.nombre === 'string'
                    ? data.nombre.trim().toUpperCase()
                    : '';
            return !nombresCanonicos.has(nombre);
        })
        .map((doc) => {
            const data = doc.data() ?? {};
            return typeof data.nombre === 'string'
                ? data.nombre
                : doc.id;
        })
        .sort((a, b) => a.localeCompare(b));

    const esEstricto = modo !== 'dry-run';
    const detalleHuerfanos = ordenarValores(
        conteos,
        (valor) =>
            valor === '' ||
            !nombresCanonicos.has(valor) ||
            (esEstricto && !resolubles.has(valor))
    );
    const normalizados = total - detalleHuerfanos.reduce(
        (acumulado, fila) => acumulado + fila.documentos,
        0
    );
    const huerfanos = detalleHuerfanos.reduce(
        (acumulado, fila) => acumulado + fila.documentos,
        0
    );

    return {
        ticket: TICKET,
        proyecto: PROJECT_ID,
        modo,
        ejecutado_en: new Date().toISOString(),
        autorizado_por: authorizedBy,
        inventario: {
            total,
            valores,
            vacios,
            desconocidos,
        },
        categorias_existentes: [...canonicas.keys()].sort(),
        categorias_faltantes: faltantes,
        categorias_con_nombre_distinto: nombreDistinto,
        categorias_obsoletas: obsoletas,
        sembradas,
        inventario_actualizado: inventarioActualizado,
        verificacion: {
            total,
            normalizados,
            huerfanos,
            detalle_huerfanos: detalleHuerfanos,
        },
    };
}

function renderReporte(reporte: Reporte): string {
    const lineas: string[] = [];
    lineas.push(`# ${TICKET} — ${reporte.modo.toUpperCase()}`);
    lineas.push('');
    lineas.push(`- Proyecto: \`${reporte.proyecto}\``);
    lineas.push(`- Ejecutado: ${reporte.ejecutado_en}`);
    lineas.push(
        `- Autorizado por: ${reporte.autorizado_por ?? 'N/A (modo seguro)'}`
    );
    lineas.push('');
    lineas.push('## Inventario');
    lineas.push('');
    lineas.push('| Valor | Documentos |');
    lineas.push('|---|---:|');
    for (const fila of reporte.inventario.valores) {
        lineas.push(
            `| ${fila.valor === '' ? '(vacío)' : fila.valor} | ${fila.documentos} |`
        );
    }
    lineas.push('');
    lineas.push(
        `- Total: **${reporte.inventario.total}** · Vacíos: **${reporte.inventario.vacios}** · Desconocidos: **${reporte.inventario.desconocidos.length}**`
    );
    lineas.push('');
    lineas.push('## Categorías');
    lineas.push('');
    lineas.push(
        `- Existentes (${reporte.categorias_existentes.length}): ${reporte.categorias_existentes.join(', ') || '—'}`
    );
    lineas.push(
        `- Faltantes (${reporte.categorias_faltantes.length}): ${reporte.categorias_faltantes.join(', ') || '—'}`
    );
    lineas.push(
        `- Con nombre distinto (${reporte.categorias_con_nombre_distinto.length}): ${reporte.categorias_con_nombre_distinto.join(', ') || '—'}`
    );
    lineas.push(
        `- Obsoletas/no canónicas (${reporte.categorias_obsoletas.length}): ${reporte.categorias_obsoletas.join(', ') || '—'}`
    );
    lineas.push(
        `- Sembradas en esta corrida (${reporte.sembradas.length}): ${reporte.sembradas.join(', ') || '—'}`
    );
    lineas.push(
        `- Updates de inventario: **${reporte.inventario_actualizado}**`
    );
    lineas.push('');
    lineas.push('## Verificación');
    lineas.push('');
    lineas.push(
        reporte.modo === 'dry-run'
            ? '> Proyección tras el seed: los valores canónicos cuentan como resolubles aunque la colección aún esté vacía.'
            : '> Verificación estricta: cada documento debe apuntar a una categoría existente.'
    );
    lineas.push('');
    lineas.push(
        `- Normalizados: **${reporte.verificacion.normalizados}/${reporte.verificacion.total}**`
    );
    lineas.push(
        `- ${
            reporte.modo === 'dry-run'
                ? 'Huérfanos proyectados'
                : 'Huérfanos'
        }: **${reporte.verificacion.huerfanos}**`
    );
    if (reporte.verificacion.detalle_huerfanos.length > 0) {
        lineas.push('');
        lineas.push('| Huérfano | Documentos |');
        lineas.push('|---|---:|');
        for (const fila of reporte.verificacion.detalle_huerfanos) {
            lineas.push(
                `| ${fila.valor === '' ? '(vacío)' : fila.valor} | ${fila.documentos} |`
            );
        }
    }
    lineas.push('');
    return lineas.join('\n');
}

async function sembrarCategorias(
    db: ReturnType<typeof getFirestore>,
    existentes: Map<string, DocumentSnapshot>,
    authorizedBy: string
): Promise<string[]> {
    const faltantes = CATEGORIAS_CANONICAS_V1.filter((seed) => {
        const doc = existentes.get(claveCategoria(seed.nombre));
        if (!doc) return true;
        const data = doc.data() ?? {};
        const nombre =
            typeof data.nombre === 'string'
                ? data.nombre.trim().toUpperCase()
                : '';
        if (nombre !== seed.nombre) {
            throw new Error(
                `CATEGORIA_CONFLICTO: ${claveCategoria(seed.nombre)} existe con nombre "${nombre}" (esperado "${seed.nombre}").`
            );
        }
        return false;
    });

    if (faltantes.length === 0) return [];

    const batch = db.batch();
    const ahora = new Date();
    const sembradas: string[] = [];

    for (const seed of faltantes) {
        const clave = claveCategoria(seed.nombre);
        const categoriaRef = db.collection(COLECCION_CATEGORIAS).doc(clave);
        const ledgerRef = db.collection(COLECCION_LEDGER).doc();
        const payload = {
            clave,
            nombre: seed.nombre,
            descripcion: seed.descripcion,
            orden: seed.orden,
            activo: true,
            creado_por: authorizedBy,
            creado_en: ahora,
            actualizado_por: authorizedBy,
            actualizado_en: ahora,
            version: 1,
        };

        batch.create(categoriaRef, payload);
        batch.create(ledgerRef, {
            coleccion_afectada: 'categorias_repuestos',
            documento_id: clave,
            referencia: null,
            conteo_id: null,
            operacion: 'CREATE',
            datos_anteriores: null,
            datos_nuevos: payload,
            campos_modificados: Object.keys(payload),
            registrado_por: `script:${TICKET}`,
            registrado_por_email: authorizedBy,
            creado_en: ahora,
            version: 1,
        });
        sembradas.push(seed.nombre);
    }

    await batch.commit();
    return sembradas;
}

async function main(): Promise<void> {
    const opciones = parseArgs(process.argv.slice(2));
    const outDir = assertOutDirOutsideRepo(opciones.outDir);

    if (opciones.modo === 'apply') {
        if (!opciones.authorizedBy || !esEmail(opciones.authorizedBy)) {
            throw new Error(
                'AUTORIZACION_REQUERIDA: --apply exige --authorized-by=<email>.'
            );
        }
        const autorizado = await requireConfirmation(
            `Se sembrarán las categorías canónicas de ${TICKET} en el proyecto compartido ${PROJECT_ID}.`,
            'CONFIRMAR'
        );
        if (!autorizado) {
            console.error('Operación cancelada por el operador.');
            return;
        }
    }

    const { db } = initFirebaseGuarded({
        outDir,
        projectId: PROJECT_ID,
    });

    const antes = await leerCategoriasCanonicas(db);
    const inventario = await leerCategoriasInventario(db);

    let sembradas: string[] = [];
    let inventarioActualizado = 0;

    if (opciones.modo === 'apply') {
        sembradas = await sembrarCategorias(
            db,
            antes,
            opciones.authorizedBy as string
        );
        const despues = await leerCategoriasCanonicas(db);
        const inventarioDespues = await leerCategoriasInventario(db);
        if (inventarioDespues.total !== inventario.total) {
            throw new Error(
                'INVENTARIO_MUTADO: el total de repuestos cambió durante el seed.'
            );
        }
        inventarioActualizado = 0;

        const reporte = construirReporte(
            opciones.modo,
            opciones.authorizedBy,
            inventarioDespues.total,
            inventarioDespues.conteos,
            despues,
            sembradas,
            inventarioActualizado
        );

        writeManifestAndReport(
            outDir,
            'reporte.json',
            reporte,
            renderReporte(reporte),
            {},
            {
                ticket: TICKET,
                proyecto: PROJECT_ID,
                modo: opciones.modo,
                autorizado_por: opciones.authorizedBy,
                whitelist: NOMBRES_CANONICOS_V1,
            }
        );

        console.log(renderReporte(reporte));
        if (reporte.verificacion.huerfanos > 0) {
            console.error(
                `\nHUÉRFANOS: ${reporte.verificacion.huerfanos} documento(s) sin categoría canónica.`
            );
            process.exitCode = 1;
        }
        return;
    }

    const reporte = construirReporte(
        opciones.modo,
        opciones.authorizedBy,
        inventario.total,
        inventario.conteos,
        antes,
        sembradas,
        inventarioActualizado
    );

    writeManifestAndReport(
        outDir,
        'reporte.json',
        reporte,
        renderReporte(reporte),
        {},
        {
            ticket: TICKET,
            proyecto: PROJECT_ID,
            modo: opciones.modo,
            autorizado_por: opciones.authorizedBy,
            whitelist: NOMBRES_CANONICOS_V1,
        }
    );

    console.log(renderReporte(reporte));
    console.log(`\nEvidencia escrita en: ${outDir}`);

    if (opciones.modo === 'dry-run') {
        console.log(
            `Plan: sembrar ${reporte.categorias_faltantes.length} categoría(s), 0 updates de inventario.`
        );
        if (reporte.inventario.desconocidos.length > 0) {
            console.error(
                '\nBLOQUEO: hay valores de categoría fuera de la whitelist. Resuélvelos con el Director antes de aplicar.'
            );
            process.exitCode = 1;
        }
        return;
    }

    if (reporte.verificacion.huerfanos > 0) {
        console.error(
            `\nVERIFICACIÓN FALLIDA: ${reporte.verificacion.huerfanos} documento(s) huérfano(s).`
        );
        process.exitCode = 1;
        return;
    }

    console.log(
        `\nVERIFICACIÓN OK: ${reporte.verificacion.normalizados}/${reporte.verificacion.total} normalizados.`
    );
}

main().catch((error: unknown) => {
    console.error(
        `[${TICKET}] Error fatal:`,
        error instanceof Error ? error.message : error
    );
    process.exitCode = 1;
});
