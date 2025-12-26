import { useState } from 'react';
import Image from 'next/image';
import { Product } from '@/lib/hooks/useInventory';
import EditProductModal from './EditProductModal';

/**
 * Tabla de inventario inteligente.
 * Incluye barra de búsqueda instantánea tipo Google y gestión de estado para el modal de edición.
 */
export default function InventoryTable({ products }: { products: Product[] }) {
    const [searchTerm, setSearchTerm] = useState('');
    const [editingProduct, setEditingProduct] = useState<Product | null>(null);

    // Lógica de Búsqueda Instantánea
    const filteredProducts = products.filter(product => {
        const term = searchTerm.toLowerCase();
        return (
            product.model.toLowerCase().includes(term) ||
            product.brand.toLowerCase().includes(term)
        );
    });

    return (
        <div className="w-full space-y-4">
            {/* BARRA DE BÚSQUEDA TIPO GOOGLE */}
            <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                </div>
                <input
                    type="text"
                    className="block w-full pl-10 pr-3 py-3 border border-gray-700 rounded-lg leading-5 bg-gray-900 text-gray-300 placeholder-gray-500 focus:outline-none focus:bg-gray-800 focus:border-blue-500 transition-colors duration-200 sm:text-sm"
                    placeholder="Buscar por modelo, marca..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>

            {/* TABLA DE RESULTADOS */}
            <div className="w-full overflow-x-auto bg-gray-900 rounded-lg shadow-lg border border-gray-800">
                <table className="w-full text-left text-gray-300">
                    <thead className="text-xs uppercase bg-gray-800 text-gray-400">
                        <tr>
                            <th scope="col" className="px-6 py-4">Foto</th>
                            <th scope="col" className="px-6 py-4">Modelo / Marca</th>
                            <th scope="col" className="px-6 py-4">Precio</th>
                            <th scope="col" className="px-6 py-4 text-center">Visible</th>
                            <th scope="col" className="px-6 py-4 text-right">Acciones</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800">
                        {filteredProducts.map((product) => (
                            <tr key={product.id} className="hover:bg-gray-800/50 transition-colors group">
                                <td className="px-6 py-4">
                                    <div className="h-12 w-12 relative bg-gray-700 rounded overflow-hidden">
                                        {product.imageUrl ? (
                                            <Image
                                                src={product.imageUrl}
                                                alt={product.model}
                                                fill
                                                className="object-cover"
                                            />
                                        ) : (
                                            <span className="flex items-center justify-center h-full text-xs text-gray-500">N/A</span>
                                        )}
                                    </div>
                                </td>
                                <td className="px-6 py-4">
                                    <div className="font-medium text-white group-hover:text-blue-400 transition-colors">{product.model}</div>
                                    <div className="text-xs text-gray-500">{product.brand} • {product.year || 'N/A'}</div>
                                </td>
                                <td className="px-6 py-4 font-mono text-emerald-400">
                                    ${product.price.toLocaleString('es-CO')}
                                </td>
                                <td className="px-6 py-4 text-center">
                                    {/* Indicador visual de estado */}
                                    <div className={`inline-flex h-3 w-3 rounded-full ${product.isVisible !== false ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]' : 'bg-gray-600'}`}></div>
                                </td>
                                <td className="px-6 py-4 text-right">
                                    <button
                                        onClick={() => setEditingProduct(product)}
                                        className="text-blue-400 hover:text-white bg-blue-900/20 hover:bg-blue-600 px-3 py-1 rounded text-xs font-medium transition-all"
                                    >
                                        Editar
                                    </button>
                                </td>
                            </tr>
                        ))}
                        {filteredProducts.length === 0 && (
                            <tr>
                                <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                                    No se encontraron resultados para "{searchTerm}"
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* MODAL DE EDICIÓN */}
            {editingProduct && (
                <EditProductModal
                    product={editingProduct}
                    isOpen={!!editingProduct}
                    onClose={() => setEditingProduct(null)}
                />
            )}
        </div>
    );
}
