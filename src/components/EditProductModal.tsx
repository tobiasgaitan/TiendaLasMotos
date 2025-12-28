'use client';

import { useState, useEffect } from 'react';
import { doc, updateDoc, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Product } from '@/lib/hooks/useInventory';
import ImageUploader from './ImageUploader';

interface Props {
    product: Product | null; // Product is now optional
    isOpen: boolean;
    onClose: () => void;
}

/**
 * EditProductModal (Versión Híbrida Estable - Universal)
 * - Soporta EDICIÓN (con product) y CREACIÓN (product = null).
 * - Estilos: Usa Inline Styles para garantizar visibilidad (z-index forzado).
 * - Lógica: Usa useEffect para inicializar datos o limpiar para "Crear".
 */
export default function EditProductModal({ product, isOpen, onClose }: Props) {
    const [loading, setLoading] = useState(false);

    // Estado del formulario
    const [formData, setFormData] = useState({
        category: 'motos',
        brand: '',
        model: '',
        seoDescription: '',
        isVisible: true,
        imageUrl: '',
        bonusAmount: 0,
        bonusEndDate: '',
        year: new Date().getFullYear(),
        external_url: '',
        price: 0,
        stock: 0,
    });

    // 1. LÓGICA CRÍTICA DE INICIALIZACIÓN
    useEffect(() => {
        if (isOpen) {
            if (product) {
                // MODO EDICIÓN: Cargar datos existentes
                setFormData({
                    category: product.category || 'motos',
                    brand: product.brand || '',
                    model: product.model || '',
                    seoDescription: product.seoDescription || '',
                    isVisible: product.isVisible !== undefined ? product.isVisible : true,
                    imageUrl: product.imageUrl || '',
                    bonusAmount: product.bonusAmount || 0,
                    bonusEndDate: product.bonusEndDate || '',
                    year: product.year || new Date().getFullYear(),
                    external_url: product.external_url || '',
                    price: product.price || 0,
                    stock: product.stock || 0,
                });
            } else {
                // MODO CREACIÓN: Limpiar formulario
                setFormData({
                    category: 'motos',
                    brand: '',
                    model: '',
                    seoDescription: '',
                    isVisible: true,
                    imageUrl: '',
                    bonusAmount: 0,
                    bonusEndDate: '',
                    year: new Date().getFullYear(),
                    external_url: '',
                    price: 0,
                    stock: 0,
                });
            }
            // Bloqueamos scroll trasero
            document.body.style.overflow = 'hidden';
        }
        return () => { document.body.style.overflow = 'unset'; };
    }, [isOpen, product]);

    const handleDelete = async () => {
        if (!product) return; // Validación extra
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

    /**
     * Genera un Slug (ID) único y SEO-friendly basado en el modelo.
     * 
     * @param modelName - El nombre del modelo ingresado (ej: "Duke 200 NG")
     * @returns string - ID normalizado (ej: "duke_200_ng")
     * 
     * Seguridad: Limpia caracteres especiales para asegurar compatibilidad con URLs.
     */
    const generateId = (modelName: string) => {
        return modelName
            .toLowerCase()
            .trim()
            .replace(/ /g, '_')
            .replace(/[^\w-]+/g, '');
    };

    /**
     * Guarda los cambios (CREAR o EDITAR) en Firestore.
     */
    const handleSave = async () => {
        setLoading(true);
        try {
            // LIMPIEZA AGRESIVA: Precio
            const precioLimpio = Number(formData.price.toString().replace(/[^0-9]/g, ''));

            // Definimos el objeto base con los nombres de campo ESPAÑOL (Legacy)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const dataToSave: any = {
                category: formData.category,
                brand: formData.brand,
                model: formData.model,
                seoDescription: formData.seoDescription,
                isVisible: formData.isVisible,
                // Mapeo Crítico: price -> precio
                precio: precioLimpio,
                stock: Number(formData.stock),
                bonusAmount: Number(formData.bonusAmount),
                bonusEndDate: formData.bonusEndDate,
                // Garantizar consistencia de Referencia
                referencia: formData.model,
                // Fecha de actualización para ordenar (si la DB lo usa)
                fechaActualizacion: new Date().toISOString()
            };

            // Lógica Condicional para Imagen:
            if (product) {
                // MODO EDICIÓN: Solo actualizar imagen si cambió
                if (formData.imageUrl !== product.imageUrl) {
                    dataToSave.imagenUrl = formData.imageUrl;
                }
            } else {
                // MODO CREACIÓN: Siempre enviar imagen
                dataToSave.imagenUrl = formData.imageUrl;
            }

            // Campos específicos de Motos
            if (formData.category === 'motos') {
                dataToSave.year = Number(formData.year);
                dataToSave.external_url = formData.external_url;
            }

            if (product) {
                // --- MODO EDICIÓN (UPDATE) ---
                const ref = doc(db, "pagina", "catalogo", "items", product.id);
                await updateDoc(ref, dataToSave);
            } else {
                // --- MODO CREACIÓN (SET) ---
                // 1. Generar ID Automático
                if (!formData.model) throw new Error("Debes ingresar un Modelo para generar el ID.");
                const newId = generateId(formData.model);

                // 2. Agregar campos por defecto de Creación
                dataToSave.fechaCreacion = new Date().toISOString();
                // Asegurar que nombre y marca (Legacy) también existan para compatibilidad máxima
                dataToSave.nombre = formData.model;
                dataToSave.referencia = formData.model; // ADDED: Critical for legacy compatibility
                dataToSave.marca = formData.brand;
                dataToSave.status = 'Activo';

                const ref = doc(db, "pagina", "catalogo", "items", newId);
                // Usamos setDoc para crear con ID personalizado
                await setDoc(ref, dataToSave);
            }

            onClose();
        } catch (e: any) {
            console.error("Error guardando:", e);
            alert("Error al guardar: " + (e.message || "Intenta nuevamente."));
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    const isEditing = !!product;

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            zIndex: 99999, // Forzamos capa superior
            backgroundColor: 'rgba(0,0,0,0.85)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '1rem'
        }}>
            {/* Click afuera para cerrar */}
            <div style={{ position: 'absolute', inset: 0 }} onClick={onClose} />

            {/* Ventana Modal */}
            <div
                style={{
                    backgroundColor: '#111827', // Gris oscuro (bg-gray-900)
                    color: '#ffffff',
                    border: '1px solid #374151',
                    borderRadius: '12px',
                    width: '100%', maxWidth: '800px',
                    maxHeight: '90vh', overflowY: 'auto',
                    position: 'relative',
                    zIndex: 100000,
                    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
                }}
                className="animate-in fade-in zoom-in duration-200"
            >
                {/* Botón Cerrar */}
                <button
                    onClick={onClose}
                    style={{ position: 'absolute', top: '16px', right: '16px', background: 'none', border: 'none', cursor: 'pointer' }}
                    className="text-gray-400 hover:text-white"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>

                <div className="p-6">
                    <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
                        <span className="text-blue-500">{isEditing ? '✎' : '+'}</span>
                        {isEditing ? `Editar: ${product.model}` : 'Agregar Nueva Moto'}
                    </h2>

                    {/* FORMULARIO */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        {/* IZQUIERDA */}
                        <div className="space-y-5">
                            <div className="bg-gray-800/50 p-4 rounded-lg border border-gray-700">
                                <label className="text-sm font-medium text-gray-300 mb-2 block">Imagen Principal</label>
                                {/* COMPONENTE DE IMAGEN CON DATOS CONECTADOS */}
                                <ImageUploader
                                    currentImage={formData.imageUrl}
                                    onImageUploaded={(url) => setFormData(prev => ({ ...prev, imageUrl: url }))}
                                />
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
                            <div className="flex items-center justify-between bg-gray-800 p-3 rounded-lg border border-gray-700">
                                <span className="text-sm text-gray-300">¿Visible en Web?</span>
                                <input type="checkbox" checked={formData.isVisible} onChange={(e) => setFormData({ ...formData, isVisible: e.target.checked })} className="w-5 h-5 accent-green-500" />
                            </div>
                        </div>

                        {/* DERECHA */}
                        <div className="space-y-5">
                            <div><label className="text-xs text-blue-300 block mb-1">Precio Compra</label><input type="number" className="w-full bg-gray-900 border border-blue-900/50 rounded-lg p-2.5 text-white" value={formData.price} onChange={(e) => setFormData({ ...formData, price: Number(e.target.value) })} /></div>
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
                            <button onClick={handleDelete} className="text-red-400 text-sm hover:underline">Eliminar</button>
                        ) : (
                            <div></div> // Spacer
                        )}

                        <div className="flex gap-4">
                            <button onClick={onClose} className="px-5 py-2.5 text-gray-400 hover:text-white">Cancelar</button>
                            <button
                                onClick={handleSave}
                                disabled={loading}
                                style={{ backgroundColor: '#2563eb', color: 'white' }}
                                className="px-6 py-2.5 rounded-lg font-bold hover:brightness-110"
                            >
                                {loading ? 'Guardando...' : (isEditing ? 'Guardar Cambios' : 'Crear Producto')}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}