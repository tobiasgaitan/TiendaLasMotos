import { useState } from 'react';
import Image from 'next/image';
import { Product } from '@/lib/hooks/useInventory';

interface Props {
    products: Product[];
    onEdit: (product: Product) => void;
}

/**
 * InventoryTable Component
 * 
 * Displays a searchable table of inventory products (motos).
 * Includes product image, details, price, and an action button to edit.
 * 
 * @param {Props} props - Component props
 * @param {Product[]} props.products - List of products to display
 * @param {function} props.onEdit - Callback function to handle edit action
 * @returns {JSX.Element} The rendered inventory table
 */
export default function InventoryTable({ products, onEdit }: Props) {
    const [searchTerm, setSearchTerm] = useState('');

    const filteredProducts = products.filter(product => {
        const term = searchTerm.toLowerCase();
        return (
            product.model.toLowerCase().includes(term) ||
            product.brand.toLowerCase().includes(term)
        );
    });

    return (
        <div className="w-full space-y-4">
            {/* BARRA DE BÚSQUEDA */}
            <div className="relative">
                <input
                    type="text"
                    className="block w-full p-4 border border-gray-700 rounded-lg bg-gray-900 text-white placeholder-gray-500 focus:ring-2 focus:ring-blue-500 outline-none"
                    placeholder="🔍 Buscar moto..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>

            {/* --- ZONA DE LA TABLA --- */}
            <div className="w-full overflow-hidden bg-black rounded-lg border border-gray-800">
                <table className="w-full text-left text-gray-300">
                    <thead className="text-xs uppercase bg-gray-800 text-gray-400">
                        <tr>
                            <th className="px-4 py-3 w-[80px]">Foto</th>
                            <th className="px-4 py-3">Modelo / Marca</th>
                            <th className="px-4 py-3">Precio</th>
                            <th className="px-4 py-3 text-right">Acción</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800">
                        {filteredProducts.map((product) => (
                            <tr key={product.id} className="hover:bg-gray-900 transition-colors">
                                {/* Foto */}
                                <td className="px-4 py-3">
                                    <div className="relative h-12 w-12 bg-gray-800 rounded border border-gray-700 overflow-hidden flex-shrink-0">
                                        {product.imagen_url ? (
                                            <Image
                                                src={product.imagen_url}
                                                alt="Moto"
                                                width={48}
                                                height={48}
                                                className="object-cover w-full h-full"
                                            />
                                        ) : (
                                            <div className="flex items-center justify-center h-full w-full text-[10px] text-gray-500">N/A</div>
                                        )}
                                    </div>
                                </td>
                                {/* Info */}
                                <td className="px-4 py-3 align-middle">
                                    <div className="flex flex-col justify-center">
                                        <span className="text-white font-bold text-sm">
                                            {product.model}
                                            <span className="ml-2 text-xs font-normal text-gray-500 bg-gray-800 px-2 py-0.5 rounded-full">{product.brand}</span>
                                        </span>
                                        {product.year && <span className="text-[10px] text-gray-600">Año {product.year}</span>}
                                    </div>
                                </td>
                                {/* Precio */}
                                <td className="px-4 py-3 align-middle text-emerald-400 font-mono text-sm">
                                    ${product.price?.toLocaleString('es-CO') || '0'}
                                </td>
                                {/* BOTÓN AZUL (CORREGIDO) */}
                                <td className="px-4 py-3 align-middle text-right relative">
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onEdit(product);
                                        }}
                                        className="relative z-50 px-4 py-2 rounded text-xs font-bold shadow-md active:scale-95 transition-transform bg-[#2563eb] text-white hover:bg-[#1d4ed8] cursor-pointer border-none"
                                    >
                                        EDITAR
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
