import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/firebase', () => ({
    storage: {},
}));

vi.mock('firebase/storage', () => ({
    ref: vi.fn((_storage: unknown, path: string) => ({ path })),
    uploadBytes: vi.fn(async () => undefined),
    getDownloadURL: vi.fn(
        async () =>
            'https://firebasestorage.googleapis.com/v0/b/test/o/inventario_repuestos%2Fasesor%40test.com%2Ffoto.jpg?alt=media&token=abc'
    ),
}));

vi.mock('@/app/admin/inventory/actions/crearConteoPendiente', () => ({
    crearConteoPendiente: vi.fn(),
}));

import { crearConteoPendiente } from '@/app/admin/inventory/actions/crearConteoPendiente';
import {
    encolarConteo,
    limpiarOutbox,
    listarBorradores,
    OUTBOX_DB,
    sincronizarOutbox,
} from '@/lib/offline/outbox';
import {
    OUTBOX_DB_NAME,
    OUTBOX_STORE_BORRADORES,
    OUTBOX_STORE_FOTOS,
} from '@/lib/offline/outbox-utils';

const UUID_A = '550e8400-e29b-41d4-a716-446655440001';
const UUID_B = '550e8400-e29b-41d4-a716-446655440002';
const STORAGE_PATH_A = `inventario_repuestos/asesor@test.com/${UUID_A}.jpg`;
const STORAGE_PATH_B = `inventario_repuestos/asesor@test.com/${UUID_B}.jpg`;
const FOTO_URL_A = `https://firebasestorage.googleapis.com/v0/b/test/o/${encodeURIComponent(STORAGE_PATH_A)}?alt=media&token=a`;
const FOTO_URL_B = `https://firebasestorage.googleapis.com/v0/b/test/o/${encodeURIComponent(STORAGE_PATH_B)}?alt=media&token=b`;

const ENTRADA = {
    referencia_sugerida: '',
    referencia_confirmada: 'BRK-001',
    descripcion: 'Disco de freno',
    cantidad_contada: 4,
    ubicacion: 'A-01-05',
    anotaciones: '',
    etiquetas_vision: [],
};

function fotoSubida(conteoId: string, storagePath: string, fotoUrl: string) {
    return {
        foto_url: fotoUrl,
        storage_path: storagePath,
        nombre_archivo: 'foto.jpg',
        mime_type: 'image/jpeg' as const,
        tamano_bytes: 1024,
    };
}

function blobVacio(): Blob {
    return new Blob([new Uint8Array([1])], { type: 'image/jpeg' });
}

async function encolar(
    uid: string,
    conteoId: string,
    storagePath: string,
    fotoUrl: string
): Promise<void> {
    await encolarConteo(
        ENTRADA,
        blobVacio(),
        'asesor@test.com',
        uid,
        {
            conteoId,
            fotoSubida: fotoSubida(conteoId, storagePath, fotoUrl),
        }
    );
}

async function abrirDbDirecto(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const solicitud = indexedDB.open(OUTBOX_DB_NAME, 2);
        solicitud.onsuccess = () => resolve(solicitud.result);
        solicitud.onerror = () => reject(solicitud.error);
    });
}

beforeEach(async () => {
    await limpiarOutbox();
    vi.mocked(crearConteoPendiente).mockReset();
    vi.mocked(crearConteoPendiente).mockResolvedValue({
        success: true,
        id: UUID_A,
    });
});

