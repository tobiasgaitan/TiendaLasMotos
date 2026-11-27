import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OPENROUTER_ENDPOINT } from '@/lib/vision-client';

const mocks = vi.hoisted(() => ({
    verifyIdToken: vi.fn(),
    requirePermiso: vi.fn(),
}));

vi.mock('@/lib/firebase-admin', () => ({
    getAdminAuth: () => ({ verifyIdToken: mocks.verifyIdToken }),
}));

vi.mock('@/lib/auth/require-permiso', () => ({
    requirePermiso: mocks.requirePermiso,
}));

import { analizarImagenConVision } from '@/app/admin/inventario-asesor/actions/analizarImagenConVision';

const FOTO_URL =
    'https://firebasestorage.googleapis.com/v0/b/tiendalasmotos.appspot.com/o/inventario_repuestos%2Fasesor%40test.com%2Ffoto.jpg?alt=media&token=abc';
const FOTO_URL_AJENA =
    'https://firebasestorage.googleapis.com/v0/b/tiendalasmotos.appspot.com/o/inventario_repuestos%2Fotro%40test.com%2Ffoto.jpg?alt=media&token=abc';
const ACTOR = { uid: 'uid-asesor', idToken: 'token' };

function fotoResponse(): Response {
    return new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: {
            'content-type': 'image/jpeg',
            'content-length': '3',
        },
    });
}

function openRouterResponse(
    contenido: Record<string, unknown> = {
        puede_contar: true,
        cantidad_sugerida: 6,
        justificacion: 'Seis unidades visibles.',
        confidence: 0.81,
        saturada: false,
        motivo_no_conteo: null,
    }
): Response {
    return new Response(
        JSON.stringify({
            choices: [
                {
                    message: { content: JSON.stringify(contenido) },
                    finish_reason: 'stop',
                },
            ],
        }),
        {
            status: 200,
            headers: { 'content-type': 'application/json' },
        }
    );
}

function instalarFetch(
    handler: (url: string) => Response | Promise<Response>
): ReturnType<typeof vi.fn> {
    const fetchMock = vi.fn(
        async (input: string | URL | Request): Promise<Response> => {
            return handler(String(input));
        }
    );
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
}

describe('analizarImagenConVision', () => {
    beforeEach(() => {
        vi.stubEnv('OPENROUTER_API_KEY', 'sk-test');
        vi.stubEnv('VISION_MODEL_SLUG', 'google/gemini-flash-1.5');
        mocks.verifyIdToken.mockResolvedValue({
            uid: 'uid-asesor',
            email: 'asesor@test.com',
        });
        mocks.requirePermiso.mockResolvedValue({
            rol: 'asesor',
            email: 'asesor@test.com',
        });
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.unstubAllEnvs();
    });

    it('descarga la foto, llama a OpenRouter y devuelve la sugerencia', async () => {
        const fetchMock = instalarFetch((url) => {
            if (url === FOTO_URL) return fotoResponse();
            if (url === OPENROUTER_ENDPOINT) return openRouterResponse();
            throw new Error(`fetch inesperado: ${url}`);
        });

        const resultado = await analizarImagenConVision(
            { foto_url: FOTO_URL },
            ACTOR
        );

        expect(resultado.success).toBe(true);
        if (resultado.success) {
            expect(resultado.conteo.cantidad_sugerida_multimodal).toBe(6);
            expect(resultado.conteo.confidence_multimodal).toBe(0.81);
            expect(resultado.conteo.puede_contar).toBe(true);
        }
        expect(mocks.verifyIdToken).toHaveBeenCalledWith('token');
        expect(mocks.requirePermiso).toHaveBeenCalledWith(
            { uid: 'uid-asesor', email: 'asesor@test.com' },
            'fotos_inventario',
            'create',
            { asesor_email: 'asesor@test.com' }
        );
        expect(fetchMock).toHaveBeenCalledTimes(2);

        const [, initOpenRouter] = fetchMock.mock.calls[1] as [
            string,
            RequestInit,
        ];
        const headers = initOpenRouter.headers as Record<string, string>;
        expect(headers.Authorization).toBe('Bearer sk-test');
        const body = JSON.parse(String(initOpenRouter.body)) as {
            model: string;
        };
        expect(body.model).toBe('google/gemini-flash-1.5');
    });

    it('rechaza roles distintos de asesor sin descargar la foto', async () => {
        mocks.requirePermiso.mockResolvedValue({
            rol: 'admin',
            email: 'admin@test.com',
        });
        const fetchMock = instalarFetch(() => fotoResponse());

        const resultado = await analizarImagenConVision(
            { foto_url: FOTO_URL },
            ACTOR
        );

        expect(resultado.success).toBe(false);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('rechaza una foto de otra carpeta antes de llamar a OpenRouter', async () => {
        const fetchMock = instalarFetch(() => fotoResponse());

        const resultado = await analizarImagenConVision(
            { foto_url: FOTO_URL_AJENA },
            ACTOR
        );

        expect(resultado.success).toBe(false);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('no llama a OpenRouter si la descarga falla', async () => {
        const fetchMock = instalarFetch(
            () => new Response('no encontrada', { status: 404 })
        );

        const resultado = await analizarImagenConVision(
            { foto_url: FOTO_URL },
            ACTOR
        );

        expect(resultado.success).toBe(false);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('no llama a OpenRouter si el MIME no es de imagen', async () => {
        const fetchMock = instalarFetch(
            () =>
                new Response(new Uint8Array([1]), {
                    status: 200,
                    headers: { 'content-type': 'text/html' },
                })
        );

        const resultado = await analizarImagenConVision(
            { foto_url: FOTO_URL },
            ACTOR
        );

        expect(resultado.success).toBe(false);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('falla de forma no bloqueante si falta el modelo configurado', async () => {
        vi.stubEnv('VISION_MODEL_SLUG', '');
        const fetchMock = instalarFetch(() => fotoResponse());

        const resultado = await analizarImagenConVision(
            { foto_url: FOTO_URL },
            ACTOR
        );

        expect(resultado.success).toBe(false);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('propaga un fallo de OpenRouter como resultado no bloqueante', async () => {
        const fetchMock = instalarFetch((url) => {
            if (url === FOTO_URL) return fotoResponse();
            return new Response('ocupado', { status: 429 });
        });

        const resultado = await analizarImagenConVision(
            { foto_url: FOTO_URL },
            ACTOR
        );

        expect(resultado.success).toBe(false);
        if (!resultado.success) {
            expect(resultado.message.toLowerCase()).toContain('ocupado');
        }
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });
});
