import { useState } from 'react';
import { doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Product } from '@/lib/hooks/useInventory';
import ImageUploader from './ImageUploader';

interface Props {
    product: Product;
    isOpen: boolean;
    onClose: () => void;
}

/**
 * Modal avanzado para la edición de productos (Motos y Repuestos).
 * Maneja lógica dual para campos específicos y utiliza Firestore directamente.
 */
export default function EditProductModal({ product, isOpen, onClose }: Props) {
    const [loading, setLoading] = useState(false);

    // Estado inicial inteligente
    const [formData, setFormData] = useState({
        category: product.category || 'motos',
        brand: product.brand,
        model: product.model,
        seoDescription: product.seoDescription || '',
        isVisible: product.isVisible !== undefined ? product.isVisible : true,
        imageUrl: product.imageUrl || '',

        // Marketing
        bonusAmount: product.bonusAmount || 0,
        bonusEndDate: product.bonusEndDate || '',

        // Específicos Moto
        year: product.year || new Date().getFullYear(),
        external_url: product.external_url || '',

        // Específicos Repuesto
        price: product.price,
        stock: product.stock || 0,
    });

    if (!isOpen) return null;

    const handleDelete = async () => {
        if (!confirm(`¿Eliminar "${product.model}" permanentemente? No se puede deshacer.`)) return;
        setLoading(true);
        try {
            await deleteDoc(doc(db, "pagina", "catalogo", "items", product.id));
            onClose();
        } catch (e) {
            alert("Error al eliminar");
            setLoading(false);
        }
    };

    const handleSave = async () => {
        setLoading(true);
        try {
            const ref = doc(db, "pagina", "catalogo", "items", product.id);

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const dataToSave: any = {
                category: formData.category,
                brand: formData.brand,
                model: formData.model,
                seoDescription: formData.seoDescription,
                isVisible: formData.isVisible,
                imageUrl: formData.imageUrl,
                bonusAmount: Number(formData.bonusAmount),
                bonusEndDate: formData.bonusEndDate,
            };

            if (formData.category === 'motos') {
                dataToSave.year = Number(formData.year);
                dataToSave.external_url = formData.external_url;
                // Motos: El precio lo maneja el Bot, no lo sobrescribimos aquí
            } else {
                dataToSave.price = Number(formData.price);
                dataToSave.stock = Number(formData.stock);
            }

            await updateDoc(ref, dataToSave);
            onClose();
        } catch (e) {
            console.error(e);
            alert("Error al guardar cambios");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4 backdrop-blur-sm overflow-y-auto">
            <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-3xl p-6 shadow-2xl relative my-10">
                <button onClick={onClose} className="absolute top-4 right-4 text-gray-500 hover:text-white text-xl">✕</button>

                <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-2">
                    <span className="text-blue-500">✎</span> Editar: {product.model}
                </h2>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* COLUMNA IZQUIERDA: Identidad */}
                    <div className="space-y-5">
                        <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider border-b border-gray-800 pb-2">Información Básica</h3>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-xs text-gray-500">Categoría</label>
                                <select
                                    className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2.5 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                                    value={formData.category}
                                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                                >
                                    <option value="motos">Motos</option>
                                    <option value="repuestos">Repuestos</option>
                                </select>
                            </div>
                            <div>
                                <label className="text-xs text-gray-500">Marca</label>
                                <input
                                    className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2.5 text-white"
                                    value={formData.brand}
                                    onChange={(e) => setFormData({ ...formData, brand: e.target.value })}
                                />
                            </div>
                        </div>

                        <div>
                            <label className="text-xs text-gray-500">Nombre del Modelo</label>
                            <input
                                className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2.5 text-white font-medium"
                                value={formData.model}
                                onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                            />
                        </div>

                        <div>
                            <label className="text-xs text-gray-500">Descripción SEO (Google)</label>
                            <textarea
                                className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2.5 text-white h-24 text-sm resize-none"
                                value={formData.seoDescription}
                                onChange={(e) => setFormData({ ...formData, seoDescription: e.target.value })}
                                placeholder="Ej: La moto más vendida de Colombia, ideal para trabajo..."
                            />
                        </div>

                        <div className="col-span-full">
                            <ImageUploader
                                currentImage={formData.imageUrl}
                                onImageUploaded={(url) => setFormData(prev => ({ ...prev, imageUrl: url }))}
                            />
                        </div>

                        {/* Switch de Visibilidad */}
                        <div className="flex items-center justify-between bg-gray-800 p-3 rounded-lg border border-gray-700">
                            <span className="text-sm text-gray-300">¿Visible en la Tienda?</span>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input type="checkbox" checked={formData.isVisible} onChange={(e) => setFormData({ ...formData, isVisible: e.target.checked })} className="sr-only peer" />
                                <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-600"></div>
                            </label>
                        </div>
                    </div>

                    {/* COLUMNA DERECHA: Datos Específicos */}
                    <div className="space-y-5">
                        <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider border-b border-gray-800 pb-2">Datos de Venta</h3>

                        {/* SI ES MOTO */}
                        {formData.category === 'motos' && (
                            <div className="bg-blue-900/10 p-4 rounded-xl border border-blue-800/30 space-y-4">
                                <div>
                                    <label className="text-xs text-blue-300 font-semibold">🔗 Link Auteco (Fuente de Datos)</label>
                                    <input
                                        className="w-full bg-gray-900 border border-blue-900/50 rounded-lg p-2.5 text-xs text-gray-300 font-mono"
                                        value={formData.external_url}
                                        onChange={(e) => setFormData({ ...formData, external_url: e.target.value })}
                                        placeholder="https://auteco.com.co/..."
                                    />
                                </div>
                                <div>
                                    <label className="text-xs text-blue-300">Año Modelo</label>
                                    <input
                                        type="number"
                                        className="w-full bg-gray-900 border border-blue-900/50 rounded-lg p-2.5 text-white"
                                        value={formData.year}
                                        onChange={(e) => setFormData({ ...formData, year: Number(e.target.value) })}
                                    />
                                </div>
                            </div>
                        )}

                        {/* SI ES REPUESTO */}
                        {formData.category === 'repuestos' && (
                            <div className="bg-emerald-900/10 p-4 rounded-xl border border-emerald-800/30 grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-xs text-emerald-300">Precio</label>
                                    <input
                                        type="number"
                                        className="w-full bg-gray-900 border border-emerald-900/50 rounded-lg p-2.5 text-white"
                                        value={formData.price}
                                        onChange={(e) => setFormData({ ...formData, price: Number(e.target.value) })}
                                    />
                                </div>
                                <div>
                                    <label className="text-xs text-emerald-300">Stock</label>
                                    <input
                                        type="number"
                                        className="w-full bg-gray-900 border border-emerald-900/50 rounded-lg p-2.5 text-white"
                                        value={formData.stock}
                                        onChange={(e) => setFormData({ ...formData, stock: Number(e.target.value) })}
                                    />
                                </div>
                            </div>
                        )}

                        {/* BONOS */}
                        <div className="bg-purple-900/10 p-4 rounded-xl border border-purple-800/30 space-y-4">
                            <div className="flex items-center gap-2 mb-1">
                                <span className="text-purple-400">🎁</span>
                                <span className="text-xs font-bold text-purple-300">Configuración de Bonos</span>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-xs text-gray-400">Monto Bono ($)</label>
                                    <input
                                        type="number"
                                        className="w-full bg-gray-900 border border-purple-900/50 rounded-lg p-2.5 text-white"
                                        value={formData.bonusAmount}
                                        onChange={(e) => setFormData({ ...formData, bonusAmount: Number(e.target.value) })}
                                    />
                                </div>
                                <div>
                                    <label className="text-xs text-gray-400">Válido Hasta</label>
                                    <input
                                        type="date"
                                        className="w-full bg-gray-900 border border-purple-900/50 rounded-lg p-2.5 text-white"
                                        value={formData.bonusEndDate}
                                        onChange={(e) => setFormData({ ...formData, bonusEndDate: e.target.value })}
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* ACCIONES */}
                <div className="flex justify-between items-center mt-8 pt-6 border-t border-gray-800">
                    <button
                        onClick={handleDelete}
                        className="text-red-400 hover:text-red-300 text-sm font-medium hover:underline px-2"
                    >
                        🗑 Eliminar item
                    </button>

                    <div className="flex gap-4">
                        <button onClick={onClose} className="px-5 py-2.5 text-gray-400 hover:text-white transition-colors">Cancelar</button>
                        <button
                            onClick={handleSave}
                            disabled={loading}
                            className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-bold shadow-lg shadow-blue-600/20 transition-all hover:scale-105 disabled:opacity-50 disabled:scale-100"
                        >
                            {loading ? 'Guardando...' : 'Guardar Cambios'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
