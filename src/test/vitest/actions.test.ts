import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockState = vi.hoisted(() => {
    const docs = new Map<string, Record<string, unknown>>();
    const writes: Array<{
        path: string;
        kind: 'set' | 'update' | 'create';
        data: Record<string, unknown>;
    }> = [];
    let sequence = 0;

    const makeRef = (collection: string, id?: string) => {
        const ref = {
            collection,
            id: id ?? `auto-${++sequence}`,
            get path() {
                return `${this.collection}/${this.id}`;
            },
            get: async () => {
                const data = docs.get(`${collection}/${ref.id}`);
                return {
                    exists: data !== undefined,
                    data: () => data,
                };
            },
        };
        return ref;
    };

    const tx = {
        get: async (ref: { path: string }) => {
            const data = docs.get(ref.path);
            return {
                exists: data !== undefined,
                data: () => data,
            };
        },
        set: (ref: { path: string }, data: Record<string, unknown>) => {
            docs.set(ref.path, { ...data });
            writes.push({ path: ref.path, kind: 'set', data: { ...data } });
        },
        update: (ref: { path: string }, updates: Record<string, unknown>) => {
            const anterior = docs.get(ref.path) ?? {};
            const despues = { ...anterior, ...updates };
            docs.set(ref.path, despues);
            writes.push({
                path: ref.path,
                kind: 'update',
                data: { ...updates },
            });
        },
        create: (ref: { path: string }, data: Record<string, unknown>) => {
            docs.set(ref.path, { ...data });
            writes.push({ path: ref.path, kind: 'create', data: { ...data } });
        },
    };

    const db = {
        collection: (nombre: string) => ({
            doc: (id?: string) => makeRef(nombre, id),
            get: async () => ({
                docs: Array.from(docs.entries())
                    .filter(([path]) => path.startsWith(`${nombre}/`))
                    .map(([path, data]) => ({
                        id: path.slice(nombre.length + 1),
                        data: () => data,
                    })),
            }),
        }),
        runTransaction: async (
            callback: (transaction: typeof tx) => Promise<unknown>
        ) => callback(tx),
    };

    return {
        docs,
        writes,
        db,
        reset() {
            docs.clear();
            writes.length = 0;
            sequence = 0;
        },
    };
});

vi.mock('@/lib/firebase-admin', () => ({
    getDb: () => mockState.db,
}));

vi.mock('@/lib/actions/inventario-actor', () => ({
    validarActor: (actor: unknown) => {
        if (
            actor &&
            typeof actor === 'object' &&
            typeof (actor as { idToken?: unknown }).idToken === 'string'
        ) {
            return actor;
        }
        return null;
    },
    requireActorInventario: vi.fn(async () => ({
        uid: 'uid-admin',
        email: 'admin@test.com',
    })),
}));

vi.mock('@/lib/auth/require-permiso', () => ({
    requirePermiso: vi.fn(async () => ({
        rol: 'admin',
        email: 'admin@test.com',
    })),
}));

vi.mock('next/cache', () => ({
    revalidatePath: vi.fn(),
}));

import { aprobarConteo } from '@/app/admin/inventory/actions/aprobarConteo';
import { crearConteoPendiente } from '@/app/admin/inventory/actions/crearConteoPendiente';
import { rechazarConteo } from '@/app/admin/inventory/actions/rechazarConteo';
import { buscarCandidatosRepuesto } from '@/app/admin/inventory/actions/buscarCandidatosRepuesto';
import { crearRepuesto } from '@/app/admin/inventario-repuestos/actions/crearRepuesto';
import { obtenerRepuestoPorReferencia } from '@/app/admin/inventario-repuestos/actions/obtenerRepuestoPorReferencia';
import { requireActorInventario } from '@/lib/actions/inventario-actor';
import { requirePermiso } from '@/lib/auth/require-permiso';

const UUID = '550e8400-e29b-41d4-a716-446655440000';
const FOTO_URL =
    'https://firebasestorage.googleapis.com/v0/b/tiendalasmotos.appspot.com/o/inventario_repuestos%2Fasesor%40test.com%2Ffoto.jpg?alt=media&token=abc';

const ACTOR = { uid: 'uid-cliente', idToken: 'token' };

function seedConteo(estado = 'pendiente_revision') {
    mockState.docs.set(`conteos_pendientes_repuestos/${UUID}`, {
        estado,
        referencia_confirmada: 'BRK-001',
        descripcion: 'Disco de freno',
        cantidad_contada: 4,
        ubicacion: 'A-01-05',
        foto_url: FOTO_URL,
        asesor_email: 'asesor@test.com',
        asesor_uid: 'uid-asesor',
    });
}

function seedInventario() {
    mockState.docs.set('inventario_repuestos/BRK-001', {
        referencia: 'BRK-001',
        descripcion: 'Disco de freno',
        fabricante: 'Bosch',
        categoria: 'FRENOS',
        aplica_a: ['Moto 125'],
        precio: 1000,
        ubicacion: 'A-01-05',
        stock: 1,
        stock_minimo: 0,
        imagen_url: '',
    });
}

function ledgerWrites() {
    return mockState.writes.filter((write) =>
        write.path.startsWith('historial_auditoria_inventario/')
    );
}

