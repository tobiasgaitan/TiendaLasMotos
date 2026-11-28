'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { listarCategoriasRepuestos } from '@/app/admin/inventario-categorias/actions/listarCategorias';
import type { CategoriaRepuestoDTO } from '@/types/categorias-repuestos';

interface UseCategoriasRepuestosResult {
    categorias: CategoriaRepuestoDTO[];
    cargando: boolean;
    error: string | null;
    recargar: () => Promise<void>;
}

/**
 * WEB-INV-053 — Carga única y cacheada de categorías canónicas.
 *
 * La lista se usa en el alta, el filtro y la edición inline. No se refresca
 * por tecla: el selector trabaja con memoria y `recargar()` se invoca tras
 * un CRUD o manualmente.
 */
export function useCategoriasRepuestos(): UseCategoriasRepuestosResult {
    const { user } = useAuth();
    const [categorias, setCategorias] = useState<CategoriaRepuestoDTO[]>([]);
    const [cargando, setCargando] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const recargar = useCallback(async () => {
        if (!user) {
            setCategorias([]);
            setCargando(false);
            setError('Sesión inválida. Vuelve a iniciar sesión.');
            return;
        }

        setCargando(true);
        setError(null);

        try {
            const idToken = await user.getIdToken();
            const resultado = await listarCategoriasRepuestos(
                { incluirArchivadas: true },
                { uid: user.uid, idToken }
            );

            if (!resultado.success) {
                setError(
                    resultado.message ??
                        'No se pudieron cargar las categorías.'
                );
                return;
            }

            setCategorias(resultado.categorias);
        } catch (errorCarga) {
            console.error(
                '[inventario-categorias-ui] No se pudieron cargar las categorías:',
                errorCarga
            );
            setError(
                errorCarga instanceof Error && errorCarga.message.trim()
                    ? errorCarga.message
                    : 'No se pudieron cargar las categorías.'
            );
        } finally {
            setCargando(false);
        }
    }, [user]);

    useEffect(() => {
        void recargar();
    }, [recargar]);

    return { categorias, cargando, error, recargar };
}
