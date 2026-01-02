'use client';

import { useState } from 'react';
import { useInventory, Product } from '@/lib/hooks/useInventory';
import InventoryTable from '@/components/InventoryTable';
import EditProductModal from '@/components/EditProductModal';

import ScrapingControl from '@/components/admin/ScrapingControl';

/**
 * InventoryPage - Dashboard de Gestión de Inventario
 * 
 * Permite a los administradores visualizar, editar y CREAR nuevos productos.
 * 
 * Flow de Creación:
 * 1. Click en "Agregar Moto" -> handleCreate() -> Abre modal con product=null.
 * 2. EditProductModal detecta null -> Modo Creación -> setDoc con nuevo ID.
 * 
 * Estado:
 * - isModalOpen: Controla visibilidad explícita del modal.
 * - editingProduct: Data del producto a editar o NULL para crear.
 */
export default function InventoryPage() {
    const { products, loading, error } = useInventory();

    // Estado del Modal
    const [isModalOpen, setIsModalOpen] = useState(false);
    // Producto en edición (null = Creando nuevo)
    const [editingProduct, setEditingProduct] = useState<Product | null>(null);

    const handleCreate = () => {
        setEditingProduct(null); // Modo creación
        setIsModalOpen(true);
    };

    const handleEdit = (product: Product) => {
        setEditingProduct(product); // Modo edición
        setIsModalOpen(true);
    };

    const handleCloseModal = () => {
        setIsModalOpen(false);
        setEditingProduct(null);
    };

    // Loading State simple
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
                        Control total de <span className="text-white font-bold">{products.length}</span> items activos en tiempo real.
                    </p>
                </div>
                {/* BOTONES DE ACCIÓN - Lado derecho header */}
                <div className="flex flex-wrap items-center gap-4">
                    <ScrapingControl />

                    <button
                        onClick={handleCreate}
                        className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg font-bold shadow-lg transition-all hover:scale-105"
                    >
                        <span className="text-xl">+</span> Agregar Moto
                    </button>
                </div>
            </div>

            {/* Contenedor Principal de la Tabla */}
            <div className="bg-gray-900/50 p-6 rounded-xl border border-gray-800 shadow-xl">
                <div className="flex items-center justify-between mb-6">
                    <p className="text-gray-400 text-sm">
                        Mostrando <span className="text-white font-bold">{products.length}</span> items activos.
                    </p>
                </div>

                {/* TABLA: Ahora es "tonta", solo avisa clicks */}
                <InventoryTable
                    products={products}
                    onEdit={handleEdit}
                />
            </div>

            {/* MODAL: Controlado explícitamente por isModalOpen */}
            {isModalOpen && (
                <EditProductModal
                    product={editingProduct}
                    isOpen={isModalOpen}
                    onClose={handleCloseModal}
                />
            )}
        </div>
    );
}