beforeEach(() => {
    mockState.reset();
    vi.mocked(requirePermiso).mockResolvedValue({
        rol: 'admin',
        email: 'admin@test.com',
    });
});

describe('MT-07 Server Actions contracts', () => {
    it('aprobarConteo persiste revisado_por UID y ledger UID+email', async () => {
        seedConteo();
        seedInventario();

        const resultado = await aprobarConteo(
            { conteo_id: UUID, revisado_por: 'atacante' },
            ACTOR
        );

        expect(resultado.success).toBe(true);
        expect(
            mockState.docs.get(`conteos_pendientes_repuestos/${UUID}`)
                ?.revisado_por
        ).toBe('uid-admin');
        expect(
            mockState.docs.get(`conteos_pendientes_repuestos/${UUID}`)
                ?.revisado_por
        ).not.toBe('admin@test.com');

        const ledger = ledgerWrites();
        expect(ledger).toHaveLength(1);
        expect(ledger[0].data.registrado_por).toBe('uid-admin');
        expect(ledger[0].data.registrado_por_email).toBe('admin@test.com');
        expect(JSON.stringify(ledger[0].data)).not.toContain('atacante');
    });

    it('rechazarConteo persiste revisado_por UID en conteo y ledger', async () => {
        seedConteo();

        const resultado = await rechazarConteo(
            {
                conteo_id: UUID,
                motivo_rechazo: 'Foto borrosa',
                revisado_por: 'atacante',
            },
            ACTOR
        );

        expect(resultado.success).toBe(true);
        const conteo = mockState.docs.get(
            `conteos_pendientes_repuestos/${UUID}`
        );
        expect(conteo?.revisado_por).toBe('uid-admin');
        expect(conteo?.revisado_por).not.toBe('admin@test.com');

        const ledger = ledgerWrites();
        expect(ledger).toHaveLength(1);
        expect(
            (ledger[0].data.datos_nuevos as Record<string, unknown>)
                .revisado_por
        ).toBe('uid-admin');
        expect(ledger[0].data.registrado_por).toBe('uid-admin');
        expect(ledger[0].data.registrado_por_email).toBe('admin@test.com');
    });

    it('crearRepuesto usa docId canónico y ledger CREATE atómico', async () => {
        const resultado = await crearRepuesto(
            {
                referencia: 'BRK-010',
                descripcion: 'Pastillas',
                fabricante: 'Bosch',
                aplica_a: ['Moto 125'],
                categoria: 'Frenos',
                precio: 1000,
                ubicacion: 'A-01-05',
                stock: 2,
                stock_minimo: 1,
                imagen_url: null,
            },
            ACTOR
        );

        expect(resultado.success).toBe(true);
        expect(mockState.docs.has('inventario_repuestos/BRK-010')).toBe(true);
        const ledger = ledgerWrites();
        expect(ledger).toHaveLength(1);
        expect(ledger[0].kind).toBe('create');
        expect(ledger[0].data.operacion).toBe('CREATE');
        expect(ledger[0].data.datos_anteriores).toBeNull();
        expect(ledger[0].data.registrado_por).toBe('uid-admin');
    });

    it('obtenerRepuestoPorReferencia lee docId canónico sin datos maestros completos', async () => {
        seedInventario();

        const resultado = await obtenerRepuestoPorReferencia(
            { referencia: 'BRK-001' },
            ACTOR
        );

        expect(resultado.success).toBe(true);
        expect(resultado.existe).toBe(true);
    });

    it('buscarCandidatosRepuesto devuelve docId y no escribe', async () => {
        seedInventario();

        const resultado = await buscarCandidatosRepuesto(
            { etiquetas: ['freno'], consulta: '', limite: 10 },
            ACTOR
        );

        expect(resultado.success).toBe(true);
        expect(resultado.candidatos[0]?.referencia).toBe('BRK-001');
        expect(mockState.writes).toHaveLength(0);
    });

    it('crearConteoPendiente ignora identidad cliente forjada', async () => {
        seedInventario();
        vi.mocked(requireActorInventario).mockResolvedValueOnce({
            uid: 'uid-asesor',
            email: 'asesor@test.com',
        });
        vi.mocked(requirePermiso).mockResolvedValue({
            rol: 'asesor',
            email: 'asesor@test.com',
        });

        const resultado = await crearConteoPendiente(
            {
                conteo_id: UUID,
                referencia_sugerida: '',
                referencia_confirmada: 'BRK-001',
                descripcion: 'Disco de freno',
                cantidad_contada: 4,
                ubicacion: 'A-01-05',
                anotaciones: '',
                foto_url: FOTO_URL,
                storage_path:
                    'inventario_repuestos/asesor@test.com/foto.jpg',
                nombre_archivo: 'foto.jpg',
                mime_type: 'image/jpeg',
                tamano_bytes: 1024,
                etiquetas_vision: [],
                revisado_por: 'atacante',
                asesor_uid: 'uid-atacante',
            },
            ACTOR
        );

        expect(resultado.success).toBe(true);
        const conteo = mockState.docs.get(
            `conteos_pendientes_repuestos/${UUID}`
        );
        expect(conteo?.asesor_uid).toBe('uid-asesor');
        expect(conteo?.revisado_por).toBe('');
        expect(JSON.stringify(conteo)).not.toContain('atacante');
    });
});