describe('MT-08 outbox/offline contracts', () => {
    it('encola con propietario y lista solo los propios', async () => {
        await encolar('uid-A', UUID_A, STORAGE_PATH_A, FOTO_URL_A);
        await encolar('uid-B', UUID_B, STORAGE_PATH_B, FOTO_URL_B);

        const propios = await listarBorradores('uid-A');
        expect(propios).toHaveLength(1);
        expect(propios[0].conteo_id).toBe(UUID_A);
        expect((await listarBorradores('uid-B'))[0].conteo_id).toBe(UUID_B);
    });

    it('rechaza encolar sin propietario', async () => {
        await expect(
            encolarConteo(
                ENTRADA,
                blobVacio(),
                'asesor@test.com',
                '',
                {
                    conteoId: UUID_A,
                    fotoSubida: fotoSubida(
                        UUID_A,
                        STORAGE_PATH_A,
                        FOTO_URL_A
                    ),
                }
            )
        ).rejects.toThrow(/propietario/i);
    });

    it('purga solo el propietario solicitado', async () => {
        await encolar('uid-A', UUID_A, STORAGE_PATH_A, FOTO_URL_A);
        await encolar('uid-B', UUID_B, STORAGE_PATH_B, FOTO_URL_B);

        await limpiarOutbox('uid-A');

        expect(await listarBorradores('uid-A')).toHaveLength(0);
        expect(await listarBorradores('uid-B')).toHaveLength(1);
    });

    it('ignora registros legacy sin propietario_uid', async () => {
        const db = await abrirDbDirecto();
        await new Promise<void>((resolve, reject) => {
            const tx = db.transaction(OUTBOX_STORE_BORRADORES, 'readwrite');
            tx.objectStore(OUTBOX_STORE_BORRADORES).put({
                conteo_id: UUID_A,
                payload: ENTRADA,
                intentos: 0,
                estado_envio: 'pendiente',
                creado_en: Date.now(),
                actualizado_en: Date.now(),
                proximo_intento_en: 0,
                ultimo_error: '',
            });
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
        db.close();

        expect(await listarBorradores('uid-A')).toHaveLength(0);
    });

    it('sync exitoso purga borrador propio', async () => {
        await encolar('uid-A', UUID_A, STORAGE_PATH_A, FOTO_URL_A);

        const resultado = await sincronizarOutbox({
            uid: 'uid-A',
            idToken: 'token',
        });

        expect(resultado.exitosos).toBe(1);
        expect(resultado.fallidos).toBe(0);
        expect(await listarBorradores('uid-A')).toHaveLength(0);
    });

    it('respuesta perdida conserva el borrador como error', async () => {
        vi.mocked(crearConteoPendiente).mockRejectedValueOnce(
            new Error('network lost after server commit')
        );
        await encolar('uid-A', UUID_A, STORAGE_PATH_A, FOTO_URL_A);

        const resultado = await sincronizarOutbox({
            uid: 'uid-A',
            idToken: 'token',
        });

        expect(resultado.fallidos).toBe(1);
        const pendientes = await listarBorradores('uid-A');
        expect(pendientes).toHaveLength(1);
        expect(pendientes[0].estado_envio).toBe('error');
        expect(pendientes[0].intentos).toBe(1);
        expect(pendientes[0].ultimo_error).toContain('network lost');
    });

    it('fallo de delete IndexedDB conserva el borrador', async () => {
        await encolar('uid-A', UUID_A, STORAGE_PATH_A, FOTO_URL_A);
        const storeDelete = vi
            .spyOn(IDBObjectStore.prototype, 'delete')
            .mockImplementationOnce(() => {
                throw new Error('idb delete failed');
            });

        const resultado = await sincronizarOutbox({
            uid: 'uid-A',
            idToken: 'token',
        });

        storeDelete.mockRestore();
        expect(resultado.fallidos).toBe(1);
        const pendientes = await listarBorradores('uid-A');
        expect(pendientes).toHaveLength(1);
        expect(pendientes[0].estado_envio).toBe('error');
    });

    it('outbox no contiene fallback global en la rama owner-scoped', () => {
        const source = readFileSync('src/lib/offline/outbox.ts', 'utf8');
        const inicio = source.indexOf('export async function limpiarOutbox');
        const fin = source.indexOf('Purga global explícita sin propietario');
        const ramaOwner = source.slice(inicio, fin);

        expect(ramaOwner).toContain('marcarErrorPurgaOwner');
        expect(ramaOwner).not.toContain('.clear()');
    });

    it('el hook no abre IndexedDB para roles no asesor', () => {
        const source = readFileSync('src/hooks/useOfflineQueue.ts', 'utf8');
        const efecto = source.slice(
            source.indexOf('useEffect(() => {'),
            source.indexOf('}, [activo, uid, actualizarPendientes, sincronizarAhora]);')
        );

        expect(efecto).toContain('if (!activo || !uid)');
    });

    it('las stores canónicas siguen siendo tlm_offline borradores/fotos', async () => {
        expect(OUTBOX_DB_NAME).toBe('tlm_offline');
        expect(OUTBOX_DB).toBe('tlm_offline');
        expect(OUTBOX_STORE_BORRADORES).toBe('borradores_conteos');
        expect(OUTBOX_STORE_FOTOS).toBe('fotos_borrador');
    });
});
