import { describe, expect, it } from 'vitest';
import { mergeDeleteInventario } from '@/lib/auth/permisos-inventario';

describe('mergeDeleteInventario', () => {
    it('agrega delete a admin preservando acciones y scope', () => {
        const entrada = {
            inventario_repuestos: {
                acciones: ['read', 'update'],
                scope: 'email_admin',
            },
            creditos: { acciones: ['read'] },
        };

        const resultado = mergeDeleteInventario('admin', entrada);

        expect(resultado.cambios).toEqual([
            'inventario_repuestos:delete',
        ]);
        expect(
            resultado.permisos.inventario_repuestos
        ).toEqual({
            acciones: ['read', 'update', 'delete'],
            scope: 'email_admin',
        });
        expect(resultado.permisos.creditos).toEqual({ acciones: ['read'] });
    });

    it('agrega delete a superadmin', () => {
        const resultado = mergeDeleteInventario('superadmin', {
            inventario_repuestos: { acciones: ['create', 'read', 'update'] },
        });

        expect(resultado.cambios).toEqual([
            'inventario_repuestos:delete',
        ]);
        expect(
            (resultado.permisos.inventario_repuestos as {
                acciones: string[];
            }).acciones
        ).toContain('delete');
    });

    it('es idempotente si delete ya existe', () => {
        const resultado = mergeDeleteInventario('admin', {
            inventario_repuestos: {
                acciones: ['create', 'read', 'update', 'delete'],
            },
        });

        expect(resultado.cambios).toEqual([]);
        expect(
            (resultado.permisos.inventario_repuestos as {
                acciones: string[];
            }).acciones
        ).toEqual(['create', 'read', 'update', 'delete']);
    });

    it('no modifica roles sin delete de inventario', () => {
        const entrada = {
            inventario_repuestos: { acciones: ['read'] },
        };
        const resultado = mergeDeleteInventario('asesor', entrada);

        expect(resultado.cambios).toEqual([]);
        expect(resultado.permisos).toEqual(entrada);
    });

    it('parte de DEFAULT_MATRIZ si falta la colección', () => {
        const resultado = mergeDeleteInventario('admin', {
            creditos: { acciones: ['read'] },
        });

        expect(resultado.cambios).toEqual([
            'inventario_repuestos:delete',
        ]);
        const permiso = resultado.permisos.inventario_repuestos as {
            acciones: string[];
        };
        expect(permiso.acciones).toEqual(
            expect.arrayContaining(['create', 'read', 'update', 'delete'])
        );
        expect(resultado.permisos.creditos).toEqual({ acciones: ['read'] });
    });

    it('no muta la entrada', () => {
        const entrada = {
            inventario_repuestos: { acciones: ['read'] },
        };
        const copia = JSON.parse(JSON.stringify(entrada));

        mergeDeleteInventario('admin', entrada);

        expect(entrada).toEqual(copia);
    });

    it('no toca acciones inválidas y reporta advertencia', () => {
        const entrada = {
            inventario_repuestos: { acciones: 'create' },
        };
        const resultado = mergeDeleteInventario('admin', entrada);

        expect(resultado.cambios).toEqual([]);
        expect(resultado.advertencia).toContain('acciones inválidas');
        expect(resultado.permisos).toEqual(entrada);
    });

    it('reporta permisos ausentes sin inventar estructura', () => {
        const resultado = mergeDeleteInventario('admin', null);

        expect(resultado.permisos).toEqual({});
        expect(resultado.cambios).toEqual([]);
        expect(resultado.advertencia).toContain('permisos inválidos');
    });
});
