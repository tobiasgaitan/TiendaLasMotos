import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockState = vi.hoisted(() => {
    const docs = new Map<string, Record<string, unknown>>();
    const writes: Array<{
        path: string;
        kind: 'set' | 'update' | 'create' | 'delete';
        data: Record<string, unknown>;
    }> = [];
    let sequence = 0;
    let fallarSedes = false;
    let fallarLedger = false;

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

    type MockRef = ReturnType<typeof makeRef>;

    interface MockDoc {
        id: string;
        ref: MockRef;
        data: () => Record<string, unknown>;
    }

    interface FiltroQuery {
        field: string;
        op: string;
        value: unknown;
    }

    interface OrdenQuery {
        field: string;
        direction: 'asc' | 'desc';
    }

    interface MockQuery {
        kind: 'query';
        get: () => Promise<{
            docs: MockDoc[];
            empty: boolean;
            size: number;
        }>;
        limit: (n: number) => MockQuery;
        where: (field: string, op: string, value: unknown) => MockQuery;
        orderBy: (field: unknown, direction?: 'asc' | 'desc') => MockQuery;
        startAfter: (...values: unknown[]) => MockQuery;
        count: () => {
            get: () => Promise<{ data: () => { count: number } }>;
        };
    }

    const leerFilas = (
        collection: string,
        filters: FiltroQuery[]
    ): MockDoc[] =>
        Array.from(docs.entries())
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
                filters.every(({ field, op, value }) => {
                    const actual = snap.data()[field];
                    if (op === 'array-contains') {
                        return (
                            Array.isArray(actual) &&
                            actual.includes(value)
                        );
                    }
                    if (op === '>=') {
                        return String(actual ?? '') >= String(value);
                    }
                    if (op === '<=') {
                        return String(actual ?? '') <= String(value);
                    }
                    return actual === value;
                })
            );

    const valorOrden = (doc: MockDoc, field: string): string =>
        field === '__name__'
            ? doc.id
            : String(doc.data()[field] ?? '');

    const makeQuery = (
        collection: string,
        filters: FiltroQuery[],
        orders: OrdenQuery[] = [],
        after: unknown[] | null = null,
        limit?: number
    ): MockQuery => {
        const query: MockQuery = {
            kind: 'query',
            get: async () => {
                let resultados = leerFilas(collection, filters);

                if (orders.length > 0) {
                    resultados = [...resultados].sort((a, b) => {
                        for (const orden of orders) {
                            const actual = valorOrden(a, orden.field);
                            const siguiente = valorOrden(b, orden.field);
                            const comparacion = actual.localeCompare(
                                siguiente,
                                'en'
                            );
                            if (comparacion !== 0) {
                                return orden.direction === 'desc'
                                    ? -comparacion
                                    : comparacion;
                            }
                        }
                        return 0;
                    });
                }

                if (after && orders.length > 0) {
                    resultados = resultados.filter((doc) => {
                        for (let i = 0; i < after.length; i += 1) {
                            const orden = orders[i];
                            if (!orden) continue;
                            const actual = valorOrden(doc, orden.field);
                            const cursor = String(after[i] ?? '');
                            if (actual === cursor) continue;
                            return actual > cursor;
                        }
                        return false;
                    });
                }

                if (limit !== undefined) {
                    resultados = resultados.slice(0, limit);
                }

                return {
                    docs: resultados,
                    empty: resultados.length === 0,
                    size: resultados.length,
                };
            },
            limit: (n: number) =>
                makeQuery(collection, filters, orders, after, n),
            where: (field: string, op: string, value: unknown) =>
                makeQuery(
                    collection,
                    [...filters, { field, op, value }],
                    orders,
                    after,
                    limit
                ),
            orderBy: (field: unknown, direction = 'asc') =>
                makeQuery(
                    collection,
                    filters,
                    [
                        ...orders,
                        {
                            field:
                                typeof field === 'string'
                                    ? field
                                    : '__name__',
                            direction,
                        },
                    ],
                    after,
                    limit
                ),
            startAfter: (...values: unknown[]) =>
                makeQuery(collection, filters, orders, values, limit),
            count: () => ({
                get: async () => ({
                    data: () => ({
                        count: leerFilas(collection, filters).length,
                    }),
                }),
            }),
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
            if (
                fallarLedger &&
                ref.path.startsWith('historial_auditoria_inventario/')
            ) {
                throw new Error('Fallo simulado creando el asiento de ledger');
            }
            docs.set(ref.path, { ...data });
            writes.push({ path: ref.path, kind: 'create', data: { ...data } });
        },
        delete: (ref: { path: string }) => {
            const anterior = docs.get(ref.path);
            docs.delete(ref.path);
            writes.push({
                path: ref.path,
                kind: 'delete',
                data: anterior ? { ...anterior } : {},
            });
        },
    };

    const db = {
        collection: (nombre: string) => {
            const base = makeQuery(nombre, []);

            return {
                ...base,
                doc: (id?: string) => makeRef(nombre, id),
                get: async () => {
                    if (
                        nombre === 'configuracion/general/sedes' &&
                        fallarSedes
                    ) {
                        throw new Error('Fallo simulado leyendo sedes');
                    }
                    return {
                        docs: Array.from(docs.entries())
                            .filter(([path]) =>
                                path.startsWith(`${nombre}/`)
                            )
                            .map(([path, data]) => ({
                                id: path.slice(nombre.length + 1),
                                data: () => data,
                            })),
                    };
                },
                where: (
                    field: string,
                    op: string,
                    value: unknown
                ) => {
                    if (
                        op !== '==' &&
                        op !== 'array-contains' &&
                        op !== '>=' &&
                        op !== '<='
                    ) {
                        throw new Error(`Operador no soportado: ${op}`);
                    }
                    return makeQuery(nombre, [{ field, op, value }]);
                },
            };
        },
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
            fallarSedes = false;
            fallarLedger = false;
        },
        setFallaSedes(value: boolean) {
            fallarSedes = value;
        },
        setFallaLedger(value: boolean) {
            fallarLedger = value;
        },
    };
});

