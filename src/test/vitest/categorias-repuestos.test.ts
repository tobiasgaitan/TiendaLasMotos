import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
    CATEGORIA_DESCRIPCION_MAX,
    CATEGORIA_NOMBRE_MAX,
    aCategoriaDTO,
    claveCategoria,
    normalizarNombreCategoria,
    ordenarCategorias,
} from '@/lib/inventario/categorias';
import {
    CATEGORIAS_CANONICAS_V1,
    NOMBRES_CANONICOS_V1,
    esNombreCanonicoV1,
} from '@/lib/inventario/categorias-canonicas';
import {
    cambiosCategoriaRepuestoSchema,
    crearCategoriaRepuestoSchema,
    editarCategoriaRepuestoSchema,
    eliminarCategoriaRepuestoSchema,
    listarCategoriasRepuestosSchema,
} from '@/lib/actions/categorias-repuestos-schemas';

function source(ruta: string): string {
    return readFileSync(ruta, 'utf8');
}

describe('WEB-INV-053 — normalización de categorías', () => {
    it('normaliza trim, espacios y mayúsculas', () => {
        expect(normalizarNombreCategoria('  línea   de cuidado ')).toBe(
            'LÍNEA DE CUIDADO'
        );
        expect(normalizarNombreCategoria('Frenos')).toBe('FRENOS');
    });

    it('deriva claves estables sin acentos ni separadores inválidos', () => {
        expect(claveCategoria('  línea de cuidado ')).toBe('LINEA_DE_CUIDADO');
        expect(claveCategoria('Los Originales')).toBe('LOS_ORIGINALES');
        expect(claveCategoria('A/B')).toBe('A_B');
        expect(claveCategoria('  ***  ')).toBe('');
    });

    it('ordena por orden ascendente y desempata por nombre', () => {
        const ordenadas = ordenarCategorias([
            { nombre: 'ZETA', orden: 20 },
            { nombre: 'ALFA', orden: 20 },
            { nombre: 'BETA', orden: 10 },
        ]);
        expect(ordenadas.map((categoria) => categoria.nombre)).toEqual([
            'BETA',
            'ALFA',
            'ZETA',
        ]);
    });

    it('serializa el DTO y sanea campos inválidos', () => {
        const dto = aCategoriaDTO('FRENOS', {
            clave: 'FRENOS',
            nombre: ' frenos ',
            descripcion: 'Sistema de frenos',
            orden: 10,
            activo: true,
            creado_por: 'admin@test.com',
            creado_en: new Date('2026-01-01T00:00:00.000Z'),
            actualizado_por: 'admin@test.com',
            actualizado_en: new Date('2026-01-02T00:00:00.000Z'),
        });
        expect(dto.nombre).toBe('FRENOS');
        expect(dto.orden).toBe(10);
        expect(dto.activo).toBe(true);
        expect(dto.creado_en).toBe('2026-01-01T00:00:00.000Z');
        expect(dto.version).toBe(1);

        const invalido = aCategoriaDTO('X', {});
        expect(invalido.nombre).toBe('');
        expect(invalido.activo).toBe(false);
        expect(invalido.orden).toBe(100);
    });
});

describe('WEB-INV-053 — semilla canónica (opción A)', () => {
    it('declara exactamente los seis valores existentes', () => {
        expect(NOMBRES_CANONICOS_V1).toEqual([
            'REPUESTOS',
            'LOS ORIGINALES',
            'ACCESORIOS',
            'LUBRICANTES',
            'GENERICOS',
            'LINEA DE CUIDADO',
        ]);
    });

    it('usa claves únicas y orden editable con default', () => {
        const claves = CATEGORIAS_CANONICAS_V1.map((categoria) =>
            claveCategoria(categoria.nombre)
        );
        expect(new Set(claves).size).toBe(claves.length);
        expect(
            CATEGORIAS_CANONICAS_V1.every(
                (categoria) =>
                    Number.isInteger(categoria.orden) && categoria.orden >= 0
            )
        ).toBe(true);
    });

    it('reconoce solo nombres canónicos exactos', () => {
        expect(esNombreCanonicoV1('REPUESTOS')).toBe(true);
        expect(esNombreCanonicoV1('repuestos')).toBe(false);
        expect(esNombreCanonicoV1('FRENOS')).toBe(false);
    });
});

