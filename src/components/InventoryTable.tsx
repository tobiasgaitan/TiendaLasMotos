import Image from 'next/image';

interface Product {
    id: string;
    brand: string;
    model: string;
    price: number;
    status: 'Activo' | 'Inactivo';
    imageUrl?: string;
    onEdit?: (product: Product) => void;
}

/**
 * Componente de tabla para visualizar el inventario de motos.
 * Renders a responsive table using standard HTML table elements for accessibility and better semantic structure.
 * Handles image rendering via Next.js Image for optimization (requires config).
 * Uses explicit Tailwind classes for consistent styling across the admin panel.
 */
export default function InventoryTable({ products, onEdit }: { products: Product[], onEdit?: (product: Product) => void }) {
    return (
        <div className="w-full overflow-x-auto bg-gray-900 rounded-lg shadow-lg border border-gray-800">
            <table className="w-full text-left text-gray-300">
                <thead className="text-xs uppercase bg-gray-800 text-gray-400">
                    <tr>
                        <th scope="col" className="px-6 py-4">Foto</th>
                        <th scope="col" className="px-6 py-4">Modelo / Marca</th>
                        <th scope="col" className="px-6 py-4">Precio Base</th>
                        <th scope="col" className="px-6 py-4 text-center">Estado</th>
                        <th scope="col" className="px-6 py-4 text-right">Acciones</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                    {products.map((product) => (
                        <tr key={product.id} className="hover:bg-gray-800/50 transition-colors">
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
                                <div className="font-medium text-white">{product.model}</div>
                                <div className="text-sm text-blue-400">{product.brand}</div>
                            </td>
                            <td className="px-6 py-4 font-mono text-emerald-400">
                                ${product.price.toLocaleString('es-CO')}
                            </td>
                            <td className="px-6 py-4 text-center">
                                <span className={`px-2 py-1 rounded-full text-xs font-medium ${product.status === 'Activo'
                                    ? 'bg-green-900/30 text-green-400 border border-green-800'
                                    : 'bg-red-900/30 text-red-400 border border-red-800'
                                    }`}>
                                    {product.status}
                                </span>
                            </td>
                            <td className="px-6 py-4 text-right">
                                <button
                                    onClick={() => onEdit?.(product)}
                                    className="text-blue-400 hover:text-blue-300 font-medium text-sm"
                                >
                                    Editar
                                </button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
