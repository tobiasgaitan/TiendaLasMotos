import { useState, useEffect } from 'react';
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
 * Modal to edit or delete a product from the inventory.
 * Uses a fixed position overlay with high z-index instead of React Portal 
 * to avoid hydration mismatches with browser extensions.
 */
export default function EditProductModal({ product, isOpen, onClose }: Props) {
    const [loading, setLoading] = useState(false);

    // Inicializar estado con datos del producto
    const [formData, setFormData] = useState({
        category: product.category || 'motos',
        brand: product.brand,
        model: product.model,
        seoDescription: product.seoDescription || '',
        isVisible: product.isVisible !== undefined ? product.isVisible : true,
        imageUrl: product.imageUrl || '',
        bonusAmount: product.bonusAmount || 0,
        bonusEndDate: product.bonusEndDate || '',
        year: product.year || new Date().getFullYear(),
        external_url: product.external_url || '',
        price: product.price,
        stock: product.stock || 0,
    });

    // Bloquear scroll al abrir
    useEffect(() => {
        if (isOpen) document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = 'unset';
        };
    }, [isOpen]);

    const handleDelete = async () => {
        if (!confirm(`¿Eliminar "${product.model}" permanentemente?`)) return;
        setLoading(true);
        try {
            await deleteDoc(doc(db, "pagina", "catalogo", "items", product.id));
            onClose();
        } catch (e) {
            console.error(e);
            alert("Error al eliminar");
        } finally {
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
            } else {
                dataToSave.price = Number(formData.price);
                dataToSave.stock = Number(formData.stock);
            }
            await updateDoc(ref, dataToSave);
            onClose();
        } catch (e) {
            console.error("Error guardando:", e);
            alert("Error al guardar cambios.");
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4">
            <div
                className="absolute inset-0 bg-black/80 backdrop-blur-sm"
                onClick={onClose}
            />

            <div className="relative bg-gray-900 border border-gray-700 rounded-xl w-full max-w-3xl p-6 shadow-2xl overflow-y-auto max-h-[90vh]">
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 text-gray-500 hover:text-white text-xl z-10"
                >
                    ✕
                </button>

                <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-2">
                    <span className="text-blue-500">✎</span> Editar: {product.model}
                </h2>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    <div className="space-y-5">
                        <div className="bg-gray-800/30 p-2 rounded-lg border border-gray-700/50">
                            <ImageUploader
                                currentImage={formData.imageUrl}
                                onImageUploaded={(url) => setFormData(prev => ({ ...prev, imageUrl: url }))}
                            />
                        </div>
                        <div>
                            <label className="text-xs text-gray-500">Marca</label>
                            <input
                                className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2.5 text-white"
                                value={formData.brand}
                                onChange={(e) => setFormData({ ...formData, brand: e.target.value })}
                            />
                        </div>
                        <div>
                            <label className="text-xs text-gray-500">Modelo</label>
                            <input
                                className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2.5 text-white"
                                value={formData.model}
                                onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                            />
                        </div>
                        <div className="flex items-center justify-between bg-gray-800 p-3 rounded-lg border border-gray-700">
                            <span className="text-sm text-gray-300">¿Visible?</span>
                            <input
                                type="checkbox"
                                checked={formData.isVisible}
                                onChange={(e) => setFormData({ ...formData, isVisible: e.target.checked })}
                                className="w-5 h-5 accent-green-500"
                            />
                        </div>
                    </div>

                    <div className="space-y-5">
                        <div>
                            <label className="text-xs text-blue-300">Precio</label>
                            <input
                                type="number"
                                className="w-full bg-gray-900 border border-blue-900/50 rounded-lg p-2.5 text-white"
                                value={formData.price}
                                onChange={(e) => setFormData({ ...formData, price: Number(e.target.value) })}
                            />
                        </div>
                        <div>
                            <label className="text-xs text-blue-300">Año</label>
                            <input
                                type="number"
                                className="w-full bg-gray-900 border border-blue-900/50 rounded-lg p-2.5 text-white"
                                value={formData.year}
                                onChange={(e) => setFormData({ ...formData, year: Number(e.target.value) })}
                            />
                        </div>
                        <div className="bg-purple-900/10 p-4 rounded-xl border border-purple-800/30 space-y-4">
                            <h4 className="text-xs font-bold text-purple-300">Bonos</h4>
                            <div className="grid grid-cols-2 gap-4">
                                <input
                                    type="number"
                                    placeholder="Monto"
                                    className="bg-gray-900 p-2 rounded text-white text-sm"
                                    value={formData.bonusAmount}
                                    onChange={(e) => setFormData({ ...formData, bonusAmount: Number(e.target.value) })}
                                />
                                <input
                                    type="date"
                                    className="bg-gray-900 p-2 rounded text-white text-sm"
                                    value={formData.bonusEndDate}
                                    onChange={(e) => setFormData({ ...formData, bonusEndDate: e.target.value })}
                                />
                            </div>
                        </div>
                    </div>
                </div>

                <div className="flex justify-between items-center mt-8 pt-6 border-t border-gray-800">
                    <button onClick={handleDelete} className="text-red-400 text-sm hover:underline">Eliminar</button>
                    <div className="flex gap-4">
                        <button onClick={onClose} className="px-5 py-2.5 text-gray-400 hover:text-white">Cancelar</button>
                        <button onClick={handleSave} disabled={loading} className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-bold">
                            {loading ? 'Guardando...' : 'Guardar'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