vi.mock('@/lib/firebase-admin', () => ({
    getDb: () => mockState.db,
    getFieldPath: () => ({
        documentId: () => '__name__',
    }),
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
import { eliminarRepuesto } from '@/app/admin/inventario-repuestos/actions/eliminarRepuesto';
import { listarRepuestos } from '@/app/admin/inventario-repuestos/actions/listarRepuestos';
import { contarRepuestos } from '@/app/admin/inventario-repuestos/actions/contarRepuestos';
import { listarSedes } from '@/app/admin/inventario-repuestos/actions/listarSedes';
import { listarPendientes } from '@/app/admin/inventory/actions/listarPendientes';
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
        inventario_documento_id: 'BRK-001',
        sede_id: 'sede-1',
        descripcion: 'Disco de freno',
        cantidad_contada: 4,
        ubicacion: 'A-01-05',
        foto_url: FOTO_URL,
        asesor_email: 'asesor@test.com',
        asesor_uid: 'uid-asesor',
        creado_en: new Date(),
    });
}

function seedInventario(alternativas: string[] = []) {
    mockState.docs.set('inventario_repuestos/BRK-001', {
        referencia: 'BRK-001',
        sede_id: 'sede-1',
        descripcion: 'Disco de freno',
        fabricante: 'BOSCH',
        categoria: 'FRENOS',
        aplica_a: ['Moto 125'],
        unidad_medida: 'unidad',
        precio: 1000,
        ubicacion: 'A-01-05',
        stock: 1,
        stock_minimo: 0,
        referencias_alternativas: alternativas,
        imagen_url: '',
    });
}

function seedRepuesto(
    id: string,
    referencia: string,
    extra: Record<string, unknown> = {}
) {
    const ahora = new Date();
    mockState.docs.set(`inventario_repuestos/${id}`, {
        referencia,
        sede_id: 'sede-1',
        descripcion: `Repuesto ${id}`,
        fabricante: 'BOSCH',
        categoria: 'FRENOS',
        aplica_a: [],
        unidad_medida: 'unidad',
        precio: 1000,
        ubicacion: 'A-01-05',
        stock: 1,
        stock_minimo: 0,
        referencias_alternativas: [],
        imagen_url: '',
        creado_en: ahora,
        actualizado_en: ahora,
        ...extra,
    });
}

function seedAsesor() {
    vi.mocked(requireActorInventario).mockResolvedValueOnce({
        uid: 'uid-asesor',
        email: 'asesor@test.com',
    });
    vi.mocked(requirePermiso).mockResolvedValue({
        rol: 'asesor',
        email: 'asesor@test.com',
    });
}

function prepararAdmin() {
    vi.mocked(requireActorInventario).mockResolvedValue({
        uid: 'uid-admin',
        email: 'admin@test.com',
    });
    vi.mocked(requirePermiso).mockResolvedValue({
        rol: 'admin',
        email: 'admin@test.com',
    });
}

