/**
 * WEB-INV-INGESTA-002-F2 — Apply controlado de 21.256 documentos.
 *
 * Requisitos:
 * - Revalida los hashes del run-7.
 * - Exige inventario vacío antes de escribir.
 * - D4-B strict-abort antes de cualquier write.
 * - 213 batches de 100 documentos, atómicos por batch.
 * - Un asiento CREATE de ledger por documento, en el mismo batch.
 * - Sin --apply o sin la confirmación exacta: DRY_RUN, cero writes.
 *
 * Uso:
 *   npx tsx scripts/inv-ingesta-apply.ts \
 *     --run-dir=<fuera-del-repo> --out=<fuera-del-repo> \
 *     --project=tiendalasmotos --environment=beta \
 *     [--apply --confirm="APLICAR WEB-INV-INGESTA-002-F2 EN BETA / FIRESTORE COMPARTIDO"]
 */
import {
    existsSync,
    mkdirSync,
    readFileSync,
    readdirSync,
    writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { Timestamp } from 'firebase-admin/firestore';
import {
    assertOutDirOutsideRepo,
    initFirebaseGuarded,
} from './lib/forensic-utils';
import {
    IngestaError,
    prepararCsv,
    sha256Archivo,
    sha256Json,
} from './lib/inv-ingesta-source';
import {
    MT5_DISPOSICIONES,
    aplicarDisposiciones,
    type ResultadoDisposiciones,
} from './lib/inv-ingesta-disposiciones';
import {
    parseInventarioRows,
    type DocumentoPropuesto,
    type FilaClasificada,
} from './lib/inv-ingesta-utils';
import {
    ACTOR_EMAIL,
    ACTOR_ID,
    BATCH_SIZE,
    CONFIRM_APPLY,
    ENVIRONMENT,
    EXPECTED_BATCHES,
    EXPECTED_CREATE,
    PROJECT_ID,
    TICKET,
    calcularBatches,
    clasificarD4B,
    construirPayloadDocumento,
    construirPayloadLedger,
    hashBatchManifest,
    hashPayloadDocumento,
    validarHashes,
    type DecisionD4B,
    type ExistenteD4B,
    type HashesIngesta,
} from './lib/inv-ingesta-apply-utils';

interface Opciones {
    runDir: string;
    outDir: string;
    projectId: string;
    environment: string;
    batchSize: number;
    aplicar: boolean;
    confirmacion: string;
}

interface DryRunEvidence {
    project?: string;
    status?: string;
    read_only?: boolean;
    source?: {
        sha256_antes?: string;
        filas_datos?: number;
        csv?: {
            sha256?: string;
            filas_csv?: number;
        };
    };
    parse?: {
        parse_hash?: string;
    };
    disposiciones?: {
        config_sha256?: string;
        resumen?: unknown;
    };
    gates?: Record<string, unknown>;
}

interface SnapshotEvidence {
    inventario_repuestos?: {
        total?: number;
        maestras_count?: number;
    };
    conteos_pendientes_repuestos?: {
        total?: number;
    };
    historial_auditoria_inventario?: {
        total?: number;
    };
}

interface DisposicionesEvidence {
    config_sha256?: string;
    resumen?: unknown;
}

interface Propuesta {
    fila: number;
    referencia: string;
    importKey: string;
    unidadMedida: string;
    documentoPropuesto: DocumentoPropuesto;
}

interface DocumentoBatch {
    documento_id: string;
    ledger_id: string;
    import_key: string;
    referencia: string;
    payload_hash: string;
}

interface BatchManifest {
    ticket: string;
    run_id: string;
    batch_index: number;
    first_row: number;
    last_row: number;
    documentos: DocumentoBatch[];
    writes: number;
    ledger_creates: number;
    source_sha256: string;
    config_sha256: string;
    parse_hash: string;
    committed_at: string;
    status: 'COMMITTED';
    batch_sha256: string;
}

function parseArgs(argv: string[]): Opciones {
    let runDir = '';
    let outDir = '';
    let projectId = '';
    let environment = '';
    let batchSize = BATCH_SIZE;
    let aplicar = false;
    let confirmacion = '';

    for (const arg of argv) {
        if (!arg.startsWith('--')) continue;
        const [clave, valor = ''] = arg.slice(2).split('=', 2);

        if (clave === 'run-dir') {
            runDir = valor.trim();
        } else if (clave === 'out') {
            outDir = valor.trim();
        } else if (clave === 'project') {
            projectId = valor.trim();
        } else if (clave === 'environment') {
            environment = valor.trim();
        } else if (clave === 'batch-size') {
            batchSize = Number(valor);
        } else if (clave === 'apply') {
            aplicar = true;
        } else if (clave === 'confirm') {
            confirmacion = valor;
        } else if (clave === 'd4b-adopt') {
            throw new IngestaError(
                'D4B_ADOPT_NO_CERTIFICADO',
                'La adopción D4-B no está certificada para esta ejecución.'
            );
        } else {
            throw new IngestaError(
                'FLAG_DESCONOCIDA',
                `Flag desconocida: --${clave}`
            );
        }
    }

    if (!runDir) throw new IngestaError('RUN_DIR_REQUIRED', 'Falta --run-dir');
    if (!outDir) throw new IngestaError('OUT_DIR_REQUIRED', 'Falta --out');
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
    if (batchSize !== BATCH_SIZE) {
        throw new IngestaError(
            'BATCH_SIZE_NO_CERTIFICADO',
            `Batch size ${batchSize} != ${BATCH_SIZE}`
        );
    }

    const applySolicitado = aplicar;
    if (applySolicitado && confirmacion !== CONFIRM_APPLY) {
        console.warn(
            'APPLY_SOLICITADO_SIN_CONFIRMACION=DRY_RUN (frase exacta requerida)'
        );
        aplicar = false;
    }

    return {
        runDir,
        outDir,
        projectId,
        environment,
        batchSize,
        aplicar,
        confirmacion,
    };
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

function localizarCsv(runDir: string): {
    csvPath: string;
    workDir: string;
} {
    const workDirs = readdirSync(runDir, { withFileTypes: true })
        .filter((entrada) => entrada.isDirectory() && entrada.name.startsWith('work-'))
        .map((entrada) => join(runDir, entrada.name));

    if (workDirs.length !== 1) {
        throw new IngestaError(
            'WORK_DIR_INVALIDO',
            `Se esperaba un work-* en ${runDir}; encontrados: ${workDirs.length}`
        );
    }

    const csvs = readdirSync(workDirs[0]).filter((archivo) =>
        archivo.toLowerCase().endsWith('.csv')
    );
    if (csvs.length !== 1) {
        throw new IngestaError(
            'CSV_INVALIDO',
            `Se esperaba un CSV en ${workDirs[0]}; encontrados: ${csvs.length}`
        );
    }

    return { csvPath: join(workDirs[0], csvs[0]), workDir: workDirs[0] };
}

function construirPropuestas(
    disposiciones: ResultadoDisposiciones,
    filas: readonly FilaClasificada[]
): Propuesta[] {
    const filasPorNumero = new Map(filas.map((fila) => [fila.fila, fila]));
    const propuestas: Propuesta[] = [];

    for (const fila of disposiciones.filas) {
        if (fila.disposicion !== 'CREATE') continue;

        if (!fila.documentoPropuesto || !fila.importKey) {
            throw new IngestaError(
                'CREATE_SIN_DOCUMENTO',
                `Fila ${fila.fila} CREATE sin documento o import_key`
            );
        }

        const original = filasPorNumero.get(fila.fila);
        if (!original) {
            throw new IngestaError(
                'FILA_NO_ENCONTRADA',
                `No se encontró la fila parseada ${fila.fila}`
            );
        }

        propuestas.push({
            fila: fila.fila,
            referencia: fila.referencia,
            importKey: fila.importKey,
            unidadMedida: original.unidadMedida,
            documentoPropuesto: fila.documentoPropuesto,
        });
    }

    return propuestas;
}

function contarColisiones(propuestas: readonly Propuesta[]): number {
    const vistos = new Set<string>();
    let colisiones = 0;
    for (const propuesta of propuestas) {
        if (vistos.has(propuesta.importKey)) colisiones += 1;
        vistos.add(propuesta.importKey);
    }
    return colisiones;
}

function resumenDecisiones(decisiones: readonly DecisionD4B[]): {
    create: number;
    idempotentes: number;
    reconciliables: number;
    ambiguos: number;
    detalle: Array<{ estado: string; documentoIds: string[]; motivo?: string }>;
} {
    const detalle: Array<{
        estado: string;
        documentoIds: string[];
        motivo?: string;
    }> = [];

    let create = 0;
    let idempotentes = 0;
    let reconciliables = 0;
    let ambiguos = 0;

    for (const decision of decisiones) {
        if (decision.estado === 'CREATE') create += 1;
        if (decision.estado === 'SKIP_IDEMPOTENTE') idempotentes += 1;
        if (decision.estado === 'D4B_RECONCILIABLE') reconciliables += 1;
        if (decision.estado === 'D4B_AMBIGUO') ambiguos += 1;

        if (decision.estado !== 'CREATE') {
            detalle.push({
                estado: decision.estado,
                documentoIds: decision.documentoIds,
                motivo: decision.motivo,
            });
        }
    }

    return { create, idempotentes, reconciliables, ambiguos, detalle };
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

function batchFileName(index: number): string {
    return `batch-${String(index).padStart(4, '0')}.json`;
}

async function main(): Promise<void> {
    const opciones = parseArgs(process.argv.slice(2));
    const outDir = assertOutDirOutsideRepo(opciones.outDir);
    const runDir = opciones.runDir;
    const log: string[] = [];

    const logLine = (linea: string): void => {
        console.log(linea);
        log.push(linea);
    };

    const dryRunPath = join(runDir, 'dry-run.json');
    const snapshotPath = join(runDir, 'snapshot.json');
    const disposicionesPath = join(runDir, 'disposiciones.json');
    for (const ruta of [dryRunPath, snapshotPath, disposicionesPath]) {
        if (!existsSync(ruta)) {
            throw new IngestaError('EVIDENCIA_INCOMPLETA', ruta);
        }
    }

    const dryRun = leerJson<DryRunEvidence>(dryRunPath);
    const snapshot = leerJson<SnapshotEvidence>(snapshotPath);
    const disposicionesEvidence =
        leerJson<DisposicionesEvidence>(disposicionesPath);

    if (dryRun.status !== 'PASS' || dryRun.read_only !== true) {
        throw new IngestaError(
            'DRY_RUN_NO_PASS',
            `Dry-run no PASS/read-only: ${String(dryRun.status)}`
        );
    }
    if (dryRun.project !== opciones.projectId) {
        throw new IngestaError(
            'PROJECT_MISMATCH',
            `Dry-run project ${String(dryRun.project)} != ${opciones.projectId}`
        );
    }

    const { csvPath, workDir } = localizarCsv(runDir);
    const csvHash = sha256Archivo(csvPath);
    if (csvHash !== dryRun.source?.csv?.sha256) {
        throw new IngestaError(
            'CSV_HASH_MISMATCH',
            'El CSV del run no coincide con el hash del dry-run.',
            { esperado: dryRun.source?.csv?.sha256, obtenido: csvHash }
        );
    }

    const csv = prepararCsv(csvPath);
    if (!csv.headerCheck.pass) {
        throw new IngestaError(
            'SOURCE_SCHEMA_MISMATCH',
            'Los headers no coinciden.',
            csv.headerCheck
        );
    }
    if (
        dryRun.source?.filas_datos !== undefined &&
        csv.filas.length !== dryRun.source.filas_datos
    ) {
        throw new IngestaError(
            'DATA_ROWS_MISMATCH',
            `Filas ${csv.filas.length} != ${dryRun.source.filas_datos}`
        );
    }

    const resultado = parseInventarioRows(csv.filas, {});
    const parseHash = sha256Json({
        filas: resultado.filas,
        resumen: resultado.resumen,
    });
    if (parseHash !== dryRun.parse?.parse_hash) {
        throw new IngestaError(
            'PARSE_HASH_MISMATCH',
            'El parse hash recalculado no coincide.',
            { esperado: dryRun.parse?.parse_hash, obtenido: parseHash }
        );
    }

    const disposiciones = aplicarDisposiciones(resultado.filas);
    if (
        sha256Json(disposiciones.resumen) !==
        sha256Json(disposicionesEvidence.resumen)
    ) {
        throw new IngestaError(
            'DISPOSICIONES_MISMATCH',
            'El resumen de disposiciones no coincide con el dry-run.'
        );
    }

    const configHash = sha256Json(MT5_DISPOSICIONES);
    const sourceCopy = join(workDir, 'source.xlsx');
    const sourceHash = existsSync(sourceCopy)
        ? sha256Archivo(sourceCopy)
        : String(dryRun.source?.sha256_antes ?? '');
    const hashes: HashesIngesta = {
        source: sourceHash,
        csv: csvHash,
        parse: parseHash,
        config: configHash,
    };
    const hashesEsperados: HashesIngesta = {
        source: String(dryRun.source?.sha256_antes ?? ''),
        csv: String(dryRun.source?.csv?.sha256 ?? ''),
        parse: String(dryRun.parse?.parse_hash ?? ''),
        config: String(disposicionesEvidence.config_sha256 ?? ''),
    };
    const validacionHashes = validarHashes(hashes, hashesEsperados);
    if (!validacionHashes.ok) {
        throw new IngestaError(
            'HASHES_MISMATCH',
            'Los hashes de la fuente/config/parse no coinciden.',
            validacionHashes.errores
        );
    }

    if (disposiciones.resumen.CREATE !== EXPECTED_CREATE) {
        throw new IngestaError(
            'CREATE_FINAL_MISMATCH',
            `CREATE_FINAL ${disposiciones.resumen.CREATE} != ${EXPECTED_CREATE}`
        );
    }

    const propuestas = construirPropuestas(disposiciones, resultado.filas);
    if (propuestas.length !== EXPECTED_CREATE) {
        throw new IngestaError(
            'PROPUESTAS_MISMATCH',
            `Propuestas ${propuestas.length} != ${EXPECTED_CREATE}`
        );
    }

    const colisiones = contarColisiones(propuestas);
    const batches = calcularBatches(propuestas, opciones.batchSize);
    if (batches.length !== EXPECTED_BATCHES || colisiones !== 0) {
        throw new IngestaError(
            'PLAN_INVALIDO',
            `Batches ${batches.length} != ${EXPECTED_BATCHES} o colisiones ${colisiones} != 0`
        );
    }

    const { db } = initFirebaseGuarded({
        outDir,
        projectId: opciones.projectId,
    });

    const inventarioSnap = await db.collection('inventario_repuestos').get();
    const inventarioAntes = inventarioSnap.size;
    const [ledgerAntes, conteosAntes] = await Promise.all([
        contar(db, 'historial_auditoria_inventario'),
        contar(db, 'conteos_pendientes_repuestos'),
    ]);

    if (inventarioAntes > 0) {
        throw new IngestaError(
            'PREFLIGHT_INVENTARIO_NO_VACIO',
            `INVENTARIO_ANTES=${inventarioAntes}; se requiere 0.`,
            { inventarioAntes, ledgerAntes, conteosAntes }
        );
    }
    if (ledgerAntes > 0 || conteosAntes > 0) {
        throw new IngestaError(
            'PREFLIGHT_BASELINE_NO_VACIO',
            `Ledger=${ledgerAntes}, conteos=${conteosAntes}; se requiere 0.`
        );
    }

    const existentes: ExistenteD4B[] = inventarioSnap.docs.map((doc) => {
        const importKey = doc.get('import_key');
        return {
            documentoId: doc.id,
            referencia: String(doc.get('referencia') ?? ''),
            importKey:
                typeof importKey === 'string' && importKey.trim()
                    ? importKey
                    : null,
        };
    });

    const decisiones = propuestas.map((propuesta) =>
        clasificarD4B(
            propuesta.referencia,
            propuesta.importKey,
            existentes
        )
    );
    const resumenD4B = resumenDecisiones(decisiones);

    const d4bReport = {
        ticket: TICKET,
        generated_at: new Date().toISOString(),
        inventario_antes: inventarioAntes,
        existentes: existentes.length,
        create: resumenD4B.create,
        idempotentes: resumenD4B.idempotentes,
        reconciliables: resumenD4B.reconciliables,
        ambiguos: resumenD4B.ambiguos,
        detalle: resumenD4B.detalle,
        politica: 'STRICT_ABORT',
        d4b_adopt: false,
    };

    const collisionsReport = {
        ticket: TICKET,
        propuestas: propuestas.length,
        import_keys_unicos: new Set(
            propuestas.map((propuesta) => propuesta.importKey)
        ).size,
        import_key_colisiones: colisiones,
        batches: batches.length,
        ultimo_batch: batches[batches.length - 1]?.items.length ?? 0,
    };

    const applyPlan = {
        ticket: TICKET,
        run_id: new Date().toISOString().replace(/[:.]/g, '-'),
        project: opciones.projectId,
        environment: opciones.environment,
        actor: { uid: ACTOR_ID, email: ACTOR_EMAIL },
        batch_size: opciones.batchSize,
        batches: batches.map((batch) => ({
            index: batch.index,
            first_row: batch.items[0]?.fila ?? null,
            last_row: batch.items[batch.items.length - 1]?.fila ?? null,
            documentos: batch.items.length,
            writes: batch.items.length * 2,
        })),
        hashes,
        disposiciones: {
            CREATE: disposiciones.resumen.CREATE,
            CENSAR: disposiciones.resumen.CENSAR,
            CUARENTENA: disposiciones.resumen.CUARENTENA,
            OMITIDA: disposiciones.resumen.OMITIDA,
        },
    };

    escribirJson(outDir, 'preflight.json', {
        ticket: TICKET,
        generated_at: new Date().toISOString(),
        run_dir: runDir,
        project: opciones.projectId,
        environment: opciones.environment,
        hashes,
        hashes_esperados: hashesEsperados,
        inventario_antes: inventarioAntes,
        ledger_antes: ledgerAntes,
        conteos_antes: conteosAntes,
        create_final: disposiciones.resumen.CREATE,
        batches: batches.length,
        writes_esperados: propuestas.length * 2,
        colisiones_import_key: colisiones,
        d4b_reconciliables: resumenD4B.reconciliables,
        d4b_ambiguos: resumenD4B.ambiguos,
        estado: 'PASS',
    });
    escribirJson(outDir, 'apply-plan.json', applyPlan);
    escribirJson(outDir, 'd4b-report.json', d4bReport);
    escribirJson(outDir, 'collisions.json', collisionsReport);

    logLine(`APPLY_MODE=${opciones.aplicar ? 'APPLY' : 'DRY_RUN'}`);
    logLine(`PROJECT=${opciones.projectId}`);
    logLine(`ENVIRONMENT=${opciones.environment}`);
    logLine(`CREATE_FINAL=${disposiciones.resumen.CREATE}`);
    logLine(`CUARENTENA_FINAL=${disposiciones.resumen.CUARENTENA}`);
    logLine(`BATCHES=${batches.length}`);
    logLine(`WRITES_ESPERADOS=${propuestas.length * 2}`);
    logLine(`IMPORT_KEY_UNICOS=${collisionsReport.import_keys_unicos}`);
    logLine(`IMPORT_KEY_COLISIONES=${colisiones}`);
    logLine(`D4B_RECONCILIABLES=${resumenD4B.reconciliables}`);
    logLine(`D4B_AMBIGUEDADES=${resumenD4B.ambiguos}`);
    logLine(`INVENTARIO_ANTES=${inventarioAntes}`);
    logLine(`LEDGER_ANTES=${ledgerAntes}`);
    logLine(`CONTEOS_ANTES=${conteosAntes}`);

    if (resumenD4B.reconciliables > 0 || resumenD4B.ambiguos > 0) {
        escribirTexto(outDir, 'run.log', log.join('\n'));
        throw new IngestaError(
            'D4B_STRICT_ABORT',
            `D4-B abortó: reconciliables=${resumenD4B.reconciliables}, ambiguos=${resumenD4B.ambiguos}`
        );
    }

    if (!opciones.aplicar) {
        logLine('FIRESTORE_WRITES=0');
        logLine('DRY_RUN=PASS');
        escribirTexto(
            outDir,
            'report.md',
            [
                `# ${TICKET} — DRY RUN`,
                '',
                `- Proyecto: ${opciones.projectId}`,
                `- Entorno: ${opciones.environment}`,
                `- Documentos: ${propuestas.length}`,
                `- Batches: ${batches.length}`,
                `- Writes esperados: ${propuestas.length * 2}`,
                '- Firestore writes: 0',
                '- Estado: PASS',
            ].join('\n')
        );
        escribirTexto(outDir, 'run.log', log.join('\n'));
        return;
    }

    const runId = applyPlan.run_id;
    const batchResults: Array<{
        index: number;
        file: string;
        sha256: string;
        documentos: DocumentoBatch[];
        documents: number;
        writes: number;
        first_row: number | null;
        last_row: number | null;
    }> = [];

    for (const batchPlan of batches) {
        const ahora = Timestamp.now();
        const batch = db.batch();
        const documentos: DocumentoBatch[] = [];

        for (const propuesta of batchPlan.items) {
            const docRef = db.collection('inventario_repuestos').doc();
            const ledgerRef = db
                .collection('historial_auditoria_inventario')
                .doc();
            const payload = construirPayloadDocumento({
                documentoPropuesto: propuesta.documentoPropuesto,
                unidadMedida: propuesta.unidadMedida,
                importKey: propuesta.importKey,
                ahora,
            });
            const ledgerPayload = construirPayloadLedger({
                documentoId: docRef.id,
                referencia: propuesta.referencia,
                payload,
                ahora,
            });

            batch.create(docRef, payload);
            batch.create(ledgerRef, ledgerPayload);

            documentos.push({
                documento_id: docRef.id,
                ledger_id: ledgerRef.id,
                import_key: propuesta.importKey,
                referencia: propuesta.referencia,
                payload_hash: hashPayloadDocumento(payload),
            });
        }

        const firstRow = batchPlan.items[0]?.fila ?? 0;
        const lastRow =
            batchPlan.items[batchPlan.items.length - 1]?.fila ?? 0;
        const baseManifest = {
            ticket: TICKET,
            run_id: runId,
            batch_index: batchPlan.index,
            first_row: firstRow,
            last_row: lastRow,
            documentos,
            writes: documentos.length * 2,
            ledger_creates: documentos.length,
            source_sha256: hashes.source,
            config_sha256: hashes.config,
            parse_hash: hashes.parse,
            committed_at: new Date().toISOString(),
            status: 'COMMITTED' as const,
        };

        escribirJson(
            outDir,
            `batch-${String(batchPlan.index).padStart(4, '0')}.pending.json`,
            baseManifest
        );

        try {
            await batch.commit();
        } catch (error) {
            escribirJson(outDir, 'partial-manifest.json', {
                ticket: TICKET,
                run_id: runId,
                project: opciones.projectId,
                environment: opciones.environment,
                batches: batchResults,
                committed_batches: batchResults,
                failed_batch_index: batchPlan.index,
                failed_documents: documentos,
                error:
                    error instanceof Error ? error.message : String(error),
                status: 'FAIL',
            });
            escribirTexto(outDir, 'run.log', log.join('\n'));
            console.error(
                `BATCH_FAILED=${batchPlan.index}: ${
                    error instanceof Error ? error.message : String(error)
                }`
            );
            process.exit(1);
        }

        const batchHash = hashBatchManifest(baseManifest);
        const manifest: BatchManifest = {
            ...baseManifest,
            batch_sha256: batchHash,
        };
        const fileName = batchFileName(batchPlan.index);
        const filePath = escribirJson(outDir, fileName, manifest);
        const fileHash = sha256Archivo(filePath);
        escribirTexto(outDir, `${fileName}.sha256`, fileHash);

        batchResults.push({
            index: batchPlan.index,
            file: fileName,
            sha256: fileHash,
            documentos,
            documents: documentos.length,
            writes: documentos.length * 2,
            first_row: firstRow,
            last_row: lastRow,
        });
        logLine(
            `BATCH=${batchPlan.index}/${batches.length} COMMITTED docs=${documentos.length} writes=${documentos.length * 2}`
        );
    }

    const inventarioDespues = await contar(
        db,
        'inventario_repuestos'
    );
    const ledgerCreateDespues = await contar(
        db,
        'historial_auditoria_inventario',
        'operacion',
        'CREATE'
    );
    const conteosDespues = await contar(
        db,
        'conteos_pendientes_repuestos'
    );
    const inventarioDocs = await db.collection('inventario_repuestos').get();
    const importKeys = inventarioDocs.docs
        .map((doc) => doc.get('import_key'))
        .filter((value): value is string => typeof value === 'string');
    const importKeyUnicos = new Set(importKeys).size;
    const importKeyColisiones = importKeys.length - importKeyUnicos;

    const gates = {
        CREATE_FINAL: disposiciones.resumen.CREATE,
        CUARENTENA_FINAL: disposiciones.resumen.CUARENTENA,
        BATCHES: batches.length,
        WRITES_TOTALES: batchResults.reduce(
            (total, batch) => total + batch.writes,
            0
        ),
        INVENTARIO_DESPUES: inventarioDespues,
        LEDGER_CREATE_DESPUES: ledgerCreateDespues,
        IMPORT_KEY_UNICOS: importKeyUnicos,
        IMPORT_KEY_COLISIONES: importKeyColisiones,
        D4B_AMBIGUEDADES: resumenD4B.ambiguos,
        D4B_RECONCILIABLES: resumenD4B.reconciliables,
        CONTEOS_PENDIENTES: conteosDespues,
        STORAGE_WRITES: 0,
    };
    const gatesOk =
        gates.CREATE_FINAL === EXPECTED_CREATE &&
        gates.CUARENTENA_FINAL === 94 &&
        gates.BATCHES === EXPECTED_BATCHES &&
        gates.WRITES_TOTALES === EXPECTED_CREATE * 2 &&
        gates.INVENTARIO_DESPUES === EXPECTED_CREATE &&
        gates.LEDGER_CREATE_DESPUES === EXPECTED_CREATE &&
        gates.IMPORT_KEY_UNICOS === EXPECTED_CREATE &&
        gates.IMPORT_KEY_COLISIONES === 0 &&
        gates.D4B_AMBIGUEDADES === 0 &&
        gates.D4B_RECONCILIABLES === 0 &&
        gates.CONTEOS_PENDIENTES === 0 &&
        gates.STORAGE_WRITES === 0;

    const finalBase = {
        ticket: TICKET,
        run_id: runId,
        project: opciones.projectId,
        environment: opciones.environment,
        actor: { uid: ACTOR_ID, email: ACTOR_EMAIL },
        generated_at: new Date().toISOString(),
        source_sha256: hashes.source,
        csv_sha256: hashes.csv,
        config_sha256: hashes.config,
        parse_hash: hashes.parse,
        disposiciones: {
            CREATE: disposiciones.resumen.CREATE,
            CENSAR: disposiciones.resumen.CENSAR,
            CUARENTENA: disposiciones.resumen.CUARENTENA,
            OMITIDA: disposiciones.resumen.OMITIDA,
        },
        preflight: {
            inventario_antes: inventarioAntes,
            ledger_antes: ledgerAntes,
            conteos_antes: conteosAntes,
        },
        batches: batchResults,
        totals: {
            documents: EXPECTED_CREATE,
            ledger_creates: EXPECTED_CREATE,
            writes: EXPECTED_CREATE * 2,
        },
        postcheck: {
            inventario_despues: inventarioDespues,
            ledger_create_despues: ledgerCreateDespues,
            conteos_despues: conteosDespues,
            import_key_unicos: importKeyUnicos,
            import_key_colisiones: importKeyColisiones,
            storage_writes: 0,
        },
        gates,
        status: gatesOk ? 'PASS' : 'FAIL',
    };

    const finalPath = escribirJson(outDir, 'final-manifest.json', finalBase);
    const finalHash = sha256Archivo(finalPath);
    escribirTexto(outDir, 'final-manifest.sha256', finalHash);
    escribirJson(outDir, 'counts.json', {
        ...gates,
        final_manifest_sha256: finalHash,
    });
    escribirTexto(
        outDir,
        'report.md',
        [
            `# ${TICKET} — APPLY`,
            '',
            `- Estado: ${gatesOk ? 'PASS' : 'FAIL'}`,
            `- Documentos: ${EXPECTED_CREATE}`,
            `- Ledger CREATE: ${ledgerCreateDespues}`,
            `- Batches: ${batches.length}`,
            `- Writes: ${gates.WRITES_TOTALES}`,
            `- Import key colisiones: ${importKeyColisiones}`,
            `- D4-B ambiguos: ${resumenD4B.ambiguos}`,
            `- Final manifest SHA-256: ${finalHash}`,
        ].join('\n')
    );

    for (const [clave, valor] of Object.entries(gates)) {
        logLine(`${clave}=${valor}`);
    }
    logLine(`FINAL_MANIFEST_SHA256=${finalHash}`);
    escribirTexto(outDir, 'run.log', log.join('\n'));

    if (!gatesOk) process.exit(1);
}

main().catch((error: unknown) => {
    const detalle =
        error instanceof IngestaError
            ? { code: error.code, message: error.message, detail: error.detail }
            : { message: error instanceof Error ? error.message : String(error) };
    console.error('APPLY=FAIL');
    console.error(JSON.stringify(detalle, null, 2));
    process.exit(1);
});