describe('WEB-INV-053 — schemas de categorías', () => {
    it('crear normaliza el nombre y aplica defaults', () => {
        const parsed = crearCategoriaRepuestoSchema.parse({
            nombre: '  filtros  ',
        });
        expect(parsed.nombre).toBe('FILTROS');
        expect(parsed.descripcion).toBe('');
        expect(parsed.orden).toBe(100);
    });

    it('crear rechaza nombre vacío y campos desconocidos', () => {
        expect(
            crearCategoriaRepuestoSchema.safeParse({ nombre: '   ' }).success
        ).toBe(false);
        expect(
            crearCategoriaRepuestoSchema.safeParse({
                nombre: 'FILTROS',
                clave: 'FILTROS',
            }).success
        ).toBe(false);
    });

    it('crear respeta los límites de nombre y descripción', () => {
        expect(
            crearCategoriaRepuestoSchema.safeParse({
                nombre: 'A'.repeat(CATEGORIA_NOMBRE_MAX + 1),
            }).success
        ).toBe(false);
        expect(
            crearCategoriaRepuestoSchema.safeParse({
                nombre: 'FILTROS',
                descripcion: 'x'.repeat(CATEGORIA_DESCRIPCION_MAX + 1),
            }).success
        ).toBe(false);
    });

    it('editar acepta solo campos editables y exige al menos uno', () => {
        expect(
            editarCategoriaRepuestoSchema.safeParse({
                clave: 'FRENOS',
                nombre: 'FRENOS',
                cambios: { descripcion: 'x', orden: 1, activo: false },
            }).success
        ).toBe(true);

        expect(
            cambiosCategoriaRepuestoSchema.safeParse({}).success
        ).toBe(false);
        expect(
            cambiosCategoriaRepuestoSchema.safeParse({ nombre: 'OTRO' })
                .success
        ).toBe(false);
        expect(
            cambiosCategoriaRepuestoSchema.safeParse({ clave: 'OTRO' }).success
        ).toBe(false);
    });

    it('editar rechaza orden fuera de rango y nombre vacío', () => {
        expect(
            editarCategoriaRepuestoSchema.safeParse({
                clave: 'FRENOS',
                nombre: 'FRENOS',
                cambios: { orden: -1 },
            }).success
        ).toBe(false);
        expect(
            editarCategoriaRepuestoSchema.safeParse({
                clave: 'FRENOS',
                nombre: '   ',
                cambios: { orden: 1 },
            }).success
        ).toBe(false);
    });

    it('eliminar exige clave y nombre exactos', () => {
        expect(
            eliminarCategoriaRepuestoSchema.safeParse({
                clave: 'FRENOS',
                nombre: 'FRENOS',
            }).success
        ).toBe(true);
        expect(
            eliminarCategoriaRepuestoSchema.safeParse({ clave: 'FRENOS' })
                .success
        ).toBe(false);
    });

    it('listar usa incluirArchivadas=true por defecto', () => {
        expect(
            listarCategoriasRepuestosSchema.parse({}).incluirArchivadas
        ).toBe(true);
        expect(
            listarCategoriasRepuestosSchema.safeParse({
                incluirArchivadas: true,
                extra: 1,
            }).success
        ).toBe(false);
    });
});

