import { describe, expect, it, vi } from 'vitest';
import {
    MATCHING_VISUAL_PROMPT,
    VISION_MATCHING_MAX_TOKENS,
    agregarAuditoriaSemanal,
    analizarMatchingVisual,
    construirPayloadMatchingVisual,
    normalizarMatchingVisual,
    seleccionarMejorMatching,
} from '@/lib/inventario/matching-visual';
import type { MatchingVisualPar } from '@/types/inventario';

const URL_A =
    'https://firebasestorage.googleapis.com/v0/b/tiendalasmotos.appspot.com/o/inventario_repuestos%2Fasesor%40test.com%2Fa.jpg?alt=media&token=a';
const URL_B =
    'https://firebasestorage.googleapis.com/v0/b/tiendalasmotos.appspot.com/o/inventario_repuestos%2Fadmin%40test.com%2Fb.jpg?alt=media&token=b';

function respuestaConJson(data: unknown, status = 200): Response {
    return new Response(
        JSON.stringify({
            choices: [
                {
                    message: { content: JSON.stringify(data) },
                    finish_reason: 'stop',
                },
            ],
        }),
        {
            status,
            headers: { 'content-type': 'application/json' },
        }
    );
}

function par(
    documentoId: string,
    estado: MatchingVisualPar['estado'],
    confianza: number
): MatchingVisualPar {
    return {
        documento_id: documentoId,
        referencia: `REF-${documentoId}`,
        estado,
        coincide: estado === 'coincide',
        confianza,
        justificacion: '',
        latencia_ms: 100,
    };
}

describe('matching visual puro', () => {
    it('usa el prompt exacto del contrato y dos imágenes', () => {
        const payload = construirPayloadMatchingVisual('modelo/x', URL_A, URL_B);
        const mensajes = payload.messages as Array<{
            content: Array<{ type: string; image_url?: { url: string } }>;
        }>;

        expect(MATCHING_VISUAL_PROMPT).toContain('imagen A');
        expect(MATCHING_VISUAL_PROMPT).toContain('imagen B');
        expect(MATCHING_VISUAL_PROMPT).toContain('coincide');
        expect(payload.temperature).toBe(0);
        expect(payload.max_tokens).toBe(VISION_MATCHING_MAX_TOKENS);
        expect(mensajes[1].content.filter((item) => item.type === 'image_url')).toHaveLength(2);
        expect(mensajes[1].content[1].image_url?.url).toBe(URL_A);
        expect(mensajes[1].content[2].image_url?.url).toBe(URL_B);
        expect(JSON.stringify(payload)).not.toContain('base64');
    });

    it('normaliza booleanos, porcentajes y justificación', () => {
        expect(
            normalizarMatchingVisual({
                coincide: 'sí',
                confianza: 87,
                justificacion: '  Misma carcasa y número de parte.  ',
            })
        ).toEqual({
            coincide: true,
            confianza: 0.87,
            justificacion: 'Misma carcasa y número de parte.',
        });
        expect(
            normalizarMatchingVisual({ coincide: false, confianza: '0.4' })
        ).toEqual({ coincide: false, confianza: 0.4, justificacion: '' });
        expect(normalizarMatchingVisual({ coincide: null, confianza: 1 })).toBeNull();
        expect(normalizarMatchingVisual({ coincide: true, confianza: 130 })).toBeNull();
        expect(normalizarMatchingVisual('no-json')).toBeNull();
    });

    it('devuelve coincide/no_coincide desde OpenRouter', async () => {
        const fetchImpl = vi.fn(async () =>
            respuestaConJson({
                coincide: true,
                confianza: 0.82,
                justificacion: 'Misma referencia visual.',
            })
        );

        const resultado = await analizarMatchingVisual({
            apiKey: 'key',
            modelo: 'z-ai/glm-5.3-flash',
            urlA: URL_A,
            urlB: URL_B,
            fetchImpl,
        });

        expect(resultado.estado).toBe('coincide');
        expect(resultado.coincide).toBe(true);
        expect(resultado.confianza).toBe(0.82);
        expect(resultado.latencia_ms).toBeGreaterThanOrEqual(0);
        expect(fetchImpl).toHaveBeenCalledTimes(1);
    });

    it('mapea HTTP 429 y JSON inválido a error no bloqueante', async () => {
        const httpError = await analizarMatchingVisual({
            apiKey: 'key',
            modelo: 'z-ai/glm-5.3-flash',
            urlA: URL_A,
            urlB: URL_B,
            fetchImpl: vi.fn(async () => new Response('{}', { status: 429 })),
        });
        expect(httpError.estado).toBe('error');

        const jsonError = await analizarMatchingVisual({
            apiKey: 'key',
            modelo: 'z-ai/glm-5.3-flash',
            urlA: URL_A,
            urlB: URL_B,
            fetchImpl: vi.fn(
                async () =>
                    new Response(
                        JSON.stringify({
                            choices: [
                                {
                                    message: { content: 'sin json' },
                                    finish_reason: 'stop',
                                },
                            ],
                        }),
                        { status: 200 }
                    )
            ),
        });
        expect(jsonError.estado).toBe('error');
    });

    it('mapea timeout a estado timeout', async () => {
        const errorTimeout = new Error('timeout');
        errorTimeout.name = 'TimeoutError';

        const resultado = await analizarMatchingVisual({
            apiKey: 'key',
            modelo: 'z-ai/glm-5.3-flash',
            urlA: URL_A,
            urlB: URL_B,
            fetchImpl: vi.fn(async () => {
                throw errorTimeout;
            }),
        });

        expect(resultado.estado).toBe('timeout');
        expect(resultado.coincide).toBe(false);
    });

    it('selecciona el mayor confidence solo entre coincidencias', () => {
        expect(
            seleccionarMejorMatching([
                par('a', 'no_coincide', 0.99),
                par('b', 'coincide', 0.7),
                par('c', 'coincide', 0.9),
            ])?.documento_id
        ).toBe('c');
        expect(
            seleccionarMejorMatching([par('a', 'no_coincide', 0.99)])
        ).toBeNull();
    });

    it('agrega auditoría semanal con mediana y p95', () => {
        const resumen = agregarAuditoriaSemanal([
            {
                estado: 'coincide',
                latencia_ms: 100,
                referencia: 'BRK-1',
                foto_storage_path: 'f1',
                asesor_email: 'a@test.com',
            },
            {
                estado: 'no_coincide',
                latencia_ms: 200,
                referencia: 'BRK-2',
                foto_storage_path: 'f2',
                asesor_email: 'a@test.com',
            },
            {
                estado: 'timeout',
                latencia_ms: 300,
                referencia: 'BRK-2',
                foto_storage_path: 'f3',
                asesor_email: 'b@test.com',
            },
        ]);

        expect(resumen.total).toBe(3);
        expect(resumen.coincide).toBe(1);
        expect(resumen.noCoincide).toBe(1);
        expect(resumen.timeout).toBe(1);
        expect(resumen.tasaCoincidencia).toBeCloseTo(1 / 3);
        expect(resumen.medianaLatenciaMs).toBe(200);
        expect(resumen.p95LatenciaMs).toBe(300);
        expect(resumen.fotosUnicas).toBe(3);
        expect(resumen.asesoresUnicos).toBe(2);
        expect(resumen.referenciasTop[0]).toEqual({
            referencia: 'BRK-2',
            total: 2,
        });
    });
});
