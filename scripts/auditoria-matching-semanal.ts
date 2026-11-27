/**
 * WEB-INV-051 — Auditoría semanal read-only del matching visual.
 *
 * Uso:
 *   npx tsx scripts/auditoria-matching-semanal.ts
 *   npx tsx scripts/auditoria-matching-semanal.ts --dias=7 --project=tiendalasmotos
 *
 * No escribe en Firestore, Storage ni en el repositorio. Solo lee
 * `auditoria_matching_visual` con Firebase Admin (ADC) y agrega los resultados.
 */

import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { parseArgs } from 'node:util';
import {
    agregarAuditoriaSemanal,
    type RegistroAuditoriaMatching,
} from '../src/lib/inventario/matching-visual';
import type { MatchingVisualEstado } from '../src/types/inventario';

const ESTADOS_VALIDOS: readonly MatchingVisualEstado[] = [
    'coincide',
    'no_coincide',
    'sin_referencia',
    'timeout',
    'error',
];

const ESTADOS = new Set<string>(ESTADOS_VALIDOS);

interface Opciones {
    dias: number;
    projectId: string;
    limite: number;
}

function leerOpciones(): Opciones {
    const { values } = parseArgs({
        options: {
            dias: { type: 'string', default: '7' },
            project: { type: 'string', default: 'tiendalasmotos' },
            limite: { type: 'string', default: '5000' },
        },
        strict: true,
    });

    const dias = Number(values.dias);
    const limite = Number(values.limite);
    const projectId =
        typeof values.project === 'string' ? values.project.trim() : '';

    if (!Number.isInteger(dias) || dias < 1 || dias > 90) {
        throw new Error('--dias debe ser un entero entre 1 y 90.');
    }
    if (!Number.isInteger(limite) || limite < 1 || limite > 20_000) {
        throw new Error('--limite debe ser un entero entre 1 y 20000.');
    }
    if (!projectId) {
        throw new Error('--project no puede estar vacío.');
    }

    return { dias, projectId, limite };
}

function texto(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

function numero(value: unknown): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function aFecha(value: unknown): Date | null {
    if (value instanceof Date) return value;
    if (value && typeof value === 'object') {
        const candidato = value as { toDate?: unknown };
        if (typeof candidato.toDate === 'function') {
            try {
                return (candidato.toDate as () => Date).call(candidato);
            } catch {
                return null;
            }
        }
    }
    return null;
}

function formatearMs(valor: number): string {
    return `${Math.round(valor)} ms`;
}

async function main(): Promise<void> {
    const opciones = leerOpciones();
    const envProject = texto(process.env.PROJECT_ID);
    if (envProject && envProject !== opciones.projectId) {
        throw new Error(
            `PROYECTO_NO_AUTORIZADO: PROJECT_ID=${envProject} no coincide con ${opciones.projectId}.`
        );
    }

    const app =
        getApps()[0] ??
        initializeApp({ projectId: opciones.projectId });
    const db = getFirestore(app);
    const desde = new Date(
        Date.now() - opciones.dias * 24 * 60 * 60 * 1000
    );

    const snap = await db
        .collection('auditoria_matching_visual')
        .where('creado_en', '>=', desde)
        .orderBy('creado_en', 'desc')
        .limit(opciones.limite)
        .get();

    const registros: RegistroAuditoriaMatching[] = snap.docs.map((doc) => {
        const data = doc.data() as Record<string, unknown>;
        const estadoRaw = texto(data.estado);
        const estado: MatchingVisualEstado = ESTADOS.has(estadoRaw)
            ? (estadoRaw as MatchingVisualEstado)
            : 'error';
        return {
            estado,
            latencia_ms: numero(data.latencia_ms),
            documento_id: texto(data.documento_id) || null,
            referencia: texto(data.referencia) || null,
            foto_storage_path: texto(data.foto_storage_path) || null,
            asesor_email: texto(data.asesor_email) || null,
        };
    });

    const resumen = agregarAuditoriaSemanal(registros);

    console.log('Auditoría semanal de matching visual (read-only)');
    console.log(`Proyecto: ${opciones.projectId}`);
    console.log(`Ventana: últimos ${opciones.dias} días`);
    console.log(`Registros: ${resumen.total}`);
    console.log('');
    console.log('Resultados');
    console.log(`- Coincide: ${resumen.coincide}`);
    console.log(`- No coincide: ${resumen.noCoincide}`);
    console.log(`- Sin referencia: ${resumen.sinReferencia}`);
    console.log(`- Timeout: ${resumen.timeout}`);
    console.log(`- Error: ${resumen.error}`);
    console.log(
        `- Tasa de coincidencia: ${(resumen.tasaCoincidencia * 100).toFixed(1)}%`
    );
    console.log('');
    console.log('Latencia');
    console.log(`- Mediana: ${formatearMs(resumen.medianaLatenciaMs)}`);
    console.log(`- p95: ${formatearMs(resumen.p95LatenciaMs)}`);
    console.log('');
    console.log('Cobertura');
    console.log(`- Fotos únicas: ${resumen.fotosUnicas}`);
    console.log(`- Asesores únicos: ${resumen.asesoresUnicos}`);

    if (resumen.referenciasTop.length > 0) {
        console.log('');
        console.log('Referencias más sugeridas');
        for (const item of resumen.referenciasTop) {
            console.log(`- ${item.referencia}: ${item.total}`);
        }
    }

    if (resumen.total === 0) {
        console.log('');
        console.log('Sin registros en la ventana solicitada.');
    }
}

main().catch((error) => {
    console.error(
        '[auditoria-matching-semanal] falló:',
        error instanceof Error ? error.message : error
    );
    process.exitCode = 1;
});
