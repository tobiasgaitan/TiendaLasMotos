import { useState, useEffect } from 'react';
import { collection, onSnapshot, query } from 'firebase/firestore';
import { db } from '@/lib/firebase';

/**
 * Interface representing a Product in the inventory.
 * 
 * @property {string} id - Unique identifier for the product (Firestore Document ID).
 * @property {string} brand - Manufacturer of the vehicle.
 * @property {string} model - Model name of the vehicle.
 * @property {number} price - Current listing price.
 * @property {string} status - Availability status (e.g., 'Activo', 'Inactivo').
 * @property {string} [imageUrl] - URL for the product image. Normalized from string or object source.
 * @property {string} [external_url] - Direct link to the source if available (Bot populated).
 */
export interface Product {
    id: string;
    brand: string;
    model: string;
    price: number;
    status: 'Activo' | 'Inactivo';
    // Standardized Image Field
    imagen_url?: string;
    external_url?: string;
    // New fields for Extended Management
    category?: string;
    categories?: string[];
    seoDescription?: string;
    isVisible?: boolean;
    bonusAmount?: number;
    bonusEndDate?: string;
    year?: number;
    stock?: number;
    referencia?: string;
    displacement?: number;
    frenosABS?: boolean;
    promotionalPrice?: number;
    description?: string;
    exemptRegistration?: boolean;
}

/**
 * Hook to subscribe to real-time inventory updates from Firestore.
 * 
 * Target Collection: `pagina/catalogo/items`
 * 
 * Purpose:
 * Connects the frontend to the live data stream populated by the separate Bot service.
 * Uses `onSnapshot` for real-time updates to reflect price and status changes immediately.
 * 
 * Security:
 * - Read-only access to public inventory data.
 * - Input sanitization via type casting (e.g., `Number()` for price).
 * - Fail-safe mapping creates defensive fallbacks against schema variations (e.g., 'price' vs 'precio').
 * 
 * @returns {Object} An object containing:
 * - products: Array of mapped Product objects.
 * - loading: Boolean indicating connection status.
 * - error: String error message if connection fails.
 */
export function useInventory() {
    const [products, setProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        // 1. Apuntar a la colección REAL del Bot
        // Security: Using the configured db instance ensures auth context is respected if rules require it.
        const inventoryRef = collection(db, "pagina", "catalogo", "items");
        const q = query(inventoryRef);

        console.log("🔌 Conectando a Firestore: pagina/catalogo/items...");
        const unsubscribe = onSnapshot(q,
            (snapshot) => {
                const productsData = snapshot.docs.map(doc => {
                    const data = doc.data();

                    /**
                     * POLYMORPHIC EXTRACTOR V27.15
                     * Safely extracts a URL string from mixed data types (String | Object).
                     */
                    const extractUrl = (value: any): string | null => {
                        if (!value) return null;
                        if (typeof value === 'string') return value;
                        if (typeof value === 'object') {
                            return value.url || value.secure_url || null; // Handle standard 'url' or Cloudinary 'secure_url'
                        }
                        return null;
                    };

                    // 2. Mapeo Inteligente (Defensa contra nombres distintos)
                    // Maintainability: This mapping layer decouples the frontend interface from DB schema variations.
                    return {
                        id: doc.id,
                        // Busca 'brand' O 'marca', si no, pone 'Genérico'
                        brand: data.brand || data.marca || 'Genérico',
                        // Busca 'model' O 'nombre', si no, usa el ID
                        model: data.model || data.nombre || doc.id,
                        // Busca 'price' O 'precio', asegúrate de que sea número to prevent NaN in UI
                        price: Number(data.price || data.precio || 0),
                        // Estado por defecto
                        status: data.status || 'Activo',
                        // ESTÁNDAR: imagen_url (Normalización Agresiva V27.15 via Extractor)
                        imagen_url: extractUrl(data.imagen_url) ||
                            extractUrl(data.imagenUrl) ||
                            extractUrl(data.imagen) ||
                            extractUrl(data.foto) ||
                            '',
                        // Link del bot
                        external_url: data.external_url,

                        // Extended Fields
                        category: data.category || 'motos',
                        categories: data.categories || (data.category ? [data.category] : []), // Map from DB or fallback
                        seoDescription: data.seoDescription || '',
                        isVisible: data.isVisible !== undefined ? data.isVisible : true,
                        bonusAmount: Number(data.bonusAmount || 0),
                        bonusEndDate: data.bonusEndDate || '',
                        year: Number(data.year || new Date().getFullYear()),
                        stock: Number(data.stock || 0),
                        referencia: data.referencia || data.model || '',
                        displacement: Number(data.displacement || 0),
                        frenosABS: data.frenosABS || false,
                        promotionalPrice: Number(data.promotionalPrice || 0),
                        description: data.description || '',
                        exemptRegistration: data.exemptRegistration === true || data.exentoMatricula === true
                    };
                }) as Product[];

                console.log(`✅ Inventario sincronizado: ${productsData.length} motos encontradas.`);
                setProducts(productsData);
                setLoading(false);
            },
            (err) => {
                console.error("🚨 Error de conexión:", err);
                setError("No se pudo conectar con el catálogo del Bot.");
                setLoading(false);
            }
        );
        return () => unsubscribe();
    }, []);

    return { products, loading, error };
}
