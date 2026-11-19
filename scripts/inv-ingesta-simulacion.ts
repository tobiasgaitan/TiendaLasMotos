/**
 * WEB-INV-INGESTA-001-F1 — MT-3: simulación de colisiones e idempotencia.
 *
 * Read-only puro: no importa Firestore ni Storage, no escribe en el proyecto.
 * Consume la evidencia de un dry-run PASS (run-dir), re-parsea el mismo CSV y
 * simula dos pasadas de ingesta sobre un catálogo vacío.
 *
 * Semántica simulada (D4):
 * - Identidad: import_key = SHA-256 de la referencia normalizada.
 * - CREATE si la clave no existe; SKIP si el payload es idéntico; UPDATE solo
 *   si el payload difiere y la política lo permite.
 * - Política de seguridad: sin sobrescritura intra-lote. Un conflicto se
 *   reporta como SKIP_CONFLICTO y queda pendiente de MT-5; nunca se elige
 *   "la última fila gana" de forma silenciosa.
 * - Los campos de auditoría (creado_*, actualizado_*) y los campos fijos de
 *   COND-1 (precio=0, stock=0) no forman parte del diff de idempotencia.
 *
 * Uso:
 *   npx tsx scripts/inv-ingesta-simulacion.ts \
 *     --run-dir=/ruta/run-3 [--out=/ruta/fuera/del/repo/simulacion]
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import {
    assertOutDirOutsideRepo,
    writeManifestAndReport,
} from './lib/forensic-utils';
import {
    IngestaError,
    prepararCsv,
    sha256Archivo,
    sha256Json,
} from './lib/inv-ingesta-source';
import {
    TICKET,
    parseInventarioRows,
    type DocumentoPropuesto,
    type ResultadoParseo,
} from './lib/inv-ingesta-utils';
import {
    MT5_DISPOSICIONES,
    aplicarDisposiciones,
    type ConfigDisposiciones,
    type ResultadoDisposiciones,
    type ResumenDisposiciones,
} from './lib/inv-ingesta-disposiciones';

const PROJECT_ID = 'tiendalasmotos';
const USAGE =
    'Uso: npx tsx scripts/inv-ingesta-simulacion.ts --run-dir=<evidencia> ' +
    '[--out=<fuera-del-repo>]';

type Politica = 'sin_sobrescritura' | 'ultima_gana';

interface CliOptions {
    runDir: string;
    outDir: string;
}

interface DryRunEvidence {
    status?: string;
    read_only?: boolean;
    project?: string;
    gates?: Record<string, string | number>;
    source?: {
        sha256_esperado?: string;
        sha256_antes?: string;
        sha256_despues?: string;
        csv?: { sha256?: string; bytes?: number };
        filas_datos?: number;
    };
    parse?: {
        parse_hash?: string;
        parsed_rows?: number;
        skipped_rows?: number;
        total_filas?: number;
    };
}

interface SnapshotEvidence {
    inventario_repuestos?: { total?: number; maestras_count?: number };
    conteos_pendientes_repuestos?: { total?: number };
    historial_auditoria_inventario?: { total?: number };
}

interface Propuesta {
    fila: number;
    importKey: string;
    referencia: string;
    payload: DocumentoPropuesto;
    payloadHash: string;
}

interface EstadoDoc {
    importKey: string;
    referencia: string;
    fila: number;
    payload: DocumentoPropuesto;
    payloadHash: string;
}

interface Operaciones {
    CREATE: number;
    UPDATE: number;
    SKIP: number;
    SKIP_CONFLICTO: number;
}

interface Conflicto {
    importKey: string;
    referencia: string;
    filaBase: number;
    filaConflicto: number;
    motivo: string;
}

interface ResultadoPasada {
    operaciones: Operaciones;
    conflictos: Conflicto[];
    estado: Map<string, EstadoDoc>;
}

interface ColisionImportKey {
    importKey: string;
    referencias: string[];
}

interface ReferenciaDuplicada {
    referencia: string;
    importKey: string;
    filas: Array<{
        fila: number;
        payloadHash: string;
        descripcion: string;
    }>;
}

interface EanCompartido {
    ean: string;
    referencias: string[];
}

interface HallazgoMaestro {
    fila: number;
    token: string;
}

interface DisposicionesEvidence {
    config_sha256: string;
    resumen: ResumenDisposiciones;
}

interface EanDisposicionesCheck {
    cuarentena_config: number;
    cuarentena_encontradas: number;
    keep_config: number;
    keep_encontradas: number;
    match: 'MATCH' | 'FAIL';
    faltantes: string[];
    extras: string[];
}

interface Simulacion {
    ticket: string;
    fase: string;
    generated_at: string;
    read_only: true;
    project: string;
    input: {
        run_dir: string;
        csv_sha256: string;
        dry_run_status: string;
        dry_run_parse_hash: string;
        source_sha256: string;
        filas_datos: number;
    };
    snapshot: {
        inventario_total: number;
        maestras_count: number;
        conteos_total: number;
        ledger_total: number;
        vacio: boolean;
    };
    propuestas: {
        total: number;
        referencias_unicas: number;
        payload_hash: string;
    };
    disposiciones: {
        config_sha256: string;
        resumen: ResumenDisposiciones;
        ean: EanDisposicionesCheck;
        mapeo: ResultadoDisposiciones['mapeo'];
    };
    pasada_1: {
        operaciones: Operaciones;
        estado_hash: string;
        ledger_entries: number;
    };
    pasada_2: {
        operaciones: Operaciones;
        estado_hash: string;
        ledger_entries: number;
    };
    contrafactual_ultima_gana: {
        pasada_1: Operaciones;
        pasada_2: Operaciones;
        idempotente: boolean;
    };
    conflictos: Conflicto[];
    colisiones: {
        import_key: ColisionImportKey[];
        referencias_duplicadas: ReferenciaDuplicada[];
        ean_compartidos: EanCompartido[];
        ean_colision_maestra: HallazgoMaestro[];
        import_key_colisiones: number;
    };
    gates: Record<string, string | number>;
    status: 'PASS' | 'FAIL';
    fail_code?: string;
    fail_message?: string;
}

function parseArgs(argv: string[]): CliOptions {
    let runDir = '';
    let outDir = '';

    for (const arg of argv) {
        if (arg === '--help' || arg === '-h') {
            console.log(USAGE);
            process.exit(0);
        }
        if (!arg.startsWith('--')) {
            throw new IngestaError('ARG_INVALIDO', arg);
        }
        const [rawKey = '', rawValue = ''] = arg.slice(2).split('=', 2);
        const key = rawKey.trim();
        const value = rawValue.trim();
        if (key === 'run-dir') {
            runDir = value;
            continue;
        }
        if (key === 'out') {
            outDir = value;
            continue;
        }
        throw new IngestaError('FLAG_NO_RECONOCIDO', `--${key}`);
    }

    if (!runDir) {
        throw new IngestaError('RUN_DIR_REQUIRED', '<evidencia-dry-run>');
    }

    const resolvedRun = resolve(runDir);
    if (!existsSync(resolvedRun)) {
        throw new IngestaError('RUN_DIR_NOT_FOUND', resolvedRun);
    }

    return {
        runDir: resolvedRun,
        outDir: outDir ? resolve(outDir) : join(resolvedRun, 'simulacion'),
    };
}

function assertFueraDelRepo(ruta: string): void {
    const repo = resolve(process.cwd());
    if (ruta === repo || ruta.startsWith(`${repo}${sep}`)) {
        throw new IngestaError(
            'RUN_DIR_DENTRO_DEL_REPO',
            `La evidencia debe vivir fuera del repositorio: ${ruta}`
        );
    }
}

function leerJson<T>(ruta: string): T {
    return JSON.parse(readFileSync(ruta, 'utf8')) as T;
}

function canonizarDocumento(doc: DocumentoPropuesto): DocumentoPropuesto {
    return {
        referencia: doc.referencia,
        descripcion: doc.descripcion,
        categoria: doc.categoria,
        referencias_alternativas: [...doc.referencias_alternativas],
        aplica_a: [...doc.aplica_a],
    };
}

function construirPropuestas(
    disposiciones: ResultadoDisposiciones
): Propuesta[] {
    const propuestas: Propuesta[] = [];
    for (const fila of disposiciones.filas) {
        if (fila.disposicion !== 'CREATE') continue;
        if (!fila.documentoPropuesto || !fila.importKey) {
            throw new Error(
                `Fila ${fila.fila} con disposición CREATE sin documento o import_key`
            );
        }
        const payload = canonizarDocumento(fila.documentoPropuesto);
        propuestas.push({
            fila: fila.fila,
            importKey: fila.importKey,
            referencia: fila.referencia,
            payload,
            payloadHash: sha256Json(payload),
        });
    }
    return propuestas;
}

function claveCuarentena(fila: number, token: string): string {
    return `${fila}|${token}`;
}

function claveKeep(ean: string, referencias: readonly string[]): string {
    return `${ean}|${[...referencias].sort().join(',')}`;
}

function validarEanDisposiciones(
    colisiones: Simulacion['colisiones'],
    config: ConfigDisposiciones
): EanDisposicionesCheck {
    const configCuarentena = new Set(
        config.ean.cuarentena.flatMap((item) =>
            item.filas.map((fila) => claveCuarentena(fila, item.token))
        )
    );
    const encontradasCuarentena = new Set(
        colisiones.ean_colision_maestra.map((item) =>
            claveCuarentena(item.fila, item.token)
        )
    );
    const configKeep = new Set(
        config.ean.keep_alternativas.map((item) =>
            claveKeep(item.token, item.referencias)
        )
    );
    const encontradasKeep = new Set(
        colisiones.ean_compartidos.map((item) =>
            claveKeep(item.ean, item.referencias)
        )
    );
    const faltantes = [
        ...[...configCuarentena].filter(
            (clave) => !encontradasCuarentena.has(clave)
        ),
        ...[...configKeep].filter((clave) => !encontradasKeep.has(clave)),
    ].sort();
    const extras = [
        ...[...encontradasCuarentena].filter(
            (clave) => !configCuarentena.has(clave)
        ),
        ...[...encontradasKeep].filter((clave) => !configKeep.has(clave)),
    ].sort();
    const match =
        faltantes.length === 0 &&
        extras.length === 0 &&
        configCuarentena.size === encontradasCuarentena.size &&
        configKeep.size === encontradasKeep.size;

    return {
        cuarentena_config: configCuarentena.size,
        cuarentena_encontradas: encontradasCuarentena.size,
        keep_config: configKeep.size,
        keep_encontradas: encontradasKeep.size,
        match: match ? 'MATCH' : 'FAIL',
        faltantes,
        extras,
    };
}

function clonarEstado(
    estado: Map<string, EstadoDoc>
): Map<string, EstadoDoc> {
    return new Map(
        [...estado.entries()].map(([clave, doc]) => [clave, { ...doc }])
    );
}

function hashEstado(estado: Map<string, EstadoDoc>): string {
    const filas = [...estado.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([clave, doc]) => [clave, doc.payloadHash]);
    return sha256Json(filas);
}

function ejecutarPasada(
    propuestas: readonly Propuesta[],
    estado: Map<string, EstadoDoc>,
    politica: Politica
): ResultadoPasada {
    const operaciones: Operaciones = {
        CREATE: 0,
        UPDATE: 0,
        SKIP: 0,
        SKIP_CONFLICTO: 0,
    };
    const conflictos: Conflicto[] = [];

    for (const propuesta of propuestas) {
        const existente = estado.get(propuesta.importKey);
        if (!existente) {
            estado.set(propuesta.importKey, {
                importKey: propuesta.importKey,
                referencia: propuesta.referencia,
                fila: propuesta.fila,
                payload: propuesta.payload,
                payloadHash: propuesta.payloadHash,
            });
            operaciones.CREATE += 1;
            continue;
        }

        if (existente.payloadHash === propuesta.payloadHash) {
            operaciones.SKIP += 1;
            continue;
        }

        if (politica === 'ultima_gana') {
            estado.set(propuesta.importKey, {
                importKey: propuesta.importKey,
                referencia: propuesta.referencia,
                fila: propuesta.fila,
                payload: propuesta.payload,
                payloadHash: propuesta.payloadHash,
            });
            operaciones.UPDATE += 1;
            continue;
        }

        operaciones.SKIP_CONFLICTO += 1;
        conflictos.push({
            importKey: propuesta.importKey,
            referencia: propuesta.referencia,
            filaBase: existente.fila,
            filaConflicto: propuesta.fila,
            motivo: 'PAYLOAD_DIVERGENTE_SIN_SOBRESCRITURA',
        });
    }

    return { operaciones, conflictos, estado };
}

function analizarColisiones(
    propuestas: readonly Propuesta[],
    resultado: ResultadoParseo
): Simulacion['colisiones'] {
    const claveARefs = new Map<string, Set<string>>();
    const refAPropuestas = new Map<string, Propuesta[]>();
    const eanARefs = new Map<string, Set<string>>();

    for (const propuesta of propuestas) {
        const refs = claveARefs.get(propuesta.importKey) ?? new Set<string>();
        refs.add(propuesta.referencia);
        claveARefs.set(propuesta.importKey, refs);

        const lista = refAPropuestas.get(propuesta.referencia) ?? [];
        lista.push(propuesta);
        refAPropuestas.set(propuesta.referencia, lista);

        for (const alternativa of propuesta.payload.referencias_alternativas) {
            const refsEan = eanARefs.get(alternativa) ?? new Set<string>();
            refsEan.add(propuesta.referencia);
            eanARefs.set(alternativa, refsEan);
        }
    }

    const importKey: ColisionImportKey[] = [...claveARefs.entries()]
        .filter(([, refs]) => refs.size > 1)
        .map(([clave, refs]) => ({
            importKey: clave,
            referencias: [...refs].sort(),
        }));

    const referenciasDuplicadas: ReferenciaDuplicada[] = [...refAPropuestas]
        .filter(([, lista]) => lista.length > 1)
        .map(([referencia, lista]) => ({
            referencia,
            importKey: lista[0].importKey,
            filas: lista
                .map((propuesta) => ({
                    fila: propuesta.fila,
                    payloadHash: propuesta.payloadHash,
                    descripcion: propuesta.payload.descripcion,
                }))
                .sort((a, b) => a.fila - b.fila),
        }))
        .sort((a, b) => a.referencia.localeCompare(b.referencia));

    const eanCompartidos: EanCompartido[] = [...eanARefs.entries()]
        .filter(([, refs]) => refs.size > 1)
        .map(([ean, refs]) => ({
            ean,
            referencias: [...refs].sort(),
        }))
        .sort((a, b) => a.ean.localeCompare(b.ean));

    const eanColisionMaestra: HallazgoMaestro[] = resultado.incidencias
        .filter((incidencia) => incidencia.codigo === 'EAN13_COLISION_MAESTRA')
        .map((incidencia) => ({
            fila: incidencia.fila,
            token: incidencia.detalle ?? '',
        }))
        .sort((a, b) => a.fila - b.fila);

    return {
        import_key: importKey,
        referencias_duplicadas: referenciasDuplicadas,
        ean_compartidos: eanCompartidos,
        ean_colision_maestra: eanColisionMaestra,
        import_key_colisiones: importKey.length,
    };
}

function construirReporte(simulacion: Simulacion): string {
    const lineas: string[] = [
        `# ${TICKET} — MT-3 simulación de colisiones e idempotencia`,
        '',
        `- Estado: **${simulacion.status}**`,
        `- Generado: ${simulacion.generated_at}`,
        `- Proyecto: ${simulacion.project}`,
        `- Modo: read-only (sin Firestore/Storage)`,
        '',
    ];

    if (simulacion.fail_code) {
        lineas.push(
            '## Fallo',
            '',
            `- Código: \`${simulacion.fail_code}\``,
            `- Mensaje: ${simulacion.fail_message ?? ''}`,
            ''
        );
    }

    lineas.push('## Gates', '', '| Gate | Resultado |', '| --- | --- |');
    for (const [gate, valor] of Object.entries(simulacion.gates)) {
        lineas.push(`| ${gate} | ${String(valor)} |`);
    }
    lineas.push('');

    lineas.push(
        '## Entrada',
        '',
        `- Run dir: \`${simulacion.input.run_dir}\``,
        `- Dry-run: ${simulacion.input.dry_run_status}`,
        `- SHA-256 fuente: \`${simulacion.input.source_sha256}\``,
        `- SHA-256 CSV: \`${simulacion.input.csv_sha256}\``,
        `- Parse hash: \`${simulacion.input.dry_run_parse_hash}\``,
        `- Filas de datos: ${simulacion.input.filas_datos}`,
        ''
    );

    lineas.push(
        '## Snapshot live (vacío exigido para esta simulación)',
        '',
        `- inventario_repuestos: ${simulacion.snapshot.inventario_total} docs`,
        `- maestras: ${simulacion.snapshot.maestras_count}`,
        `- conteos_pendientes_repuestos: ${simulacion.snapshot.conteos_total} docs`,
        `- historial_auditoria_inventario: ${simulacion.snapshot.ledger_total} docs`,
        ''
    );

    const disp = simulacion.disposiciones.resumen;
    const ean = simulacion.disposiciones.ean;
    lineas.push(
        '## Disposiciones MT-5 aplicadas',
        '',
        `- Config SHA-256: \`${simulacion.disposiciones.config_sha256}\``,
        `- Overrides aplicados: ${disp.overridesAplicados}`,
        '',
        '| Categoría | Total | CREATE | CENSAR | EXCLUIR | CUARENTENA | SKIP_CONFLICTO | OMITIDA |',
        '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |'
    );
    for (const categoria of disp.porCategoria) {
        lineas.push(
            `| ${categoria.categoria} | ${categoria.total} | ${categoria.CREATE} | ${categoria.CENSAR} | ${categoria.EXCLUIR} | ${categoria.CUARENTENA} | ${categoria.SKIP_CONFLICTO} | ${categoria.OMITIDA} |`
        );
    }
    lineas.push(
        `| **Total** | **${disp.total}** | **${disp.CREATE}** | **${disp.CENSAR}** | **${disp.EXCLUIR}** | **${disp.CUARENTENA}** | **${disp.SKIP_CONFLICTO}** | **${disp.OMITIDA}** |`,
        '',
        `- Reconciliación: ${disp.parsed} = ${disp.CREATE} + ${disp.CENSAR} + ${disp.EXCLUIR} + ${disp.CUARENTENA} + ${disp.SKIP_CONFLICTO} → \`${disp.reconciliacion}\`; residuo ${disp.residuo}.`,
        ''
    );

    lineas.push(
        '### Mapeo D-1 / D-5',
        '',
        `- D-1 filas MAPPABLE: ${disp.mapeo.d1.filas}`,
        `- D-1 con sustitución: ${disp.mapeo.d1.conCambios}`,
        `- D-1 sin cambios: ${disp.mapeo.d1.sinCambios}`,
        `- D-1 filas con colisión post-mapeo: ${disp.mapeo.d1.colisiones}`,
        `- D-5 charset total: ${disp.mapeo.d5.charsetTotal}`,
        `- D-5 candidatas: ${disp.mapeo.d5.candidatas}`,
        `- D-5 elegibles: ${disp.mapeo.d5.elegibles}`,
        `- D-5 creadas: ${disp.mapeo.d5.creadas}`,
        `- D-5 SKIP_CONFLICTO: ${disp.mapeo.d5.skipConflicto}`,
        `- D-5 texto libre: ${disp.mapeo.d5.textoLibre}`,
        `- D-5 símbolo inválido: ${disp.mapeo.d5.simboloInvalido}`,
        `- D-5 otro defecto: ${disp.mapeo.d5.otroDefecto}`,
        `- D-5 fuera de alcance: ${disp.mapeo.d5.fueraDeAlcance}`,
        `- Total filas mapeadas: ${disp.mapeo.filas}`,
        `- Total con sustitución: ${disp.mapeo.conCambios}`,
        `- Total con colisión post-mapeo: ${disp.mapeo.colisiones}`,
        ''
    );

    const mapeoRepuestos = simulacion.disposiciones.mapeo.filter(
        (fila) =>
            fila.origen === 'D1' && fila.categoria === 'REPUESTOS'
    );
    if (mapeoRepuestos.length > 0) {
        lineas.push(
            '#### MAPPABLE de REPUESTOS (D-4)',
            '',
            '| Fila | Crudo | Referencia | Motivo original | Reglas | Disposición | Motivo final |',
            '| ---: | --- | --- | --- | --- | --- | --- |'
        );
        for (const fila of mapeoRepuestos) {
            lineas.push(
                `| ${fila.fila} | \`${fila.referenciaCruda}\` | \`${fila.referenciaOriginal}\` | ${fila.motivoOriginal ?? '—'} | ${fila.reglas.length > 0 ? fila.reglas.join(', ') : '—'} | ${fila.disposicion} | ${fila.motivo ?? '—'} |`
            );
        }
        lineas.push('');
    }

    const mapeoColisiones = simulacion.disposiciones.mapeo.filter(
        (fila) => fila.colisiones.length > 0
    );
    if (mapeoColisiones.length > 0) {
        lineas.push('#### Colisiones post-mapeo', '');
        for (const fila of mapeoColisiones) {
            lineas.push(
                `- [${fila.origen}] fila ${fila.fila} \`${fila.referenciaOriginal}\` → \`${fila.referenciaMapeada}\`: ` +
                    fila.colisiones
                        .map(
                            (colision) =>
                                `fila ${colision.fila} (${colision.tipo})`
                        )
                        .join(', ') +
                    `; disposición ${fila.disposicion}.`
            );
        }
        lineas.push('');
    }

    lineas.push(
        '### Disposiciones EAN MT-5 (D-3)',
        '',
        `- Cuarentena: config ${ean.cuarentena_config}, encontradas ${ean.cuarentena_encontradas}`,
        `- Keep alternativas: config ${ean.keep_config}, encontradas ${ean.keep_encontradas}`,
        `- Match: ${ean.match}`,
        ''
    );
    if (ean.faltantes.length > 0) {
        lineas.push('#### Config sin hallazgo', '');
        for (const clave of ean.faltantes) {
            lineas.push(`- \`${clave}\``);
        }
        lineas.push('');
    }
    if (ean.extras.length > 0) {
        lineas.push('#### Hallazgo sin disposición', '');
        for (const clave of ean.extras) {
            lineas.push(`- \`${clave}\``);
        }
        lineas.push('');
    }

    lineas.push(
        '## Semántica D4 simulada',
        '',
        '- Identidad: `import_key = SHA-256("inventario_repuestos|v1|" + referencia normalizada)`.',
        '- `CREATE` si la clave no existe; `SKIP` si el payload es idéntico.',
        '- Si dos filas de la misma fuente comparten clave con payload distinto, no se sobrescribe: `SKIP_CONFLICTO` y hallazgo para MT-5.',
        '- El diff excluye `creado_*`, `actualizado_*` e `import_key`; `precio=0` y `stock=0` son constantes COND-1.',
        `- Propuestas: ${simulacion.propuestas.total}; referencias únicas: ${simulacion.propuestas.referencias_unicas}.`,
        ''
    );

    const tabla = (
        titulo: string,
        pasada: Simulacion['pasada_1']
    ): void => {
        lineas.push(
            `### ${titulo}`,
            '',
            '| Operación | Cantidad |',
            '| --- | ---: |',
            `| CREATE | ${pasada.operaciones.CREATE} |`,
            `| UPDATE | ${pasada.operaciones.UPDATE} |`,
            `| SKIP | ${pasada.operaciones.SKIP} |`,
            `| SKIP_CONFLICTO | ${pasada.operaciones.SKIP_CONFLICTO} |`,
            '',
            `- Estado hash: \`${pasada.estado_hash}\``,
            `- Asientos de ledger simulados: ${pasada.ledger_entries}`,
            ''
        );
    };

    tabla('Pasada 1 (catálogo vacío)', simulacion.pasada_1);
    tabla('Pasada 2 (reejecución idéntica)', simulacion.pasada_2);

    lineas.push(
        '## Contrafactual "última gana" (rechazado)',
        '',
        '| Pasada | CREATE | UPDATE | SKIP | SKIP_CONFLICTO |',
        '| --- | ---: | ---: | ---: | ---: |',
        `| 1 | ${simulacion.contrafactual_ultima_gana.pasada_1.CREATE} | ${simulacion.contrafactual_ultima_gana.pasada_1.UPDATE} | ${simulacion.contrafactual_ultima_gana.pasada_1.SKIP} | ${simulacion.contrafactual_ultima_gana.pasada_1.SKIP_CONFLICTO} |`,
        `| 2 | ${simulacion.contrafactual_ultima_gana.pasada_2.CREATE} | ${simulacion.contrafactual_ultima_gana.pasada_2.UPDATE} | ${simulacion.contrafactual_ultima_gana.pasada_2.SKIP} | ${simulacion.contrafactual_ultima_gana.pasada_2.SKIP_CONFLICTO} |`,
        '',
        `- Idempotente: ${simulacion.contrafactual_ultima_gana.idempotente ? 'SÍ' : 'NO'}. ` +
            (simulacion.pasada_1.operaciones.SKIP_CONFLICTO > 0
                ? 'La pasada 2 volvería a escribir los mismos conflictos; por eso la política segura es no sobrescribir.'
                : 'No hay conflictos intra-fuente pendientes: las disposiciones MT-5 se aplicaron antes de construir las propuestas.'),
        ''
    );

    lineas.push(
        '## Hallazgos para MT-5',
        '',
        `- \`MT5_REQUIRED=${String(simulacion.gates.MT5_REQUIRED)}\`.`,
        `- Colisiones post-mapeo: ${simulacion.disposiciones.resumen.mapeo.colisiones}.`,
        `- Disposiciones EAN: ${simulacion.disposiciones.ean.match}.`,
        ''
    );
    if (simulacion.conflictos.length === 0) {
        lineas.push(
            '- Sin conflictos de payload dentro de la fuente.',
            '- Las disposiciones MT-5 se aplicaron antes de construir propuestas; el detalle de overrides vive en `../disposiciones.json`.'
        );
    } else {
        lineas.push(
            `- **${simulacion.conflictos.length} conflicto(s) intra-fuente** sin sobrescritura:`
        );
        for (const conflicto of simulacion.conflictos) {
            lineas.push(
                `  - \`${conflicto.referencia}\` (import_key \`${conflicto.importKey}\`): filas ${conflicto.filaBase} y ${conflicto.filaConflicto}.`
            );
        }
    }
    const dup = simulacion.colisiones.referencias_duplicadas;
    if (dup.length > 0) {
        lineas.push('', '### Referencias duplicadas en la fuente', '');
        for (const referencia of dup) {
            lineas.push(
                `- \`${referencia.referencia}\` — import_key \`${referencia.importKey}\`:`
            );
            for (const fila of referencia.filas) {
                lineas.push(
                    `  - fila ${fila.fila}: ${fila.descripcion} (payload \`${fila.payloadHash}\`)`
                );
            }
        }
    }

    lineas.push(
        '',
        '### EAN-13 que coincide con una referencia maestra de la fuente',
        '',
        `- Total: ${simulacion.colisiones.ean_colision_maestra.length}. ` +
            'Disposición MT-5: `CUARENTENA`; el parser ya no los agrega a `referencias_alternativas`.'
    );
    for (const hallazgo of simulacion.colisiones.ean_colision_maestra) {
        lineas.push(`  - fila ${hallazgo.fila}: \`${hallazgo.token}\``);
    }

    lineas.push(
        '',
        '### EAN-13 compartido por dos referencias distintas',
        '',
        `- Total: ${simulacion.colisiones.ean_compartidos.length}. ` +
            'Disposición MT-5: `KEEP_ALTERNATIVAS`; ambas referencias quedan como alternativas y la ambigüedad de matching se asume explícitamente.'
    );
    for (const ean of simulacion.colisiones.ean_compartidos) {
        lineas.push(`  - \`${ean.ean}\`: ${ean.referencias.join(', ')}`);
    }

    lineas.push(
        '',
        '### Colisiones de import_key',
        '',
        `- Total: ${simulacion.colisiones.import_key_colisiones}.`,
        ''
    );
    for (const colision of simulacion.colisiones.import_key) {
        lineas.push(
            `  - \`${colision.importKey}\`: ${colision.referencias.join(', ')}`
        );
    }

    lineas.push(
        '',
        '## Evidencia',
        '',
        'Este reporte y su JSON viven fuera del repositorio. No se commitean filas reales, CSV ni el .xlsx. ' +
            'La simulación no escribió en Firestore ni en Storage.',
        ''
    );

    return lineas.join('\n');
}

function escribir(
    outDir: string,
    simulacion: Simulacion
): void {
    writeManifestAndReport(
        outDir,
        'simulacion.json',
        simulacion,
        construirReporte(simulacion),
        {},
        {
            ticket: TICKET,
            phase: 'F1',
            mode: 'MT-3',
            generated_at: simulacion.generated_at,
            read_only: true,
            project: simulacion.project,
            gates: simulacion.gates,
        },
        'hashes'
    );
}

function imprimir(simulacion: Simulacion): void {
    const g = simulacion.gates;
    for (const clave of [
        'DETERMINISTIC',
        'IDEMPOTENT',
        'CONFIG_MATCH',
        'RECONCILIACION',
        'PARSED_FINAL',
        'CREATE_FINAL',
        'CENSAR_FINAL',
        'EXCLUIR_FINAL',
        'CUARENTENA_FINAL',
        'SKIP_CONFLICTO_FINAL',
        'MAPEO_FILAS',
        'MAPEO_CAMBIOS',
        'MAPEO_COLISIONES',
        'MAPEO_INVALIDAS',
        'MAPEO_D1_FILAS',
        'MAPEO_D1_CAMBIOS',
        'MAPEO_D5_CHARSET_TOTAL',
        'MAPEO_D5_CANDIDATAS',
        'MAPEO_D5_ELEGIBLES',
        'MAPEO_D5_CREADAS',
        'MAPEO_D5_SKIP_CONFLICTO',
        'MAPEO_D5_TEXTO_LIBRE',
        'MAPEO_D5_SIMBOLO_INVALIDO',
        'MAPEO_D5_OTRO_DEFECTO',
        'MAPEO_D5_FUERA_DE_ALCANCE',
        'MAPEO_D5_COLISIONES',
        'MAPEO_D5_IDENTIDAD',
        'CREATE_MATCH',
        'IMPORT_KEY_COLLISIONS',
        'REFERENCIAS_DUPLICADAS',
        'EAN13_COLISION_MAESTRA',
        'EAN13_COMPARTIDOS',
        'EAN_DISPOSITIONS',
        'EAN_CUARENTENA_CONFIG',
        'EAN_CUARENTENA_ENCONTRADAS',
        'EAN_KEEP_CONFIG',
        'EAN_KEEP_ENCONTRADAS',
        'PASS1_CREATE',
        'PASS1_UPDATE',
        'PASS1_SKIP_CONFLICTO',
        'PASS2_CREATE',
        'PASS2_UPDATE',
        'PASS2_SKIP',
        'PASS2_SKIP_CONFLICTO',
        'FIRESTORE_WRITES',
        'STORAGE_WRITES',
        'DELETIONS',
        'MT5_REQUIRED',
        'SIMULATION',
    ]) {
        console.log(`${clave}=${String(g[clave])}`);
    }
}

async function main(): Promise<void> {
    const options = parseArgs(process.argv.slice(2));
    assertFueraDelRepo(options.runDir);
    const outDir = assertOutDirOutsideRepo(options.outDir);
    const generatedAt = new Date().toISOString();

    const dryRunPath = join(options.runDir, 'dry-run.json');
    const snapshotPath = join(options.runDir, 'snapshot.json');
    const disposicionesPath = join(options.runDir, 'disposiciones.json');
    for (const ruta of [dryRunPath, snapshotPath, disposicionesPath]) {
        if (!existsSync(ruta)) {
            throw new IngestaError('EVIDENCIA_INCOMPLETA', ruta);
        }
    }

    const dryRun = leerJson<DryRunEvidence>(dryRunPath);
    const snapshot = leerJson<SnapshotEvidence>(snapshotPath);
    const disposicionesEvidence =
        leerJson<DisposicionesEvidence>(disposicionesPath);
    const configSha256 = sha256Json(MT5_DISPOSICIONES);
    if (disposicionesEvidence.config_sha256 !== configSha256) {
        throw new IngestaError(
            'DISPOSICIONES_CONFIG_MISMATCH',
            'La config MT-5 del dry-run no coincide con la del simulador.',
            {
                esperado: configSha256,
                obtenido: disposicionesEvidence.config_sha256,
            }
        );
    }

    if (dryRun.status !== 'PASS' || dryRun.read_only !== true) {
        throw new IngestaError(
            'DRY_RUN_NO_PASS',
            `El dry-run debe estar PASS y read-only; recibido: ${String(
                dryRun.status
            )}`
        );
    }
    if (dryRun.project !== PROJECT_ID) {
        throw new IngestaError(
            'PROJECT_MISMATCH',
            `Proyecto ${String(dryRun.project)} != ${PROJECT_ID}`
        );
    }
    const gates = dryRun.gates ?? {};
    for (const gate of [
        'SOURCE_HASH',
        'SOURCE_SCHEMA',
        'DATA_ROWS',
        'PARSED_ROWS_PLUS_SKIPPED_ROWS',
        'RECONCILIACION',
        'DRY_RUN',
    ]) {
        if (gates[gate] !== 'PASS') {
            throw new IngestaError('GATE_DRY_RUN', `${gate}=${String(gates[gate])}`);
        }
    }
    for (const gate of [
        'FIRESTORE_WRITES',
        'STORAGE_WRITES',
        'DELETIONS',
        'WRITE_APIS',
    ]) {
        if (gates[gate] !== 0) {
            throw new IngestaError('GATE_DRY_RUN', `${gate}=${String(gates[gate])}`);
        }
    }

    const inventarioTotal = snapshot.inventario_repuestos?.total ?? -1;
    const maestrasCount = snapshot.inventario_repuestos?.maestras_count ?? -1;
    const conteosTotal = snapshot.conteos_pendientes_repuestos?.total ?? -1;
    const ledgerTotal =
        snapshot.historial_auditoria_inventario?.total ?? -1;
    const snapshotVacio =
        inventarioTotal === 0 &&
        maestrasCount === 0 &&
        conteosTotal === 0 &&
        ledgerTotal === 0;
    if (!snapshotVacio) {
        throw new IngestaError(
            'SNAPSHOT_NO_VACIO',
            'MT-3 simula la primera ingesta y exige catálogo, conteos y ledger vacíos.',
            {
                inventarioTotal,
                maestrasCount,
                conteosTotal,
                ledgerTotal,
            }
        );
    }

    const workDirs = readdirSync(options.runDir, {
        withFileTypes: true,
    })
        .filter((entrada) => entrada.isDirectory() && entrada.name.startsWith('work-'))
        .map((entrada) => join(options.runDir, entrada.name));
    if (workDirs.length !== 1) {
        throw new IngestaError(
            'WORK_DIR_INVALIDO',
            `Se esperaba un work-* en ${options.runDir}; encontrados: ${workDirs.length}`,
            workDirs
        );
    }
    const csvs = readdirSync(workDirs[0]).filter((archivo) =>
        archivo.toLowerCase().endsWith('.csv')
    );
    if (csvs.length !== 1) {
        throw new IngestaError(
            'CSV_INVALIDO',
            `Se esperaba un CSV en ${workDirs[0]}; encontrados: ${csvs.length}`,
            csvs
        );
    }
    const csvPath = join(workDirs[0], csvs[0]);
    const csvSha256 = sha256Archivo(csvPath);
    if (csvSha256 !== dryRun.source?.csv?.sha256) {
        throw new IngestaError(
            'CSV_HASH_MISMATCH',
            'El CSV no coincide con el hasheado por el dry-run.',
            {
                esperado: dryRun.source?.csv?.sha256,
                obtenido: csvSha256,
            }
        );
    }

    const csv = prepararCsv(csvPath);
    if (!csv.headerCheck.pass) {
        throw new IngestaError(
            'SOURCE_SCHEMA_MISMATCH',
            'Los headers no coinciden; cero simulación.',
            csv.headerCheck
        );
    }
    if (csv.filas.length !== dryRun.source?.filas_datos) {
        throw new IngestaError(
            'DATA_ROWS_MISMATCH',
            `Filas ${csv.filas.length} != ${String(
                dryRun.source?.filas_datos
            )}`
        );
    }

    const resultado = parseInventarioRows(csv.filas, {});
    const parseHash = sha256Json({
        filas: resultado.filas,
        resumen: resultado.resumen,
    });
    const deterministic = parseHash === dryRun.parse?.parse_hash;

    const disposiciones = aplicarDisposiciones(resultado.filas);
    const disposicionesMatch =
        sha256Json(disposiciones.resumen) ===
        sha256Json(disposicionesEvidence.resumen);
    if (!disposicionesMatch) {
        throw new IngestaError(
            'DISPOSICIONES_RESUMEN_MISMATCH',
            'La reconciliación recalculada no coincide con la del dry-run.'
        );
    }
    const propuestas = construirPropuestas(disposiciones);
    const pasada1 = ejecutarPasada(
        propuestas,
        new Map(),
        'sin_sobrescritura'
    );
    const pasada2 = ejecutarPasada(
        propuestas,
        clonarEstado(pasada1.estado),
        'sin_sobrescritura'
    );
    const estado1Hash = hashEstado(pasada1.estado);
    const estado2Hash = hashEstado(pasada2.estado);
    const idempotente =
        pasada2.operaciones.CREATE === 0 &&
        pasada2.operaciones.UPDATE === 0 &&
        estado1Hash === estado2Hash;

    const ultimaGana1 = ejecutarPasada(
        propuestas,
        new Map(),
        'ultima_gana'
    );
    const ultimaGana2 = ejecutarPasada(
        propuestas,
        clonarEstado(ultimaGana1.estado),
        'ultima_gana'
    );
    const idempotenteUltimaGana =
        ultimaGana2.operaciones.CREATE === 0 &&
        ultimaGana2.operaciones.UPDATE === 0;

    const colisiones = analizarColisiones(propuestas, resultado);
    const referenciasUnicas = new Set(
        propuestas.map((propuesta) => propuesta.referencia)
    ).size;
    const payloadHash = sha256Json(
        propuestas
            .map((propuesta) => [propuesta.importKey, propuesta.payloadHash])
            .sort(([a], [b]) => String(a).localeCompare(String(b)))
    );

    const pasada1Ledger = pasada1.operaciones.CREATE;
    const pasada2Ledger =
        pasada2.operaciones.CREATE + pasada2.operaciones.UPDATE;
    const eanDisposiciones = validarEanDisposiciones(
        colisiones,
        MT5_DISPOSICIONES
    );
    const mapeoInvalidas = disposiciones.mapeo.filter(
        (fila) => fila.motivo === 'D1_MAPEO_INVALIDO'
    ).length;
    const d5 = disposiciones.resumen.mapeo.d5;
    const d5Identidad =
        d5.candidatas + d5.fueraDeAlcance === d5.charsetTotal &&
        d5.elegibles +
            d5.textoLibre +
            d5.simboloInvalido +
            d5.otroDefecto ===
            d5.candidatas &&
        d5.creadas + d5.skipConflicto === d5.elegibles &&
        d5.colisiones === d5.skipConflicto;
    const mt5Required =
        pasada1.conflictos.length > 0 ||
        disposiciones.resumen.SKIP_CONFLICTO > 0 ||
        eanDisposiciones.match !== 'MATCH';

    const gatesSimulacion: Record<string, string | number> = {
        DETERMINISTIC: deterministic ? 'PASS' : 'FAIL',
        IDEMPOTENT: idempotente ? 'PASS' : 'FAIL',
        CONFIG_MATCH: disposicionesMatch ? 'PASS' : 'FAIL',
        RECONCILIACION: disposiciones.resumen.reconciliacion,
        PARSED_FINAL: disposiciones.resumen.parsed,
        CREATE_FINAL: disposiciones.resumen.CREATE,
        CENSAR_FINAL: disposiciones.resumen.CENSAR,
        EXCLUIR_FINAL: disposiciones.resumen.EXCLUIR,
        CUARENTENA_FINAL: disposiciones.resumen.CUARENTENA,
        SKIP_CONFLICTO_FINAL: disposiciones.resumen.SKIP_CONFLICTO,
        MAPEO_FILAS: disposiciones.resumen.mapeo.filas,
        MAPEO_CAMBIOS: disposiciones.resumen.mapeo.conCambios,
        MAPEO_COLISIONES: disposiciones.resumen.mapeo.colisiones,
        MAPEO_INVALIDAS: mapeoInvalidas,
        MAPEO_D1_FILAS: disposiciones.resumen.mapeo.d1.filas,
        MAPEO_D1_CAMBIOS: disposiciones.resumen.mapeo.d1.conCambios,
        MAPEO_D5_CHARSET_TOTAL:
            disposiciones.resumen.mapeo.d5.charsetTotal,
        MAPEO_D5_CANDIDATAS:
            disposiciones.resumen.mapeo.d5.candidatas,
        MAPEO_D5_ELEGIBLES:
            disposiciones.resumen.mapeo.d5.elegibles,
        MAPEO_D5_CREADAS: disposiciones.resumen.mapeo.d5.creadas,
        MAPEO_D5_SKIP_CONFLICTO:
            disposiciones.resumen.mapeo.d5.skipConflicto,
        MAPEO_D5_TEXTO_LIBRE:
            disposiciones.resumen.mapeo.d5.textoLibre,
        MAPEO_D5_SIMBOLO_INVALIDO:
            disposiciones.resumen.mapeo.d5.simboloInvalido,
        MAPEO_D5_OTRO_DEFECTO:
            disposiciones.resumen.mapeo.d5.otroDefecto,
        MAPEO_D5_FUERA_DE_ALCANCE:
            disposiciones.resumen.mapeo.d5.fueraDeAlcance,
        MAPEO_D5_COLISIONES:
            disposiciones.resumen.mapeo.d5.colisiones,
        MAPEO_D5_IDENTIDAD: d5Identidad ? 'PASS' : 'FAIL',
        CREATE_MATCH:
            pasada1.operaciones.CREATE === disposiciones.resumen.CREATE
                ? 'PASS'
                : 'FAIL',
        IMPORT_KEY_COLLISIONS: colisiones.import_key_colisiones,
        REFERENCIAS_DUPLICADAS:
            colisiones.referencias_duplicadas.length,
        EAN13_COLISION_MAESTRA:
            colisiones.ean_colision_maestra.length,
        EAN13_COMPARTIDOS: colisiones.ean_compartidos.length,
        EAN_DISPOSITIONS: eanDisposiciones.match,
        EAN_CUARENTENA_CONFIG: eanDisposiciones.cuarentena_config,
        EAN_CUARENTENA_ENCONTRADAS:
            eanDisposiciones.cuarentena_encontradas,
        EAN_KEEP_CONFIG: eanDisposiciones.keep_config,
        EAN_KEEP_ENCONTRADAS: eanDisposiciones.keep_encontradas,
        PASS1_CREATE: pasada1.operaciones.CREATE,
        PASS1_UPDATE: pasada1.operaciones.UPDATE,
        PASS1_SKIP_CONFLICTO: pasada1.operaciones.SKIP_CONFLICTO,
        PASS2_CREATE: pasada2.operaciones.CREATE,
        PASS2_UPDATE: pasada2.operaciones.UPDATE,
        PASS2_SKIP: pasada2.operaciones.SKIP,
        PASS2_SKIP_CONFLICTO: pasada2.operaciones.SKIP_CONFLICTO,
        FIRESTORE_WRITES: 0,
        STORAGE_WRITES: 0,
        DELETIONS: 0,
        MT5_REQUIRED: mt5Required ? 'SI' : 'NO',
        SIMULATION: 'PENDIENTE',
    };
    const simulacionOk =
        deterministic &&
        idempotente &&
        disposicionesMatch &&
        disposiciones.resumen.reconciliacion === 'PASS' &&
        d5Identidad &&
        pasada1.operaciones.CREATE === disposiciones.resumen.CREATE &&
        colisiones.import_key_colisiones === 0 &&
        eanDisposiciones.match === 'MATCH' &&
        !mt5Required;
    gatesSimulacion.SIMULATION = simulacionOk ? 'PASS' : 'FAIL';

    const simulacion: Simulacion = {
        ticket: TICKET,
        fase: 'F1',
        generated_at: generatedAt,
        read_only: true,
        project: PROJECT_ID,
        input: {
            run_dir: options.runDir,
            csv_sha256: csvSha256,
            dry_run_status: String(dryRun.status),
            dry_run_parse_hash: String(dryRun.parse?.parse_hash),
            source_sha256: String(dryRun.source?.sha256_esperado),
            filas_datos: csv.filas.length,
        },
        snapshot: {
            inventario_total: inventarioTotal,
            maestras_count: maestrasCount,
            conteos_total: conteosTotal,
            ledger_total: ledgerTotal,
            vacio: snapshotVacio,
        },
        propuestas: {
            total: propuestas.length,
            referencias_unicas: referenciasUnicas,
            payload_hash: payloadHash,
        },
        disposiciones: {
            config_sha256: configSha256,
            resumen: disposiciones.resumen,
            ean: eanDisposiciones,
            mapeo: disposiciones.mapeo,
        },
        pasada_1: {
            operaciones: pasada1.operaciones,
            estado_hash: estado1Hash,
            ledger_entries: pasada1Ledger,
        },
        pasada_2: {
            operaciones: pasada2.operaciones,
            estado_hash: estado2Hash,
            ledger_entries: pasada2Ledger,
        },
        contrafactual_ultima_gana: {
            pasada_1: ultimaGana1.operaciones,
            pasada_2: ultimaGana2.operaciones,
            idempotente: idempotenteUltimaGana,
        },
        conflictos: pasada1.conflictos,
        colisiones,
        gates: gatesSimulacion,
        status: simulacionOk ? 'PASS' : 'FAIL',
    };

    escribir(outDir, simulacion);
    imprimir(simulacion);
    console.log(`OUT_DIR=${outDir}`);
    if (!simulacionOk) process.exitCode = 1;
}

main().catch((error: unknown) => {
    const ingestaError =
        error instanceof IngestaError
            ? error
            : new IngestaError(
                  'SIMULACION_EXCEPTION',
                  error instanceof Error ? error.message : String(error)
              );
    console.error('SIMULATION=FAIL');
    console.error(`FAIL_CODE=${ingestaError.code}`);
    console.error(`FAIL_MESSAGE=${ingestaError.message}`);
    if (ingestaError.detail !== undefined) {
        console.error(
            `FAIL_DETAIL=${JSON.stringify(ingestaError.detail)}`
        );
    }
    process.exitCode = 1;
});
