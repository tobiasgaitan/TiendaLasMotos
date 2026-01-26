'use client';

import { useState, useEffect } from 'react';
import { doc, updateDoc, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Product } from '@/lib/hooks/useInventory';
import ImageUploader from './ImageUploader';
import ModalWrapper from './admin/ModalWrapper';
import { Loader2 } from 'lucide-react';
import { CATEGORIES_OFFICIAL } from '@/lib/constants';

// CONSTANTS (Imported)

interface Props {
    product: Product | null;
    isOpen: boolean;
    onClose: () => void;
}

/**
 * EditProductModal (Versión Refactorizada - DRY)
 * - Implementa Wrapper Unificado (ModalWrapper).
 */
export default function EditProductModal({ product, isOpen, onClose }: Props) {
    const [isSaving, setIsSaving] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);

    // Estado del formulario
    const [formData, setFormData] = useState({
        categories: [] as string[], // Changed from single category
        category: '', // Legacy/Primary
        brand: '',
        model: '',
        seoDescription: '',
        isVisible: true,
        imagen_url: '',
        bonusAmount: 0,
        bonusEndDate: '',
        year: new Date().getFullYear(),
        external_url: '',
        price: '', // Changed to string for input
        stock: 0,
        referencia: '', // Added
        promotionalPrice: '', // Added
        displacement: '', // Added
        description: '', // Added
        frenosABS: false, // Added
        exemptRegistration: false // [NEW]
    });

    // 1. LÓGICA CRÍTICA DE INICIALIZACIÓN
    useEffect(() => {
        if (isOpen) {
            if (product) {
                // MODO EDICIÓN: Cargar datos existentes
                setFormData({
                    categories: product.categories || (product.category ? [product.category] : []),
                    category: product.category || '',
                    brand: product.brand || '',
                    model: product.model || '',
                    seoDescription: product.seoDescription || '',
                    isVisible: product.isVisible !== undefined ? product.isVisible : true,
                    imagen_url: product.imagen_url || (product as any).imagenUrl || (product as any).imagen || (product as any).foto || '',
                    bonusAmount: product.bonusAmount || 0,
                    bonusEndDate: product.bonusEndDate || '',
                    year: product.year || new Date().getFullYear(),
                    external_url: product.external_url || '',
                    price: product.price?.toString() || '', // Convert to string
                    stock: product.stock || 0,
                    referencia: product.referencia || '',
                    promotionalPrice: product.promotionalPrice?.toString() || '',
                    displacement: product.displacement?.toString() || '',
                    description: product.description || '',
                    frenosABS: product.frenosABS || false,
                    exemptRegistration: product.exemptRegistration || false
                });
            } else {
                // MODO CREACIÓN: Limpiar formulario
                setFormData({
                    categories: [],
                    category: '',
                    brand: '',
                    model: '',
                    seoDescription: '',
                    isVisible: true,
                    imagen_url: '',
                    bonusAmount: 0,
                    bonusEndDate: '',
                    year: new Date().getFullYear(),
                    external_url: '',
                    price: '',
                    stock: 0,
                    referencia: '',
                    promotionalPrice: '',
                    displacement: '',
                    description: '',
                    frenosABS: false,
                    exemptRegistration: false
                });
            }
        }
    }, [isOpen, product]);

    const handleDelete = async () => {
        if (!product) return; // Validación extra
        if (!confirm(`¿Eliminar "${product.model}" permanentemente?`)) return;
        setIsDeleting(true);
        try {
            await deleteDoc(doc(db, "pagina", "catalogo", "items", product.id));
            onClose();
        } catch (e) {
            console.error(e);
            alert("Error al eliminar");
        } finally {
            setIsDeleting(false);
        }
    };

    /**
     * Genera un Slug (ID) único y SEO-friendly basado en el modelo.
     */
    const generateId = (modelName: string) => {
        return modelName
            .toLowerCase()
            .trim()
            .replace(/ /g, '_')
            .replace(/[^\w-]+/g, '');
    };

    const toggleCategory = (cat: string) => {
        setFormData(prev => {
            const exists = prev.categories.includes(cat);
            const newCats = exists
                ? prev.categories.filter(c => c !== cat)
                : [...prev.categories, cat];

            return {
                ...prev,
                categories: newCats,
                category: newCats[0] || '' // Sync legacy field to first selection
            };
        });
    };

    /**
     * Guarda los cambios (CREAR o EDITAR) en Firestore.
     * 
     * @remarks V23.1 Schema Enforcement:
     * - Uppercases `marca` and `modelo` for consistency
     * - Uses `imagen_url` as single source of truth
     * - Ensures `referencia` matches uppercased `modelo`
     */
    const handleSave = async () => {
        setIsSaving(true);
        try {
            // LIMPIEZA AGRESIVA: Precio
            const precioLimpio = Number(formData.price.toString().replace(/[^0-9]/g, ''));

            // ✅ V23.1 UPPERCASE ENFORCEMENT
            const marcaUppercase = formData.brand.toUpperCase().trim();
            const modeloUppercase = formData.model.toUpperCase().trim();

            const dataToSave: any = {
                categories: formData.categories,
                category: formData.categories[0] || '', // Legacy Support
                brand: marcaUppercase,  // ✅ V23.1 Normalized
                model: modeloUppercase, // ✅ V23.1 Normalized
                marca: marcaUppercase,  // ✅ Explicit field for compatibility
                modelo: modeloUppercase, // ✅ Explicit field for compatibility
                seoDescription: formData.seoDescription,
                isVisible: formData.isVisible,
                price: precioLimpio, // precio en DB
                precio: precioLimpio, // LEGACY
                stock: Number(formData.stock),
                bonusAmount: Number(formData.bonusAmount),
                bonusEndDate: formData.bonusEndDate,
                referencia: modeloUppercase, // ✅ V23.1 Normalized (was formData.model)
                fechaActualizacion: new Date().toISOString(),
                exemptRegistration: formData.exemptRegistration // [NEW] Save Persistent Flag
            };

            // Lógica Condicional para Imagen:
            if (product) {
                if (formData.imagen_url !== product.imagen_url) {
                    dataToSave.imagen_url = formData.imagen_url;
                }
            } else {
                dataToSave.imagen_url = formData.imagen_url;
            }

            // Campos específicos de Motos (Legacy check, now almost all are 'motos' in broad sense but have specific category)
            // Ideally we save 'year' and 'external_url' for all categories.
            dataToSave.year = Number(formData.year);
            dataToSave.external_url = formData.external_url;

            if (product) {
                // --- UPDATE ---
                const ref = doc(db, "pagina", "catalogo", "items", product.id);
                await updateDoc(ref, dataToSave);
            } else {
                // --- CREATE ---
                if (!formData.model) throw new Error("Debes ingresar un Modelo para generar el ID.");
                const newId = generateId(formData.model);

                dataToSave.fechaCreacion = new Date().toISOString();
                dataToSave.nombre = modeloUppercase; // ✅ V23.1 Normalized
                dataToSave.referencia = modeloUppercase; // ✅ Already set above, but explicit here
                dataToSave.marca = marcaUppercase; // ✅ Already set above, but explicit here
                dataToSave.status = 'Activo';

                const ref = doc(db, "pagina", "catalogo", "items", newId);
                await setDoc(ref, dataToSave);
            }

            onClose();
        } catch (e: any) {
            console.error("Error guardando:", e);
            alert("Error al guardar: " + (e.message || "Intenta nuevamente."));
        } finally {
            setIsSaving(false);
        }
    };

    const isEditing = !!product;

    const modalTitle = (
        <div className="flex items-center gap-2">
            <span className="text-blue-500">{isEditing ? '✎' : '+'}</span>
            <span>{isEditing ? `Editar: ${product.model}` : 'Agregar Nueva Moto'}</span>
        </div>
    );

    const isLoading = isSaving || isDeleting;

    return (
        <ModalWrapper isOpen={isOpen} onClose={onClose} title={modalTitle}>
            <div className="pt-2"> {/* Pequeño ajuste spacing interno */}

                {/* FORMULARIO */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* IZQUIERDA */}
                    <div className="space-y-5">
                        <div className="bg-gray-800/50 p-4 rounded-lg border border-gray-700">
                            <label className="text-sm font-medium text-gray-300 mb-2 block">Imagen Principal</label>
                            <ImageUploader
                                currentImage={formData.imagen_url}
                                onImageUploaded={(url) => setFormData(prev => ({ ...prev, imagen_url: url }))}
                            />
                        </div>

                        <div>
                            <label className="text-xs text-gray-500 block mb-1">Categoría*</label>
                            <label className="text-xs text-gray-500 block mb-1">Categorías</label>
                            <div className="grid grid-cols-2 gap-2 mb-4">
                                {CATEGORIES_OFFICIAL.map(cat => (
                                    <button
                                        key={cat}
                                        type="button"
                                        onClick={() => toggleCategory(cat)}
                                        className={`text-[10px] px-2 py-2 rounded-md border transition-colors ${formData.categories.includes(cat)
                                            ? 'bg-blue-600 text-white border-blue-600'
                                            : 'bg-gray-800 text-gray-400 border-gray-700 hover:border-gray-500'
                                            }`}
                                    >
                                        {cat}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div>
                            <label className="text-xs text-gray-500 block mb-1">Marca*</label>
                            <input className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2.5 text-white"
                                value={formData.brand}
                                onChange={(e) => setFormData({ ...formData, brand: e.target.value })}
                                placeholder="Ej: KTM"
                            />
                        </div>
                        <div>
                            <label className="text-xs text-gray-500 block mb-1">Modelo* (Generará ID)</label>
                            <input className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2.5 text-white"
                                value={formData.model}
                                onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                                placeholder="Ej: Duke 200"
                            />
                        </div>
                        <div>
                            <label className="text-xs text-blue-300 block mb-1">URL de Referencia (Auteco)</label>
                            <input className="w-full bg-gray-900 border border-blue-900/50 rounded-lg p-2.5 text-white text-sm"
                                value={formData.external_url}
                                onChange={(e) => setFormData({ ...formData, external_url: e.target.value })}
                                placeholder="https://www.auteco.com.co/moto..."
                            />
                            <p className="text-[10px] text-gray-400 mt-1"> *Necesario para sincronización de precios.</p>
                        </div>
                        <div className="flex gap-4">
                            <div className="flex items-center justify-between bg-gray-800 p-3 rounded-lg border border-gray-700 flex-1">
                                <span className="text-sm text-gray-300">¿Visible en Web?</span>
                                <input type="checkbox" checked={formData.isVisible} onChange={(e) => setFormData({ ...formData, isVisible: e.target.checked })} className="w-5 h-5 accent-green-500" />
                            </div>
                            {/* [NEW] Permanent Exemption Checkbox */}
                            <div className="flex items-center justify-between bg-blue-900/20 p-3 rounded-lg border border-blue-800 flex-1">
                                <span className="text-sm text-blue-200 font-bold">Exenta Matrícula</span>
                                <input
                                    type="checkbox"
                                    checked={formData.exemptRegistration}
                                    onChange={(e) => setFormData({ ...formData, exemptRegistration: e.target.checked })}
                                    className="w-5 h-5 accent-blue-500"
                                />
                            </div>
                        </div>
                    </div>

                    {/* DERECHA */}
                    <div className="space-y-5">
                        <div><label className="text-xs text-blue-300 block mb-1">Precio Compra</label><input type="number" className="w-full bg-gray-900 border border-blue-900/50 rounded-lg p-2.5 text-white" value={formData.price} onChange={(e) => setFormData({ ...formData, price: e.target.value })} /></div>
                        <div><label className="text-xs text-blue-300 block mb-1">Año</label><input type="number" className="w-full bg-gray-900 border border-blue-900/50 rounded-lg p-2.5 text-white" value={formData.year} onChange={(e) => setFormData({ ...formData, year: Number(e.target.value) })} /></div>
                        <div><label className="text-xs text-gray-500 block mb-1">Stock Disponible</label><input type="number" className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2.5 text-white" value={formData.stock} onChange={(e) => setFormData({ ...formData, stock: Number(e.target.value) })} /></div>

                        <div className="bg-purple-900/10 p-4 rounded-xl border border-purple-800/30 space-y-4">
                            <h4 className="text-xs font-bold text-purple-300">Bonos</h4>
                            <div className="grid grid-cols-2 gap-4">
                                <input type="number" placeholder="Monto" className="w-full bg-gray-900 p-2 rounded text-white text-sm" value={formData.bonusAmount} onChange={(e) => setFormData({ ...formData, bonusAmount: Number(e.target.value) })} />
                                <input type="date" className="w-full bg-gray-900 p-2 rounded text-white text-sm" value={formData.bonusEndDate} onChange={(e) => setFormData({ ...formData, bonusEndDate: e.target.value })} />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="flex justify-between items-center mt-8 pt-6 border-t border-gray-700">
                    {isEditing ? (
                        <button
                            onClick={handleDelete}
                            disabled={isLoading}
                            className="text-red-400 text-sm hover:underline flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isDeleting && <Loader2 className="w-3 h-3 animate-spin" />}
                            {isDeleting ? 'Eliminando...' : 'Eliminar'}
                        </button>
                    ) : (
                        <div></div> // Spacer
                    )}

                    <div className="flex gap-4">
                        <button onClick={onClose} disabled={isLoading} className="px-5 py-2.5 text-gray-400 hover:text-white disabled:opacity-50">Cancelar</button>
                        <button
                            onClick={handleSave}
                            disabled={isLoading}
                            style={{ backgroundColor: '#2563eb', color: 'white' }}
                            className="px-6 py-2.5 rounded-lg font-bold hover:brightness-110 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isSaving ? <Loader2 className="animate-spin w-5 h-5" /> : null}
                            {isSaving ? 'Guardando...' : (isEditing ? 'Guardar Cambios' : 'Crear Producto')}
                        </button>
                    </div>
                </div>
            </div>
        </ModalWrapper>
    );
}