describe('WEB-INV-053 — Firestore, servidor y UI', () => {
    const RULES = source('firestore.rules');
    const CREAR = source(
        'src/app/admin/inventario-categorias/actions/crearCategoria.ts'
    );
    const EDITAR = source(
        'src/app/admin/inventario-categorias/actions/editarCategoria.ts'
    );
    const ELIMINAR = source(
        'src/app/admin/inventario-categorias/actions/eliminarCategoria.ts'
    );
    const LISTAR = source(
        'src/app/admin/inventario-categorias/actions/listarCategorias.ts'
    );
    const CREAR_REPUESTO = source(
        'src/app/admin/inventario-repuestos/actions/crearRepuesto.ts'
    );
    const EDITAR_REPUESTO = source(
        'src/app/admin/inventario-repuestos/actions/editarRepuesto.ts'
    );
    const CLIENT = source(
        'src/app/admin/inventario-repuestos/InventarioRepuestosClient.tsx'
    );
    const MODAL = source('src/components/inventario/CrearRepuestoModal.tsx');
    const SELECTOR = source(
        'src/components/inventario/SelectorCategoriaRepuesto.tsx'
    );
    const SIDEBAR = source('src/components/AdminSidebar.tsx');
    const INVENTARIO_TYPES = source('src/types/inventario.ts');
    const SCRIPT = source('scripts/inv-053-categorias.ts');

    it('las reglas permiten lectura admin y bloquean escritura cliente', () => {
        expect(RULES).toContain('match /categorias_repuestos/{categoria}');
        expect(RULES).toContain(
            "rolActual() in ['superadmin', 'admin', 'auditor']"
        );
        expect(RULES).toContain('allow create, update, delete: if false;');
    });

    it('el ledger acepta categorias_repuestos de forma aditiva', () => {
        expect(INVENTARIO_TYPES).toContain('| \'categorias_repuestos\'');
        expect(INVENTARIO_TYPES).toContain("'inventario_repuestos'");
    });

    it('las acciones aplican Faraday Cage completo', () => {
        for (const accion of [CREAR, EDITAR, ELIMINAR]) {
            expect(accion.startsWith("'use server';")).toBe(true);
            expect(accion).toContain('validarActor(actor)');
            expect(accion).toContain('requireActorInventario(a.idToken)');
            expect(accion).toContain('requirePermiso(');
            expect(accion).toContain("'inventario_repuestos'");
            expect(accion).toContain("permiso.rol !== 'admin'");
            expect(accion).toContain("permiso.rol !== 'superadmin'");
            expect(accion).toContain('runTransaction');
        }

        expect(LISTAR).toContain('validarActor(actor)');
        expect(LISTAR).toContain('requireActorInventario(a.idToken)');
        expect(LISTAR).toContain('requirePermiso(');
        expect(LISTAR).toContain("'read'");
    });

    it('el ledger solo se escribe con tx.create', () => {
        for (const accion of [CREAR, EDITAR, ELIMINAR]) {
            expect(accion).toContain('tx.create(ledgerRef');
            expect(accion).not.toContain('tx.set(');
            expect(accion).not.toContain('tx.add(');
            expect(accion).not.toContain('.add(');
        }
        expect(ELIMINAR).toContain('tx.delete(categoriaRef)');
    });

    it('crearRepuesto y editarRepuesto validan la categoría canónica', () => {
        for (const accion of [CREAR_REPUESTO, EDITAR_REPUESTO]) {
            expect(accion).toContain("collection('categorias_repuestos')");
            expect(accion).toContain('claveCategoria(');
            expect(accion).toContain('archivada');
            expect(accion).toContain('no existe');
        }
        expect(CREAR_REPUESTO).toContain('categoria: data.categoria,');
    });

    it('la UI usa select canónico y no texto libre de categoría', () => {
        expect(MODAL).toContain('SelectorCategoriaRepuesto');
        expect(MODAL).not.toContain('placeholder="Ej. Filtros"');
        expect(MODAL).not.toContain('setCategoria(event.target.value)');
        expect(CLIENT).toContain('SelectorCategoriaRepuesto');
        expect(CLIENT).toContain('useCategoriasRepuestos');
        expect(SELECTOR).toContain('<select');
        expect(SELECTOR).toContain('Todas las categorías');
        expect(SELECTOR).not.toContain('<input');
    });

    it('el sidebar expone Inventario > Categorías', () => {
        expect(SIDEBAR).toContain('Categorías');
        expect(SIDEBAR).toContain('href="/admin/inventario-categorias"');
    });

    it('el script es dry-run por defecto y exige autorización para aplicar', () => {
        expect(SCRIPT).toContain("'dry-run'");
        expect(SCRIPT).toContain('--apply');
        expect(SCRIPT).toContain('--verify');
        expect(SCRIPT).toContain('--authorized-by');
        expect(SCRIPT).toContain('requireConfirmation');
        expect(SCRIPT).toContain('initFirebaseGuarded');
        expect(SCRIPT).toContain('assertOutDirOutsideRepo');
        expect(SCRIPT).toContain('inventarioActualizado = 0');
        expect(SCRIPT).not.toContain("collection('inventario_repuestos').doc(");
    });
});
