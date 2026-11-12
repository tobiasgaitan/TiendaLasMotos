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
            kind: 'doc' as const,
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

    const makeQuery = (
        collection: string,
        filters: Array<{ field: string; value: unknown }>,
        limit?: number
    ) => {
        const query = {
            kind: 'query' as const,
            get: async () => {
                const resultados = Array.from(docs.entries())
                    .filter(([path]) => path.startsWith(`${collection}/`))
                    .map(([path, data]) => {
                        const id = path.slice(collection.length + 1);
                        return {
                            id,
                            ref: makeRef(collection, id),
                            data: () => data,
                        };
                    })
                    .filter((snap) =>
                        filters.every(
                            ({ field, value }) =>
                                snap.data()[field] === value
                        )
                    )
                    .slice(0, limit);
                return {
                    docs: resultados,
                    empty: resultados.length === 0,
                    size: resultados.length,
                };
            },
            limit: (n: number) => makeQuery(collection, filters, n),
        };
        return query;
    };

    const tx = {
        get: async (target: {
            kind?: string;
            path?: string;
            get?: () => Promise<unknown>;
        }) => {
            if (target.kind === 'query' && target.get) {
                return target.get();
            }
            const data = target.path ? docs.get(target.path) : undefined;
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
            where: (field: string, op: string, value: unknown) => {
                if (op !== '==') {
                    throw new Error(`Operador no soportado: ${op}`);
                }
                return makeQuery(nombre, [{ field, value }]);
            },
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
import { editarRepuesto } from '@/app/admin/inventario-repuestos/actions/editarRepuesto';
import { listarRepuestos } from '@/app/admin/inventario-repuestos/actions/listarRepuestos';
import { listarSedes } from '@/app/admin/inventario-repuestos/actions/listarSedes';
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
        sede_id: 'sede-1',
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

function repuestosPorReferencia(referencia: string) {
    return Array.from(mockState.docs.entries())
        .filter(
            ([path, data]) =>
                path.startsWith('inventario_repuestos/') &&
                data.referencia === referencia
        )
        .map(([path, data]) => ({
            path,
            documentoId: path.slice('inventario_repuestos/'.length),
            data,
        }));
}

function ledgerWrites() {
    return mockState.writes.filter((write) =>
        write.path.startsWith('historial_auditoria_inventario/')
    );
}

beforeEach(() => {
    mockState.reset();
    mockState.docs.set('configuracion/general/sedes/sede-1', {
        id: 'sede-1',
        name: 'Sede Principal',
        department: 'Caldas',
        isActive: true,
    });
    mockState.docs.set('configuracion/general/sedes/sede-2', {
        id: 'sede-2',
        name: 'Sede Norte',
        department: 'Caldas',
        isActive: true,
    });
    mockState.docs.set('configuracion/general/sedes/sede-inactiva', {
        id: 'sede-inactiva',
        name: 'Sede Inactiva',
        department: 'Caldas',
        isActive: false,
    });
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

    it('crearRepuesto usa auto-ID y ledger CREATE atómico', async () => {
        const resultado = await crearRepuesto(
            {
                referencia: 'BRK-010',
                descripcion: 'Pastillas',
                sede_id: 'sede-1',
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

        const creados = repuestosPorReferencia('BRK-010');
        expect(resultado.success).toBe(true);
        expect(creados).toHaveLength(1);
        expect(creados[0].documentoId).not.toBe('BRK-010');
        expect(creados[0].data.imagen_url).toBe('');
        expect(creados[0].data.sede_id).toBe('sede-1');
        const ledger = ledgerWrites();
        expect(ledger).toHaveLength(1);
        expect(ledger[0].kind).toBe('create');
        expect(ledger[0].data.operacion).toBe('CREATE');
        expect(ledger[0].data.datos_anteriores).toBeNull();
        expect(ledger[0].data.documento_id).toBe(creados[0].documentoId);
        expect(ledger[0].data.registrado_por).toBe('uid-admin');
    });

    it('crearRepuesto persiste imagen_url vacía para null, vacío u omitido', async () => {
        const base = {
            descripcion: 'Pastillas',
            sede_id: 'sede-1',
            fabricante: 'Bosch',
            aplica_a: ['Moto 125'],
            categoria: 'Frenos',
            precio: 1000,
            ubicacion: 'A-01-05',
            stock: 2,
            stock_minimo: 1,
        };
        const casos = [
            { referencia: 'BRK-011', imagen_url: '' },
            { referencia: 'BRK-012', imagen_url: null },
            { referencia: 'BRK-013' },
        ];

        for (const caso of casos) {
            const resultado = await crearRepuesto(
                { ...base, ...caso },
                ACTOR
            );
            const creados = repuestosPorReferencia(caso.referencia);
            expect(resultado.success).toBe(true);
            expect(creados).toHaveLength(1);
            expect(creados[0].data.imagen_url).toBe('');
        }
    });

    it('crearRepuesto permite duplicar referencia por sede y ubicación', async () => {
        const base = {
            referencia: 'BRK-020',
            descripcion: 'Pastillas',
            sede_id: 'sede-1',
            ubicacion: 'Pasillo 1',
        };

        const primero = await crearRepuesto(base, ACTOR);
        const segundo = await crearRepuesto(
            {
                ...base,
                sede_id: 'sede-2',
                ubicacion: 'Pasillo 2',
            },
            ACTOR
        );

        expect(primero.success).toBe(true);
        expect(segundo.success).toBe(true);
        expect(primero.id).not.toBe(segundo.id);
        const creados = repuestosPorReferencia('BRK-020');
        expect(creados).toHaveLength(2);
        expect(creados.map((r) => r.data.sede_id)).toEqual(
            expect.arrayContaining(['sede-1', 'sede-2'])
        );
    });

    it('listarRepuestos devuelve documento_id, referencia comercial y sede', async () => {
        seedInventario();

        const resultado = await listarRepuestos({}, ACTOR);

        expect(resultado.success).toBe(true);
        expect(resultado.repuestos).toHaveLength(1);
        expect(resultado.repuestos[0].documento_id).toBe('BRK-001');
        expect(resultado.repuestos[0].referencia).toBe('BRK-001');
        expect(resultado.repuestos[0].sede_id).toBe('sede-1');
    });

    it('editarRepuesto usa documento_id como identidad', async () => {
        seedInventario();

        const resultado = await editarRepuesto(
            {
                documento_id: 'BRK-001',
                referencia: 'BRK-001',
                cambios: { stock: 7 },
            },
            ACTOR
        );

        expect(resultado.success).toBe(true);
        expect(
            mockState.docs.get('inventario_repuestos/BRK-001')?.stock
        ).toBe(7);
        const ledger = ledgerWrites();
        expect(ledger).toHaveLength(1);
        expect(ledger[0].data.documento_id).toBe('BRK-001');
    });

    it('listarSedes devuelve solo sedes activas', async () => {
        const resultado = await listarSedes({}, ACTOR);

        expect(resultado.success).toBe(true);
        expect(resultado.sedes.map((sede) => sede.id)).toEqual(
            expect.arrayContaining(['sede-1', 'sede-2'])
        );
        expect(resultado.sedes.map((sede) => sede.id)).not.toContain(
            'sede-inactiva'
        );
    });

    it('obtenerRepuestoPorReferencia consulta la referencia comercial', async () => {
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

    it('crearConteoPendiente rechaza referencia ambigua', async () => {
        seedInventario();
        mockState.docs.set('inventario_repuestos/auto-2', {
            referencia: 'BRK-001',
            sede_id: 'sede-2',
            descripcion: 'Disco de freno',
            ubicacion: 'Pasillo 2',
        });
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
            },
            ACTOR
        );

        expect(resultado.success).toBe(false);
        expect(resultado.message).toContain('múltiples registros');
        expect(
            mockState.docs.has(`conteos_pendientes_repuestos/${UUID}`)
        ).toBe(false);
    });

    it('aprobarConteo rechaza referencia ambigua', async () => {
        seedConteo();
        seedInventario();
        mockState.docs.set('inventario_repuestos/auto-2', {
            referencia: 'BRK-001',
            sede_id: 'sede-2',
            descripcion: 'Disco de freno',
            ubicacion: 'Pasillo 2',
        });

        const resultado = await aprobarConteo(
            { conteo_id: UUID },
            ACTOR
        );

        expect(resultado.success).toBe(false);
        expect(resultado.message).toContain('múltiples registros');
    });
});