function inputCrearConteo() {
    return {
        conteo_id: UUID,
        referencia_sugerida: '',
        referencia_confirmada: 'BRK-001',
        inventario_documento_id: 'BRK-001',
        sede_id: 'sede-1',
        descripcion: 'Disco de freno',
        cantidad_contada: 4,
        ubicacion: 'A-01-05',
        anotaciones: '',
        foto_url: FOTO_URL,
        storage_path: 'inventario_repuestos/asesor@test.com/foto.jpg',
        nombre_archivo: 'foto.jpg',
        mime_type: 'image/jpeg',
        tamano_bytes: 1024,
        etiquetas_vision: [],
    };
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

    it('aprobarConteo no actualiza stock del catálogo', async () => {
        seedConteo();
        seedInventario();
        mockState.docs.set('conteos_pendientes_repuestos/' + UUID, {
            ...(mockState.docs.get(
                `conteos_pendientes_repuestos/${UUID}`
            ) ?? {}),
            inventario_documento_id: 'BRK-001',
            sede_id: 'sede-1',
        });

        const resultado = await aprobarConteo(
            { conteo_id: UUID },
            ACTOR
        );

        expect(resultado.success).toBe(true);
        expect(
            mockState.docs.get('inventario_repuestos/BRK-001')?.stock
        ).toBe(1);
        const ledger = ledgerWrites();
        expect(ledger).toHaveLength(1);
        expect(ledger[0].data.coleccion_afectada).toBe(
            'conteos_pendientes_repuestos'
        );
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
        expect(creados[0].data.fabricante).toBe('BOSCH');
        expect(creados[0].data.categoria).toBe('FRENOS');
        const ledger = ledgerWrites();
        expect(ledger).toHaveLength(1);
        expect(ledger[0].kind).toBe('create');
        expect(ledger[0].data.operacion).toBe('CREATE');
        expect(ledger[0].data.datos_anteriores).toBeNull();
        expect(ledger[0].data.documento_id).toBe(creados[0].documentoId);
        expect(ledger[0].data.registrado_por).toBe('uid-admin');
        const datosNuevos = ledger[0].data.datos_nuevos as Record<
            string,
            unknown
        >;
        expect(datosNuevos.fabricante).toBe('BOSCH');
        expect(datosNuevos.categoria).toBe('FRENOS');
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

    it('crearRepuesto acepta solo referencia y descripción', async () => {
        const resultado = await crearRepuesto(
            {
                referencia: 'BRK-030',
                descripcion: 'Repuesto mínimo',
            },
            ACTOR
        );

        const creados = repuestosPorReferencia('BRK-030');
        expect(resultado.success).toBe(true);
        expect(creados).toHaveLength(1);
        expect(creados[0].data.sede_id).toBe('');
        expect(creados[0].data.ubicacion).toBe('');
        expect(creados[0].data.precio).toBe(0);
        expect(creados[0].data.stock).toBe(0);
        expect(creados[0].data.referencias_alternativas).toEqual([]);
        expect(creados[0].data.unidad_medida).toBe('unidad');
    });

    it('crearRepuesto persiste unidad_medida litro y la audita', async () => {
        const resultado = await crearRepuesto(
            {
                referencia: 'BRK-032',
                descripcion: 'Aceite 20W-50',
                unidad_medida: 'litro',
            },
            ACTOR
        );

        const creados = repuestosPorReferencia('BRK-032');
        expect(resultado.success).toBe(true);
        expect(creados[0].data.unidad_medida).toBe('litro');
        const ledger = ledgerWrites();
        expect(ledger).toHaveLength(1);
        expect(
            (ledger[0].data.datos_nuevos as Record<string, unknown>)
                .unidad_medida
        ).toBe('litro');
        expect(ledger[0].data.campos_modificados).toContain(
            'unidad_medida'
        );
    });

    it('crearRepuesto normaliza y deduplica referencias alternativas', async () => {
        const resultado = await crearRepuesto(
            {
                referencia: 'BRK-031',
                descripcion: 'Repuesto con alternativas',
                referencias_alternativas: [
                    'alt-1',
                    'BRK-031',
                    'ALT-1',
                ],
            },
            ACTOR
        );

        const creados = repuestosPorReferencia('BRK-031');
        expect(resultado.success).toBe(true);
        expect(creados[0].data.referencias_alternativas).toEqual([
            'ALT-1',
        ]);
    });

    it('listarRepuestos devuelve documento_id, referencia comercial y sede', async () => {
        seedInventario(['ALT-1']);

        const resultado = await listarRepuestos({}, ACTOR);

        expect(resultado.success).toBe(true);
        expect(resultado.repuestos).toHaveLength(1);
        expect(resultado.repuestos[0].documento_id).toBe('BRK-001');
        expect(resultado.repuestos[0].referencia).toBe('BRK-001');
        expect(resultado.repuestos[0].sede_id).toBe('sede-1');
        expect(resultado.repuestos[0].sede_nombre).toBe('Sede Principal');
        expect(resultado.repuestos[0].referencias_alternativas).toEqual([
            'ALT-1',
        ]);
        expect(resultado.repuestos[0].unidad_medida).toBe('unidad');
    });

    it('listarRepuestos lee unidad legacy como unidad sin escribir', async () => {
        seedInventario();
        const legacy = mockState.docs.get(
            'inventario_repuestos/BRK-001'
        );
        if (!legacy) throw new Error('seedInventario no creó el repuesto');
        delete legacy.unidad_medida;

        const resultado = await listarRepuestos({}, ACTOR);

        expect(resultado.success).toBe(true);
        expect(resultado.repuestos[0].unidad_medida).toBe('unidad');
        expect(mockState.writes).toHaveLength(0);
    });

    it('editarRepuesto actualiza unidad_medida y la incluye en el ledger', async () => {
        seedInventario();

        const resultado = await editarRepuesto(
            {
                documento_id: 'BRK-001',
                referencia: 'BRK-001',
                cambios: { unidad_medida: 'litro' },
            },
            ACTOR
        );

        expect(resultado.success).toBe(true);
        expect(
            mockState.docs.get('inventario_repuestos/BRK-001')
                ?.unidad_medida
        ).toBe('litro');
        const ledger = ledgerWrites();
        expect(ledger).toHaveLength(1);
        expect(ledger[0].data.campos_modificados).toContain(
            'unidad_medida'
        );
    });

    it('editarRepuesto no escribe si unidad_medida no cambia', async () => {
        seedInventario();

        const resultado = await editarRepuesto(
            {
                documento_id: 'BRK-001',
                referencia: 'BRK-001',
                cambios: { unidad_medida: 'unidad' },
            },
            ACTOR
        );

        expect(resultado.success).toBe(true);
        expect(resultado.idempotente).toBe(true);
        expect(ledgerWrites()).toHaveLength(0);
        expect(mockState.writes).toHaveLength(0);
    });

    it('listarRepuestos usa fallback para sede vacía o no resuelta', async () => {
        seedInventario();
        const sinSede = mockState.docs.get('inventario_repuestos/BRK-001');
        if (!sinSede) throw new Error('seedInventario no creó el repuesto');
        sinSede.sede_id = '';

        const vacia = await listarRepuestos({}, ACTOR);
        expect(vacia.repuestos[0].sede_nombre).toBe('Sin sede');

        sinSede.sede_id = 'sede-inexistente';
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const noResuelta = await listarRepuestos({}, ACTOR);

        expect(noResuelta.repuestos[0].sede_nombre).toBe(
            'Sede no disponible'
        );
        expect(warn).toHaveBeenCalledWith(
            '[inventario-repuestos] Sede no resuelta:',
            expect.objectContaining({ sedeId: 'sede-inexistente' })
        );
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

    it('editarRepuesto actualiza y normaliza referencias alternativas', async () => {
        seedInventario(['ALT-1']);

        const resultado = await editarRepuesto(
            {
                documento_id: 'BRK-001',
                referencia: 'BRK-001',
                cambios: {
                    referencias_alternativas: [
                        'alt-2',
                        'ALT-2',
                        'BRK-001',
                    ],
                },
            },
            ACTOR
        );

        expect(resultado.success).toBe(true);
        expect(
            mockState.docs.get('inventario_repuestos/BRK-001')
                ?.referencias_alternativas
        ).toEqual(['ALT-2']);
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

    it('listarPendientes resuelve sede_nombre', async () => {
        seedConteo();

        const resultado = await listarPendientes(
            { estado: 'pendiente_revision' },
            ACTOR
        );

        expect(resultado.success).toBe(true);
        expect(resultado.pendientes[0].sede_nombre).toBe('Sede Principal');
        expect(resultado.pendientes[0].sede_id).toBe('sede-1');
        expect(resultado.pendientes[0].inventario_documento_id).toBe(
            'BRK-001'
        );
    });

    it('listarPendientes usa fallbacks para sede vacía o no resuelta', async () => {
        seedConteo();
        const conteo = mockState.docs.get(
            `conteos_pendientes_repuestos/${UUID}`
        );
        if (!conteo) throw new Error('seedConteo no creó el conteo');
        conteo.sede_id = '';

        const vacia = await listarPendientes(
            { estado: 'pendiente_revision' },
            ACTOR
        );
        expect(vacia.pendientes[0].sede_nombre).toBe('Sin sede');

        conteo.sede_id = 'sede-inexistente';
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const noResuelta = await listarPendientes(
            { estado: 'pendiente_revision' },
            ACTOR
        );

        expect(noResuelta.pendientes[0].sede_nombre).toBe(
            'Sede no disponible'
        );
        expect(warn).toHaveBeenCalledWith(
            '[inventario] Sede no resuelta en pendiente:',
            expect.objectContaining({
                sedeId: 'sede-inexistente',
                inventarioDocumentoId: 'BRK-001',
            })
        );
    });

    it('listarPendientes continúa si falla la lectura de sedes', async () => {
        seedConteo();
        mockState.setFallaSedes(true);
        const error = vi.spyOn(console, 'error').mockImplementation(() => {});

        const resultado = await listarPendientes(
            { estado: 'pendiente_revision' },
            ACTOR
        );

        expect(resultado.success).toBe(true);
        expect(resultado.pendientes[0].sede_nombre).toBe(
            'Sede no disponible'
        );
        expect(error).toHaveBeenCalledWith(
            '[inventario] No se pudieron cargar las sedes; se usará fallback:',
            expect.any(Error)
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

    it('obtenerRepuestoPorReferencia encuentra una referencia alternativa', async () => {
        seedInventario(['ALT-001']);

        const resultado = await obtenerRepuestoPorReferencia(
            { referencia: 'ALT-001' },
            ACTOR
        );

        expect(resultado.success).toBe(true);
        expect(resultado.existe).toBe(true);
    });

    it('buscarCandidatosRepuesto devuelve documento_id y no escribe', async () => {
        seedInventario();

        const resultado = await buscarCandidatosRepuesto(
            { etiquetas: ['freno'], consulta: '', limite: 10 },
            ACTOR
        );

        expect(resultado.success).toBe(true);
        expect(resultado.candidatos[0]?.referencia).toBe('BRK-001');
        expect(resultado.candidatos[0]?.documento_id).toBe('BRK-001');
        expect(mockState.writes).toHaveLength(0);
    });

    it('buscarCandidatosRepuesto encuentra una referencia alternativa', async () => {
        seedInventario(['ALT-001']);

        const resultado = await buscarCandidatosRepuesto(
            { etiquetas: [], consulta: 'ALT-001', limite: 10 },
            ACTOR
        );

        expect(resultado.success).toBe(true);
        expect(resultado.candidatos[0]?.referencia).toBe('BRK-001');
        expect(resultado.candidatos[0]?.referencias_alternativas).toEqual([
            'ALT-001',
        ]);
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
                inventario_documento_id: 'BRK-001',
                sede_id: 'sede-1',
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

    it('crearConteoPendiente usa documento_id para desambiguar referencias', async () => {
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
                inventario_documento_id: 'BRK-001',
                sede_id: 'sede-1',
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

        expect(resultado.success).toBe(true);
        expect(
            mockState.docs.get(`conteos_pendientes_repuestos/${UUID}`)
                ?.inventario_documento_id
        ).toBe('BRK-001');
        expect(
            mockState.docs.get(`conteos_pendientes_repuestos/${UUID}`)
                ?.sede_id
        ).toBe('sede-1');
    });

    it('crearConteoPendiente persiste precio_etiqueta_fisica', async () => {
        seedInventario();
        seedAsesor();

        const resultado = await crearConteoPendiente(
            {
                ...inputCrearConteo(),
                precio_etiqueta_fisica: 87500,
            },
            ACTOR
        );

        expect(resultado.success).toBe(true);
        const conteo = mockState.docs.get(
            `conteos_pendientes_repuestos/${UUID}`
        );
        expect(conteo?.precio_etiqueta_fisica).toBe(87500);
        expect(ledgerWrites()).toHaveLength(0);
        expect(
            mockState.docs.get('inventario_repuestos/BRK-001')?.precio
        ).toBe(1000);
    });

    it('crearConteoPendiente persiste 0 y no lo convierte en null', async () => {
        seedInventario();
        seedAsesor();

        const resultado = await crearConteoPendiente(
            {
                ...inputCrearConteo(),
                precio_etiqueta_fisica: 0,
            },
            ACTOR
        );

        expect(resultado.success).toBe(true);
        const conteo = mockState.docs.get(
            `conteos_pendientes_repuestos/${UUID}`
        );
        expect(conteo?.precio_etiqueta_fisica).toBe(0);
        expect(conteo?.precio_etiqueta_fisica).not.toBeNull();
    });

    it('crearConteoPendiente persiste null con cadena vacía', async () => {
        seedInventario();
        seedAsesor();

        const resultado = await crearConteoPendiente(
            {
                ...inputCrearConteo(),
                precio_etiqueta_fisica: '',
            },
            ACTOR
        );

        expect(resultado.success).toBe(true);
        expect(
            mockState.docs.get(`conteos_pendientes_repuestos/${UUID}`)
                ?.precio_etiqueta_fisica
        ).toBeNull();
    });

    it('crearConteoPendiente persiste null con valor nulo', async () => {
        seedInventario();
        seedAsesor();

        const resultado = await crearConteoPendiente(
            {
                ...inputCrearConteo(),
                precio_etiqueta_fisica: null,
            },
            ACTOR
        );

        expect(resultado.success).toBe(true);
        expect(
            mockState.docs.get(`conteos_pendientes_repuestos/${UUID}`)
                ?.precio_etiqueta_fisica
        ).toBeNull();
    });

    it('crearConteoPendiente persiste null cuando el campo se omite', async () => {
        seedInventario();
        seedAsesor();

        const resultado = await crearConteoPendiente(
            inputCrearConteo(),
            ACTOR
        );

        expect(resultado.success).toBe(true);
        expect(
            mockState.docs.get(`conteos_pendientes_repuestos/${UUID}`)
                ?.precio_etiqueta_fisica
        ).toBeNull();
    });

    it.each([
        ['negativo', -1],
        ['cadena numérica', '1500'],
        ['booleano', true],
        ['NaN', Number.NaN],
        ['infinito', Number.POSITIVE_INFINITY],
    ])(
        'crearConteoPendiente rechaza precio_etiqueta_fisica %s',
        async (_nombre, valor) => {
            seedInventario();
            seedAsesor();

            const resultado = await crearConteoPendiente(
                {
                    ...inputCrearConteo(),
                    precio_etiqueta_fisica: valor,
                },
                ACTOR
            );

            expect(resultado.success).toBe(false);
            expect(
                mockState.docs.get(
                    `conteos_pendientes_repuestos/${UUID}`
                )
            ).toBeUndefined();
            expect(ledgerWrites()).toHaveLength(0);
        }
    );

    it('aprobarConteo no propaga precio_etiqueta_fisica al ledger', async () => {
        seedConteo();
        seedInventario();
        const conteo = mockState.docs.get(
            `conteos_pendientes_repuestos/${UUID}`
        );
        if (!conteo) throw new Error('seedConteo no creó el conteo');
        conteo.precio_etiqueta_fisica = 87500;

        const resultado = await aprobarConteo(
            { conteo_id: UUID },
            ACTOR
        );

        expect(resultado.success).toBe(true);
        const ledger = ledgerWrites();
        expect(ledger).toHaveLength(1);
        expect(JSON.stringify(ledger[0].data)).not.toContain(
            'precio_etiqueta_fisica'
        );
        expect(
            mockState.docs.get('inventario_repuestos/BRK-001')?.precio
        ).toBe(1000);
    });

    it('listarPendientes transporta precio_etiqueta_fisica y conserva null', async () => {
        seedConteo();
        const conteo = mockState.docs.get(
            `conteos_pendientes_repuestos/${UUID}`
        );
        if (!conteo) throw new Error('seedConteo no creó el conteo');

        conteo.precio_etiqueta_fisica = 12345;
        const conValor = await listarPendientes(
            { estado: 'pendiente_revision' },
            ACTOR
        );
        expect(conValor.pendientes[0].precio_etiqueta_fisica).toBe(12345);

        conteo.precio_etiqueta_fisica = 0;
        const conCero = await listarPendientes(
            { estado: 'pendiente_revision' },
            ACTOR
        );
        expect(conCero.pendientes[0].precio_etiqueta_fisica).toBe(0);

        delete conteo.precio_etiqueta_fisica;
        const sinCampo = await listarPendientes(
            { estado: 'pendiente_revision' },
            ACTOR
        );
        expect(
            sinCampo.pendientes[0].precio_etiqueta_fisica
        ).toBeNull();
    });

    it('aprobarConteo rechaza referencia ambigua', async () => {
        seedConteo();
        seedInventario();
        const conteo = mockState.docs.get(
            `conteos_pendientes_repuestos/${UUID}`
        );
        if (!conteo) throw new Error('seedConteo no creó el conteo');
        delete conteo.inventario_documento_id;
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

    it('eliminarRepuesto bloquea por FK de conteos sin writes', async () => {
        prepararAdmin();
        seedInventario();
        seedConteo();

        const resultado = await eliminarRepuesto(
            { documento_id: 'BRK-001', referencia: 'BRK-001' },
            ACTOR
        );

        expect(resultado.success).toBe(false);
        expect(resultado.codigo).toBe('FK_CONTEOS');
        expect(resultado.message).toContain('conteos pendientes');
        expect(mockState.docs.has('inventario_repuestos/BRK-001')).toBe(
            true
        );
        expect(mockState.writes).toHaveLength(0);
    });

    it('eliminarRepuesto elimina y crea un único asiento DELETE', async () => {
        prepararAdmin();
        seedInventario();

        const resultado = await eliminarRepuesto(
            { documento_id: 'BRK-001', referencia: 'BRK-001' },
            ACTOR
        );

        expect(resultado.success).toBe(true);
        expect(resultado.idempotente).toBe(false);
        expect(mockState.docs.has('inventario_repuestos/BRK-001')).toBe(
            false
        );

        const ledger = ledgerWrites();
        expect(ledger).toHaveLength(1);
        expect(ledger[0].kind).toBe('create');
        expect(ledger[0].data.operacion).toBe('DELETE');
        expect(ledger[0].data.documento_id).toBe('BRK-001');
        expect(ledger[0].data.referencia).toBe('BRK-001');
        expect(ledger[0].data.datos_nuevos).toBeNull();
        expect(ledger[0].data.campos_modificados).toEqual([]);
        expect(
            (ledger[0].data.datos_anteriores as Record<string, unknown>)
                .referencia
        ).toBe('BRK-001');
        expect(ledger[0].data.registrado_por).toBe('uid-admin');

        const deletes = mockState.writes.filter(
            (write) => write.kind === 'delete'
        );
        expect(deletes).toHaveLength(1);
        expect(deletes[0].path).toBe('inventario_repuestos/BRK-001');
    });

    it('eliminarRepuesto es atómico si falla el asiento del ledger', async () => {
        prepararAdmin();
        seedInventario();
        mockState.setFallaLedger(true);

        const resultado = await eliminarRepuesto(
            { documento_id: 'BRK-001', referencia: 'BRK-001' },
            ACTOR
        );

        expect(resultado.success).toBe(false);
        expect(mockState.docs.has('inventario_repuestos/BRK-001')).toBe(
            true
        );
        expect(ledgerWrites()).toHaveLength(0);
        expect(
            mockState.writes.filter((write) => write.kind === 'delete')
        ).toHaveLength(0);
    });

    it('eliminarRepuesto es idempotente si el documento no existe', async () => {
        prepararAdmin();

        const resultado = await eliminarRepuesto(
            { documento_id: 'NO-EXISTE', referencia: 'NO-EXISTE' },
            ACTOR
        );

        expect(resultado.success).toBe(true);
        expect(resultado.idempotente).toBe(true);
        expect(mockState.writes).toHaveLength(0);
    });

    it('eliminarRepuesto rechaza referencia que no coincide', async () => {
        prepararAdmin();
        seedInventario();

        const resultado = await eliminarRepuesto(
            { documento_id: 'BRK-001', referencia: 'OTRA-REF' },
            ACTOR
        );

        expect(resultado.success).toBe(false);
        expect(mockState.docs.has('inventario_repuestos/BRK-001')).toBe(
            true
        );
        expect(mockState.writes).toHaveLength(0);
    });

    it('eliminarRepuesto rechaza actor o input inválido antes de Firebase', async () => {
        const sinActor = await eliminarRepuesto(
            { documento_id: 'BRK-001', referencia: 'BRK-001' },
            {}
        );
        expect(sinActor.success).toBe(false);

        const inputInvalido = await eliminarRepuesto(
            { documento_id: '', referencia: 'BRK-001' },
            ACTOR
        );
        expect(inputInvalido.success).toBe(false);
        expect(mockState.writes).toHaveLength(0);
    });

    it('eliminarRepuesto exige permiso delete y rol admin/superadmin', async () => {
        seedInventario();
        vi.mocked(requireActorInventario).mockResolvedValue({
            uid: 'uid-asesor',
            email: 'asesor@test.com',
        });
        vi.mocked(requirePermiso).mockResolvedValue({
            rol: 'asesor',
            email: 'asesor@test.com',
        });

        const resultado = await eliminarRepuesto(
            { documento_id: 'BRK-001', referencia: 'BRK-001' },
            ACTOR
        );

        expect(resultado.success).toBe(false);
        expect(resultado.message).toContain('Solo un administrador');
        expect(mockState.docs.has('inventario_repuestos/BRK-001')).toBe(
            true
        );
        expect(mockState.writes).toHaveLength(0);
    });

    it('eliminarRepuesto propaga el rechazo de requirePermiso', async () => {
        seedInventario();
        vi.mocked(requireActorInventario).mockResolvedValue({
            uid: 'uid-admin',
            email: 'admin@test.com',
        });
        vi.mocked(requirePermiso).mockRejectedValueOnce(
            new Error('No autorizado: permiso insuficiente.')
        );

        const resultado = await eliminarRepuesto(
            { documento_id: 'BRK-001', referencia: 'BRK-001' },
            ACTOR
        );

        expect(resultado.success).toBe(false);
        expect(resultado.message).toContain('permiso insuficiente');
        expect(mockState.docs.has('inventario_repuestos/BRK-001')).toBe(
            true
        );
        expect(mockState.writes).toHaveLength(0);
    });

    it('listarRepuestos pagina con cursor estable sin duplicados', async () => {
        prepararAdmin();
        const referencias = [
            'A-001',
            'A-002',
            'A-003',
            'A-003',
            'A-004',
        ];
        referencias.forEach((referencia, indice) => {
            seedRepuesto(`doc-${indice}`, referencia);
        });

        const pagina1 = await listarRepuestos({ limite: 2 }, ACTOR);
        expect(pagina1.success).toBe(true);
        expect(pagina1.repuestos.map((r) => r.documento_id)).toEqual([
            'doc-0',
            'doc-1',
        ]);
        expect(pagina1.siguienteCursor).not.toBeNull();

        const pagina2 = await listarRepuestos(
            {
                limite: 2,
                cursor: pagina1.siguienteCursor ?? undefined,
            },
            ACTOR
        );
        expect(pagina2.success).toBe(true);
        expect(pagina2.repuestos.map((r) => r.documento_id)).toEqual([
            'doc-2',
            'doc-3',
        ]);

        const pagina3 = await listarRepuestos(
            {
                limite: 2,
                cursor: pagina2.siguienteCursor ?? undefined,
            },
            ACTOR
        );
        expect(pagina3.success).toBe(true);
        expect(pagina3.repuestos.map((r) => r.documento_id)).toEqual([
            'doc-4',
        ]);
        expect(pagina3.siguienteCursor).toBeNull();

        const ids = [
            ...pagina1.repuestos,
            ...pagina2.repuestos,
            ...pagina3.repuestos,
        ].map((repuesto) => repuesto.documento_id);
        expect(ids).toHaveLength(5);
        expect(new Set(ids).size).toBe(5);
    });

    it('listarRepuestos aplica filtros server-side', async () => {
        prepararAdmin();
        seedRepuesto('a', 'A-001', {
            categoria: 'FRENOS',
            fabricante: 'BOSCH',
        });
        seedRepuesto('b', 'A-002', {
            categoria: 'FRENOS',
            fabricante: 'HONDA',
        });
        seedRepuesto('c', 'A-003', {
            categoria: 'LUBRICANTES',
            fabricante: 'MOTUL',
        });

        const porCategoria = await listarRepuestos(
            { categoria: 'FRENOS', limite: 50 },
            ACTOR
        );
        expect(
            porCategoria.repuestos.map((r) => r.documento_id)
        ).toEqual(['a', 'b']);

        const porFabricante = await listarRepuestos(
            { fabricante: 'Honda', limite: 50 },
            ACTOR
        );
        expect(porFabricante.repuestos.map((r) => r.documento_id)).toEqual([
            'b',
        ]);

        const porCategoriaMinusculas = await listarRepuestos(
            { categoria: 'frenos', limite: 50 },
            ACTOR
        );
        expect(
            porCategoriaMinusculas.repuestos.map((r) => r.documento_id)
        ).toEqual(['a', 'b']);

        const porFabricanteMinusculas = await listarRepuestos(
            { fabricante: 'honda', limite: 50 },
            ACTOR
        );
        expect(
            porFabricanteMinusculas.repuestos.map((r) => r.documento_id)
        ).toEqual(['b']);

        const porFiltrosMinusculas = await listarRepuestos(
            { categoria: 'frenos', fabricante: 'bosch', limite: 50 },
            ACTOR
        );
        expect(
            porFiltrosMinusculas.repuestos.map((r) => r.documento_id)
        ).toEqual(['a']);

        const porPrefijo = await listarRepuestos(
            { referencia: 'A-00', limite: 50 },
            ACTOR
        );
        expect(porPrefijo.repuestos).toHaveLength(3);
    });

    it('listarRepuestos filtra por referencia alternativa exacta', async () => {
        prepararAdmin();
        seedRepuesto('a', 'A-001', {
            categoria: 'FRENOS',
            fabricante: 'BOSCH',
            referencias_alternativas: ['ALT-001'],
        });
        seedRepuesto('b', 'A-002', {
            categoria: 'FRENOS',
            fabricante: 'HONDA',
            referencias_alternativas: ['ALT-002', 'ALT-003'],
        });
        seedRepuesto('c', 'A-003', {
            categoria: 'LUBRICANTES',
            fabricante: 'MOTUL',
        });

        const porAlternativa = await listarRepuestos(
            { referencia_alternativa: 'alt-001', limite: 50 },
            ACTOR
        );
        expect(
            porAlternativa.repuestos.map((r) => r.documento_id)
        ).toEqual(['a']);

        const porSegundaAlternativa = await listarRepuestos(
            { referencia_alternativa: 'ALT-003', limite: 50 },
            ACTOR
        );
        expect(
            porSegundaAlternativa.repuestos.map((r) => r.documento_id)
        ).toEqual(['b']);

        const combinado = await listarRepuestos(
            {
                referencia_alternativa: 'alt-002',
                categoria: 'frenos',
                fabricante: 'honda',
                limite: 50,
            },
            ACTOR
        );
        expect(combinado.repuestos.map((r) => r.documento_id)).toEqual([
            'b',
        ]);

        const inexistente = await listarRepuestos(
            { referencia_alternativa: 'ALT-999', limite: 50 },
            ACTOR
        );
        expect(inexistente.repuestos).toHaveLength(0);

        const prefijo = await listarRepuestos(
            { referencia_alternativa: 'ALT', limite: 50 },
            ACTOR
        );
        expect(prefijo.repuestos).toHaveLength(0);
    });

    it('contarRepuestos cuenta por referencia alternativa exacta', async () => {
        prepararAdmin();
        seedRepuesto('a', 'A-001', {
            categoria: 'FRENOS',
            fabricante: 'BOSCH',
            referencias_alternativas: ['ALT-001'],
        });
        seedRepuesto('b', 'A-002', {
            categoria: 'FRENOS',
            fabricante: 'HONDA',
            referencias_alternativas: ['ALT-002'],
        });
        seedRepuesto('c', 'A-003', {
            categoria: 'LUBRICANTES',
            fabricante: 'MOTUL',
        });

        const porAlternativa = await contarRepuestos(
            { referencia_alternativa: 'alt-001' },
            ACTOR
        );
        expect(porAlternativa.total).toBe(1);

        const combinado = await contarRepuestos(
            {
                referencia_alternativa: 'ALT-002',
                categoria: 'frenos',
                fabricante: 'honda',
            },
            ACTOR
        );
        expect(combinado.total).toBe(1);

        const inexistente = await contarRepuestos(
            { referencia_alternativa: 'ALT-999' },
            ACTOR
        );
        expect(inexistente.total).toBe(0);
        expect(mockState.writes).toHaveLength(0);
    });

    it('contarRepuestos usa count() con filtros y no devuelve documentos', async () => {
        prepararAdmin();
        seedRepuesto('a', 'A-001', {
            categoria: 'FRENOS',
            fabricante: 'BOSCH',
        });
        seedRepuesto('b', 'A-002', {
            categoria: 'FRENOS',
            fabricante: 'HONDA',
        });
        seedRepuesto('c', 'A-003', {
            categoria: 'LUBRICANTES',
            fabricante: 'MOTUL',
        });

        const total = await contarRepuestos({}, ACTOR);
        expect(total.success).toBe(true);
        expect(total.total).toBe(3);

        const frenos = await contarRepuestos(
            { categoria: 'frenos' },
            ACTOR
        );
        expect(frenos.total).toBe(2);

        const bosch = await contarRepuestos(
            { fabricante: 'bosch' },
            ACTOR
        );
        expect(bosch.total).toBe(1);

        const prefijo = await contarRepuestos(
            { referencia: 'A-00' },
            ACTOR
        );
        expect(prefijo.total).toBe(3);
        expect(mockState.writes).toHaveLength(0);
    });

    it('contarRepuestos rechaza actor inválido antes de Firebase', async () => {
        const resultado = await contarRepuestos({}, {});

        expect(resultado.success).toBe(false);
        expect(resultado.total).toBe(0);
        expect(mockState.writes).toHaveLength(0);
    });

    it('buscarCandidatosRepuesto resuelve exacto, prefijo y alternativa', async () => {
        prepararAdmin();
        seedRepuesto('brk-1', 'BRK-001', {
            referencias_alternativas: ['ALT-001'],
        });
        seedRepuesto('brk-2', 'BRK-002');

        const exacto = await buscarCandidatosRepuesto(
            { consulta: 'BRK-001', etiquetas: [], limite: 10 },
            ACTOR
        );
        expect(exacto.candidatos[0]?.documento_id).toBe('brk-1');

        const prefijo = await buscarCandidatosRepuesto(
            { consulta: 'BRK-00', etiquetas: [], limite: 10 },
            ACTOR
        );
        expect(
            prefijo.candidatos.map((c) => c.documento_id)
        ).toEqual(expect.arrayContaining(['brk-1', 'brk-2']));

        const alternativa = await buscarCandidatosRepuesto(
            { consulta: 'ALT-001', etiquetas: [], limite: 10 },
            ACTOR
        );
        expect(alternativa.candidatos[0]?.documento_id).toBe('brk-1');
        expect(mockState.writes).toHaveLength(0);
    });
});
