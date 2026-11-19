/**
 * WEB-INV-INGESTA-001-F1 — Fuente congelada y conversión CSV.
 *
 * Módulo compartido por el dry-run (MT-2) y la simulación de idempotencia
 * (MT-3). No importa Firestore ni Storage: solo filesystem, LibreOffice y
 * Papaparse. Mantener aquí la preparación del CSV garantiza que ambos
 * scripts parseen exactamente las mismas filas.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
    existsSync,
    readFileSync,
    readdirSync,
    statSync,
} from 'node:fs';
import { join } from 'node:path';
import Papa from 'papaparse';
import {
    SOURCE_DATA_START_ROW,
    SOURCE_HEADERS,
    verificarHeaders,
    type FilaOrigen,
    type HeaderCheck,
} from './inv-ingesta-utils';

export const SOURCE_PATH_DEFAULT =
    '/Users/tobiasgaitangallego/Desktop/Actualizar pagina web/inventario existencia totales (1).xlsx';

export const SOFFICE_DEFAULT =
    '/Applications/LibreOffice.app/Contents/MacOS/soffice';

export const CSV_FILTER =
    'csv:Text - txt - csv (StarCalc):44,34,76,1,,0,false,true,true,false,false,-1';

export class IngestaError extends Error {
    constructor(
        readonly code: string,
        message: string,
        readonly detail?: unknown
    ) {
        super(message);
        this.name = 'IngestaError';
    }
}

export function sha256Texto(value: string): string {
    return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function sha256Archivo(ruta: string): string {
    return createHash('sha256').update(readFileSync(ruta)).digest('hex');
}

export function sha256Json(value: unknown): string {
    return sha256Texto(JSON.stringify(value));
}

export interface CsvPreparado {
    headerCheck: HeaderCheck;
    filas: FilaOrigen[];
    filasCsv: number;
    filasVaciasFinales: number;
    titulo: string;
}

export function convertirCsv(
    xlsx: string,
    workDir: string,
    soffice: string
): { csvPath: string; procesos: string } {
    if (!existsSync(soffice)) {
        throw new IngestaError(
            'LIBREOFFICE_NOT_FOUND',
            `No existe el binario de LibreOffice: ${soffice}`
        );
    }

    let salida = '';
    try {
        salida = String(
            execFileSync(
                soffice,
                [
                    '--headless',
                    '--convert-to',
                    CSV_FILTER,
                    '--outdir',
                    workDir,
                    xlsx,
                ],
                {
                    encoding: 'utf8',
                    timeout: 300_000,
                    stdio: ['ignore', 'pipe', 'pipe'],
                }
            )
        );
    } catch (error) {
        const detalle =
            error instanceof Error ? error.message : String(error);
        throw new IngestaError('CSV_CONVERSION_ERROR', detalle, {
            salida,
        });
    }

    const csvs = readdirSync(workDir).filter((archivo) =>
        archivo.toLowerCase().endsWith('.csv')
    );
    if (csvs.length !== 1) {
        throw new IngestaError(
            'CSV_NOT_FOUND',
            `CSV encontrados: ${csvs.length}`,
            {
                archivos: csvs,
                salida,
            }
        );
    }

    return { csvPath: join(workDir, csvs[0]), procesos: salida.trim() };
}

export function prepararCsv(csvPath: string): CsvPreparado {
    const texto = readFileSync(csvPath, 'utf8');
    const parsed = Papa.parse<string[]>(texto, {
        skipEmptyLines: false,
    });
    if (parsed.errors.length > 0) {
        throw new IngestaError(
            'CSV_PARSE_ERROR',
            `Papaparse reportó ${parsed.errors.length} error(es).`,
            parsed.errors.slice(0, 20)
        );
    }

    const filasCsv = parsed.data.map((fila) =>
        fila.map((celda) =>
            celda === null || celda === undefined ? '' : String(celda)
        )
    );

    let filasVaciasFinales = 0;
    while (
        filasCsv.length > 0 &&
        filasCsv[filasCsv.length - 1].every(
            (celda) => celda.trim() === ''
        )
    ) {
        filasCsv.pop();
        filasVaciasFinales += 1;
    }

    if (filasCsv.length < 2) {
        throw new IngestaError(
            'CSV_SIN_HEADERS',
            `El CSV solo tiene ${filasCsv.length} fila(s).`
        );
    }

    const headerCheck = verificarHeaders(filasCsv[1]);
    const filasDatos = filasCsv.slice(2);
    const columnasInvalidas: Array<{ fila: number; columnas: number }> = [];
    for (let index = 0; index < filasDatos.length; index += 1) {
        if (filasDatos[index].length !== SOURCE_HEADERS.length) {
            columnasInvalidas.push({
                fila: SOURCE_DATA_START_ROW + index,
                columnas: filasDatos[index].length,
            });
        }
    }
    if (columnasInvalidas.length > 0) {
        throw new IngestaError(
            'CSV_COLUMN_COUNT_MISMATCH',
            `${columnasInvalidas.length} fila(s) no tienen ${SOURCE_HEADERS.length} columnas.`,
            {
                total: columnasInvalidas.length,
                muestra: columnasInvalidas.slice(0, 50),
            }
        );
    }

    const filas: FilaOrigen[] = filasDatos.map((fila, index) => ({
        fila: SOURCE_DATA_START_ROW + index,
        valores: Object.fromEntries(
            SOURCE_HEADERS.map((header, columna) => [
                header,
                fila[columna] ?? '',
            ])
        ),
    }));

    return {
        headerCheck,
        filas,
        filasCsv: filasCsv.length,
        filasVaciasFinales,
        titulo: filasCsv[0].filter((celda) => celda.trim() !== '').join(' | '),
    };
}

export function statCsv(csvPath: string): { bytes: number } {
    return { bytes: statSync(csvPath).size };
}
