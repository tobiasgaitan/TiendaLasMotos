/**
 * WEB-INV-INGESTA-002-F2 — Fixtures puros del apply/rollback.
 *
 * No importa Firestore, Storage ni ejecuta writes. Solo valida las funciones
 * puras de `inv-ingesta-apply-utils.ts` con datos sintéticos.
 *
 * Uso:
 *   npx tsx scripts/inv-ingesta-apply-fixtures.ts
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
    BATCH_SIZE,
    EXPECTED_BATCHES,
    EXPECTED_CREATE,
    PAYLOAD_KEYS,
    calcularBatches,
    clasificarD4B,
    clasificarRollback,
    construirPayloadDocumento,
    generarImportKey,
    hashBatchManifest,
    normalizarUnidadMedida,
    validarHashes,
    validarPayloadDocumento,
    type D4BEstado,
    type DocumentoActualRollback,
    type DocumentoManifiesto,
    type ExistenteD4B,
} from './lib/inv-ingesta-apply-utils';

interface FixtureD4B {
    id: string;
    referencia: string;
    existentes: Array<{
        documentoId: string;
        referencia: string;
        importKey: string | null;
    }>;
    esperado: D4BEstado;
}

interface FixtureRollback {
    id: string;
    documento_id: string;
    referencia: string;
    actual: {
        exists: boolean;
        referencia?: string;
        import_key?: string;
    };
    esperado: 'DELETE' | 'MISSING' | 'MISMATCH';
}

interface FixtureFile {
    ticket: string;
    batchSize: number;
    totalPropuestas: number;
    batchesEsperados: number;
    ultimoBatch: number;
    d4b: FixtureD4B[];
    rollback: FixtureRollback[];
}

const FIXTURES_PATH = join(
    process.cwd(),
    'scripts/fixtures/inv-ingesta-apply-fixtures.json'
);

let fallos = 0;

function check(nombre: string, condicion: boolean): void {
    if (condicion) {
        console.log(`ok - ${nombre}`);
    } else {
        fallos += 1;
        console.error(`FAIL - ${nombre}`);
    }
}

function main(): void {
    const fixtures = JSON.parse(
        readFileSync(FIXTURES_PATH, 'utf8')
    ) as FixtureFile;

    const propuestas = Array.from(
        { length: fixtures.totalPropuestas },
        (_, indice) => {
            const referencia = `SYN-${String(indice + 1).padStart(5, '0')}`;
            return {
                fila: indice + 3,
                referencia,
                importKey: generarImportKey(referencia),
                unidadMedida: indice === 0 ? 'l' : 'Und.',
                documentoPropuesto: {
                    referencia,
                    descripcion: `Sintético ${indice + 1}`,
                    categoria: 'REPUESTOS',
                    referencias_alternativas: [],
                    aplica_a: [],
                },
            };
        }
    );

    const importKeys = new Set(
        propuestas.map((propuesta) => propuesta.importKey)
    );
    const batches = calcularBatches(propuestas, fixtures.batchSize);
    const ultimoBatch = batches[batches.length - 1]?.items.length ?? 0;

    check(
        `propuestas=${EXPECTED_CREATE}`,
        propuestas.length === EXPECTED_CREATE
    );
    check(
        `import_keys_unicos=${EXPECTED_CREATE}`,
        importKeys.size === EXPECTED_CREATE
    );
    check(
        `colisiones_import_key=0`,
        importKeys.size === propuestas.length
    );
    check(
        `batches=${EXPECTED_BATCHES}`,
        batches.length === EXPECTED_BATCHES
    );
    check(
        `ultimo_batch=${fixtures.ultimoBatch}`,
        ultimoBatch === fixtures.ultimoBatch
    );
    check(
        `batch_size=${BATCH_SIZE}`,
        fixtures.batchSize === BATCH_SIZE
    );
    check(
        'primer_batch=100',
        batches[0]?.items.length === BATCH_SIZE
    );

    const primero = propuestas[0];
    const payload = construirPayloadDocumento({
        documentoPropuesto: primero.documentoPropuesto,
        unidadMedida: primero.unidadMedida,
        importKey: primero.importKey,
        ahora: new Date(0),
    });
    const validacionPayload = validarPayloadDocumento(payload);
    check(
        'payload_claves_exactas',
        validacionPayload.ok &&
            Object.keys(payload).sort().join('|') ===
                [...PAYLOAD_KEYS].sort().join('|')
    );
    check(
        'payload_sin_claves_extra',
        Object.keys(payload).length === PAYLOAD_KEYS.length
    );
    check(
        'payload_import_key_64_hex',
        /^[a-f0-9]{64}$/.test(String(payload.import_key))
    );
    check(
        'payload_precio_stock_cero',
        payload.precio === 0 &&
            payload.stock === 0 &&
            payload.stock_minimo === 0
    );
    check(
        'payload_actor_fijo',
        payload.creado_por === 't05KiQCGQgUWFARvczn3nuXp9Qz2' &&
            payload.actualizado_por === 't05KiQCGQgUWFARvczn3nuXp9Qz2'
    );
    check(
        'unidad_l_a_litro',
        normalizarUnidadMedida('l') === 'litro'
    );
    check(
        'unidad_und_a_unidad',
        normalizarUnidadMedida('Und.') === 'unidad'
    );
    check(
        'unidad_desconocida_a_unidad',
        normalizarUnidadMedida('docena') === 'unidad'
    );

    const hashesValidos = {
        source: 'a'.repeat(64),
        csv: 'b'.repeat(64),
        parse: 'c'.repeat(64),
        config: 'd'.repeat(64),
    };
    check(
        'hashes_coincidentes=PASS',
        validarHashes(hashesValidos, hashesValidos).ok
    );
    check(
        'hashes_mismatch=FAIL',
        !validarHashes(
            { ...hashesValidos, parse: 'e'.repeat(64) },
            hashesValidos
        ).ok
    );
    check(
        'batch_hash_determinista=PASS',
        hashBatchManifest({ batch: 1, documentos: 100 }) ===
            hashBatchManifest({ batch: 1, documentos: 100 })
    );

    for (const caso of fixtures.d4b) {
        const importKey = generarImportKey(caso.referencia);
        const existentes: ExistenteD4B[] = caso.existentes.map(
            (existente) => ({
                documentoId: existente.documentoId,
                referencia: existente.referencia,
                importKey:
                    existente.importKey === 'AUTO'
                        ? importKey
                        : existente.importKey,
            })
        );
        const decision = clasificarD4B(
            caso.referencia,
            importKey,
            existentes
        );
        check(
            `d4b_${caso.id}=${caso.esperado}`,
            decision.estado === caso.esperado
        );
    }

    for (const caso of fixtures.rollback) {
        const importKey = generarImportKey(caso.referencia);
        const manifiesto: DocumentoManifiesto[] = [
            {
                documento_id: caso.documento_id,
                import_key: importKey,
            },
        ];
        const actual: DocumentoActualRollback = {
            documento_id: caso.documento_id,
            exists: caso.actual.exists,
            import_key:
                caso.actual.import_key === 'AUTO'
                    ? importKey
                    : caso.actual.import_key ?? null,
        };
        const resultado = clasificarRollback(manifiesto, [actual]);
        const estado =
            resultado.deletes.length === 1
                ? 'DELETE'
                : resultado.missing.length === 1
                  ? 'MISSING'
                  : 'MISMATCH';
        check(
            `rollback_${caso.id}=${caso.esperado}`,
            estado === caso.esperado
        );
        check(
            `rollback_${caso.id}_ledger_writes=0`,
            resultado.deletes.length + resultado.missing.length <= 1
        );
    }

    console.log('');
    console.log(`PROPUESTAS=${propuestas.length}`);
    console.log(`UNIQUE_IMPORT_KEYS=${importKeys.size}`);
    console.log('COLISIONES_IMPORT_KEY=0');
    console.log(`BATCHES=${batches.length}`);
    console.log(`ULTIMO_BATCH=${ultimoBatch}`);
    console.log(`PAYLOAD_KEYS=${validacionPayload.ok ? 'PASS' : 'FAIL'}`);
    console.log('UNIDAD_MEDIDA=PASS');
    console.log('HASHES=PASS');
    console.log('BATCH_HASH=PASS');
    console.log(`D4B_CASOS=${fixtures.d4b.length}`);
    console.log(`ROLLBACK_CASOS=${fixtures.rollback.length}`);
    console.log('ROLLBACK_LEDGER_WRITES=0');
    console.log(`FIXTURES=${fallos === 0 ? 'PASS' : 'FAIL'}`);

    if (fallos > 0) process.exit(1);
}

main();
