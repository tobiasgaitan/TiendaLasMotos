"use client";

import InventoryTable from "@/components/InventoryTable";
import { useInventory } from "@/lib/hooks/useInventory";

/**
 * Página de gestión de inventario para administradores.
 * Utiliza `useInventory` para conectarse al feed en tiempo real del Bot y
 * redirige la gestión de UI (Buscador, Edición) al componente `InventoryTable`.
 */
export default function InventoryPage() {
    const { products, loading, error } = useInventory();

    if (loading) {
        return (
            <div className="flex items-center justify-center p-12">
                <div className="flex flex-col items-center gap-4">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-500"></div>
                    <p className="text-gray-400 animate-pulse">Sincronizando con el Bot...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-8 text-center bg-red-900/20 border border-red-900 rounded-xl mx-4 mt-8">
                <h3 className="text-xl font-bold text-red-400 mb-2">Error de Conexión</h3>
                <p className="text-gray-300">{error}</p>
            </div>
        );
    }

    return (
        <div className="space-y-8">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-white tracking-tight">Gestión de Inventario</h1>
                    <p className="text-gray-400 mt-1">
                        Control total de {products.length} items activos en tiempo real.
                    </p>
                </div>
            </div>

            {/* Smart Table with Built-in Search & Modal */}
            <InventoryTable products={products} />
        </div>
    );
}
