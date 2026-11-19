/**
 * WEB-INV-INGESTA-002-F2 — Rollback por manifiesto.
 *
 * Borra únicamente los documento_id listados en final-manifest.json, en
 * batches de 100. Verifica que el import_key actual coincida con el del
 * manifiesto. NUNCA toca historial_auditoria_inventario: el ledger es
 * append-only.
 *
 * Uso:
 *   npx tsx scripts/inv-ingesta-rollback.ts \
 *     --manifest=<final-manifest.json> \
 *     --project=tiendalasmotos --environment=beta \
 *     [--apply --confirm="ROLLBACK WEB-INV-INGESTA-002-F2 EN BETA"]
 */
import {
    existsSync,
    mkdirSync,
    readFileSync,
    writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import {
    assertOutDirOutsideRepo,
    initFirebaseGuarded,
} from './lib/forensic-utils';
import {
    IngestaError,
    sha256Archivo,
} from './lib/inv-ingesta-source';
import {
    BATCH_SIZE,
    CONFIRM_ROLLBACK,
    ENVIRONMENT,
    PROJECT_ID,
    TICKET,
    clasificarRollback,
    type DocumentoActualRollback,
    type DocumentoManifiesto,
} from './lib/inv-ingesta-apply-utils';

interface BatchManifestResumen {
    index: number;
    documentos: Array<{
        documento_id: string;
        import_key: string;
    }>;
}

interface FinalManifest {
    ticket: string;
    run_id: string;
    project: string;
    environment: string;
    status: string;
    batches: BatchManifestResumen[];
}

interface Opciones {
    manifest: string;
    outDir: string;
    projectId: string;
    environment: string;
    aplicar: boolean;
}

function parseArgs(argv: string[]): Opciones {
    let manifest = '';
    let outDir = '';
    let projectId = '';
    let environment = '';
    let aplicar = false;
    let confirmacion = '';

    for (const arg of argv) {
        if (!arg.startsWith('--')) continue;
        const [clave, valor = ''] = arg.slice(2).split('=', 2);

        if (clave === 'manifest') {
            manifest = valor.trim();
        } else if (clave === 'out') {
            outDir = valor.trim();
        } else if (clave === 'project') {
            projectId = valor.trim();
        } else if (clave === 'environment') {
            environment = valor.trim();
        } else if (clave === 'apply') {
            aplicar = true;
        } else if (clave === 'confirm') {
            confirmacion = valor;
        } else {
            throw new IngestaError(
                'FLAG_DESCONOCIDA',
                `Flag desconocida: --${clave}`
            );
        }
    }

    if (!manifest) {
        throw new IngestaError('MANIFEST_REQUIRED', 'Falta --manifest');
    }
    if (!projectId) throw new IngestaError('PROJECT_REQUIRED', 'Falta --project');
    if (!environment) {
        throw new IngestaError('ENVIRONMENT_REQUIRED', 'Falta --environment');
    }
    if (projectId !== PROJECT_ID) {
        throw new IngestaError(
            'PROJECT_NO_AUTORIZADO',
            `Proyecto ${projectId} != ${PROJECT_ID}`
        );
    }
    if (environment !== ENVIRONMENT) {
        throw new IngestaError(
            'ENVIRONMENT_NO_AUTORIZADO',
            `Entorno ${environment} != ${ENVIRONMENT}`
        );
    }

    if (aplicar && confirmacion !== CONFIRM_ROLLBACK) {
        console.warn(
            'ROLLBACK_SOLICITADO_SIN_CONFIRMACION=DRY_RUN (frase exacta requerida)'
        );
        aplicar = false;
    }

    if (!outDir) {
        const runDir = dirname(manifest);
        outDir = join(
            runDir,
            `rollback-${new Date().toISOString().replace(/[:.]/g, '-')}`
        );
    }

    return { manifest, outDir, projectId, environment, aplicar };
}

function leerJson<T>(ruta: string): T {
    return JSON.parse(readFileSync(ruta, 'utf8')) as T;
}

function escribirJson(outDir: string, nombre: string, valor: unknown): string {
    mkdirSync(outDir, { recursive: true });
    const ruta = join(outDir, nombre);
    writeFileSync(ruta, `${JSON.stringify(valor, null, 2)}\n`, 'utf8');
    return ruta;
}

function escribirTexto(outDir: string, nombre: string, texto: string): string {
    mkdirSync(outDir, { recursive: true });
    const ruta = join(outDir, nombre);
    writeFileSync(ruta, `${texto}\n`, 'utf8');
    return ruta;
}

function verificarSidecar(manifestPath: string): void {
    const sidecar = manifestPath.replace(/\.json$/i, '.sha256');
    if (!existsSync(sidecar)) return;
    const esperado = readFileSync(sidecar, 'utf8').trim();
    const obtenido = sha256Archivo(manifestPath);
    if (esperado !== obtenido) {
        throw new IngestaError(
            'MANIFEST_HASH_MISMATCH',
            `Hash del manifiesto no coincide: ${obtenido} != ${esperado}`
        );
    }
}

async function contar(
    db: ReturnType<typeof initFirebaseGuarded>['db'],
    coleccion: string,
    campo?: string,
    valor?: string
): Promise<number> {
    let query = db.collection(coleccion);
    if (campo && valor !== undefined) {
        query = query.where(campo, '==', valor) as typeof query;
    }
    const snap = await query.count().get();
    return snap.data().count;
}

async function leerActuales(
    db: ReturnType<typeof initFirebaseGuarded>['db'],
    documentos: readonly DocumentoManifiesto[]
): Promise<DocumentoActualRollback[]> {
    return Promise.all(
        documentos.map(async (documento) => {
            const snap = await db
                .collection('inventario_repuestos')
                .doc(documento.documento_id)
                .get();
            const importKey = snap.get('import_key');
            return {
                documento_id: documento.documento_id,
                exists: snap.exists,
                import_key:
                    typeof importKey === 'string' ? importKey : null,
            };
        })
    );
}

async function main(): Promise<void> {
    const opciones = parseArgs(process.argv.slice(2));
    const outDir = assertOutDirOutsideRepo(opciones.outDir);
    const log: string[] = [];
    const logLine = (linea: string): void => {
        console.log(linea);
        log.push(linea);
    };

    if (!existsSync(opciones.manifest)) {
        throw new IngestaError('MANIFEST_NOT_FOUND', opciones.manifest);
    }
    verificarSidecar(opciones.manifest);

    const manifest = leerJson<FinalManifest>(opciones.manifest);
    if (manifest.ticket !== TICKET) {
        throw new IngestaError(
            'MANIFEST_TICKET_MISMATCH',
            `Ticket ${manifest.ticket} != ${TICKET}`
        );
    }
    if (
        !Array.isArray(manifest.batches) ||
        (manifest.status !== 'PASS' && manifest.status !== 'FAIL')
    ) {
        throw new IngestaError(
            'MANIFEST_NO_ROLLBACK',
            `El manifiesto no es rollbackable: status=${manifest.status}`
        );
    }
    if (
        manifest.project !== opciones.projectId ||
        manifest.environment !== opciones.environment
    ) {
        throw new IngestaError(
            'MANIFEST_ENTORNO_MISMATCH',
            'El manifiesto no pertenece al proyecto/entorno solicitado.'
        );
    }

    const { db } = initFirebaseGuarded({
        outDir,
        projectId: opciones.projectId,
    });

    const ledgerCreateAntes = await contar(
        db,
        'historial_auditoria_inventario',
        'operacion',
        'CREATE'
    );

    const rollbackBatches: Array<{
        index: number;
        documentos: number;
        deletes: number;
        missing: number;
        mismatches: number;
        sha256: string;
    }> = [];

    let totalDeletes = 0;
    let totalMissing = 0;
    let totalMismatches = 0;

    for (const batch of manifest.batches) {
        const documentos: DocumentoManifiesto[] = batch.documentos.map(
            (documento) => ({
                documento_id: documento.documento_id,
                import_key: documento.import_key,
            })
        );
        if (documentos.length > BATCH_SIZE) {
            throw new IngestaError(
                'BATCH_MANIFEST_INVALIDO',
                `Batch ${batch.index} tiene ${documentos.length} > ${BATCH_SIZE}`
            );
        }

        const actuales = await leerActuales(db, documentos);
        const resultado = clasificarRollback(documentos, actuales);

        if (resultado.mismatches.length > 0) {
            escribirJson(outDir, 'rollback-preflight.json', {
                ticket: TICKET,
                run_id: manifest.run_id,
                batch_index: batch.index,
                mismatches: resultado.mismatches,
                status: 'FAIL',
            });
            escribirTexto(outDir, 'run.log', log.join('\n'));
            throw new IngestaError(
                'ROLLBACK_IMPORT_KEY_MISMATCH',
                `Batch ${batch.index}: ${resultado.mismatches.length} import_key no coinciden.`
            );
        }

        totalDeletes += resultado.deletes.length;
        totalMissing += resultado.missing.length;

        if (opciones.aplicar && resultado.deletes.length > 0) {
            const writeBatch = db.batch();
            for (const documentoId of resultado.deletes) {
                writeBatch.delete(
                    db.collection('inventario_repuestos').doc(documentoId)
                );
            }
            await writeBatch.commit();
        }

        const base = {
            ticket: TICKET,
            run_id: manifest.run_id,
            batch_index: batch.index,
            documentos: documentos.length,
            deletes: resultado.deletes,
            missing: resultado.missing,
            mismatches: resultado.mismatches,
            ledger_writes: 0,
            applied: opciones.aplicar,
            status: 'PASS',
        };
        const fileName = `rollback-batch-${String(batch.index).padStart(
            4,
            '0'
        )}.json`;
        const filePath = escribirJson(outDir, fileName, base);
        const fileHash = sha256Archivo(filePath);
        escribirTexto(outDir, `${fileName}.sha256`, fileHash);

        rollbackBatches.push({
            index: batch.index,
            documentos: documentos.length,
            deletes: resultado.deletes.length,
            missing: resultado.missing.length,
            mismatches: resultado.mismatches.length,
            sha256: fileHash,
        });
        logLine(
            `ROLLBACK_BATCH=${batch.index}/${manifest.batches.length} deletes=${resultado.deletes.length} missing=${resultado.missing.length} ledger_writes=0`
        );
    }

    const inventarioDespues = await contar(db, 'inventario_repuestos');
    const ledgerCreateDespues = await contar(
        db,
        'historial_auditoria_inventario',
        'operacion',
        'CREATE'
    );
    const ledgerSinCambios = ledgerCreateDespues === ledgerCreateAntes;

    const gates = {
        DOCS_A_BORRAR: totalDeletes,
        DOCS_MISSING: totalMissing,
        IMPORT_KEY_MISMATCH: totalMismatches,
        INVENTARIO_DESPUES: inventarioDespues,
        LEDGER_CREATE_ANTES: ledgerCreateAntes,
        LEDGER_CREATE_DESPUES: ledgerCreateDespues,
        LEDGER_WRITES: 0,
        LEDGER_SIN_CAMBIOS: ledgerSinCambios,
    };

    const finalPath = escribirJson(outDir, 'rollback-manifest.json', {
        ticket: TICKET,
        run_id: manifest.run_id,
        project: opciones.projectId,
        environment: opciones.environment,
        source_manifest: opciones.manifest,
        applied: opciones.aplicar,
        batches: rollbackBatches,
        gates,
        status: 'PASS',
    });
    const finalHash = sha256Archivo(finalPath);
    escribirTexto(outDir, 'rollback-manifest.sha256', finalHash);
    escribirJson(outDir, 'counts.json', {
        ...gates,
        rollback_manifest_sha256: finalHash,
    });
    escribirTexto(
        outDir,
        'report.md',
        [
            `# ${TICKET} — ROLLBACK`,
            '',
            `- Modo: ${opciones.aplicar ? 'APPLY' : 'DRY_RUN'}`,
            `- Documentos a borrar: ${totalDeletes}`,
            `- Missing: ${totalMissing}`,
            `- Mismatches: ${totalMismatches}`,
            `- Ledger CREATE antes: ${ledgerCreateAntes}`,
            `- Ledger CREATE después: ${ledgerCreateDespues}`,
            '- Ledger writes: 0',
            `- Rollback manifest SHA-256: ${finalHash}`,
        ].join('\n')
    );

    for (const [clave, valor] of Object.entries(gates)) {
        logLine(`${clave}=${valor}`);
    }
    logLine(`ROLLBACK_MANIFEST_SHA256=${finalHash}`);
    escribirTexto(outDir, 'run.log', log.join('\n'));

    if (!ledgerSinCambios || totalMismatches > 0) process.exit(1);
}

main().catch((error: unknown) => {
    const detalle =
        error instanceof IngestaError
            ? { code: error.code, message: error.message, detail: error.detail }
            : { message: error instanceof Error ? error.message : String(error) };
    console.error('ROLLBACK=FAIL');
    console.error(JSON.stringify(detalle, null, 2));
    process.exit(1);
});
