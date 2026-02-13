import { MetadataRoute } from 'next';
import { db } from '@/lib/firebase-admin';

/**
 * Sitemap dinámico para TiendaLasMotos.
 *
 * ⚡ PERFORMANCE OPTIMIZATION:
 * - Limitado a los 50 items más recientes para evitar timeouts en Cloud Build.
 * - Selección de campos específica (slug, updated_at, categories) para reducir carga.
 * - Fallback a rutas estáticas si falla la conexión a Firestore (Fail-Safe).
 */

const BASE_URL = 'https://tiendalasmotos.com';

const STATIC_ROUTES: MetadataRoute.Sitemap = [
    {
        url: BASE_URL,
        lastModified: new Date(),
        changeFrequency: 'daily',
        priority: 1,
    },
    {
        url: `${BASE_URL}/catalogo`,
        lastModified: new Date(),
        changeFrequency: 'weekly',
        priority: 0.9,
    },
    {
        url: `${BASE_URL}/financiacion`,
        lastModified: new Date(),
        changeFrequency: 'monthly',
        priority: 0.8,
    },
    {
        url: `${BASE_URL}/contacto`,
        lastModified: new Date(),
        changeFrequency: 'monthly',
        priority: 0.7,
    },
    {
        url: `${BASE_URL}/admin/prospectos`,
        lastModified: new Date(),
        changeFrequency: 'daily',
        priority: 0.6,
    },
    {
        url: `${BASE_URL}/admin/login`,
        lastModified: new Date(),
        changeFrequency: 'monthly',
        priority: 0.5,
    },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
    // Start with static routes
    const routes: MetadataRoute.Sitemap = [...STATIC_ROUTES];

    // 🛡️ FAIL-SAFE TRY/CATCH BLOCK
    try {
        console.log('🗺️ Generating dynamic sitemap...');

        // Query Optimization: Top 50 most recent items only.
        // limit(50) ensures query finishes < 2s even on slow connections.
        const snapshot = await db.collection('pagina/catalogo/items')
            .orderBy('updated_at', 'desc')
            .limit(50)
            .select('slug', 'updated_at', 'categories', 'category', 'categoria') // Select only needed fields
            .get();

        if (snapshot.empty) {
            console.warn('⚠️ Sitemap query returned 0 documents.');
        }

        snapshot.forEach((doc) => {
            const data = doc.data();

            // 1. ROBUST SLUG HANDLING
            // Fallback to ID if slug is missing
            const slug = data.slug || doc.id;

            // 2. ROBUST CATEGORY HANDLING
            // Priority: categories[0] -> category -> categoria -> 'general'
            let category = 'general';

            if (Array.isArray(data.categories) && data.categories.length > 0) {
                category = data.categories[0];
            } else if (data.category && typeof data.category === 'string') {
                category = data.category;
            } else if (data.categoria && typeof data.categoria === 'string') {
                category = data.categoria;
            }

            // Normalize category slug if needed (basic safety)
            const categorySlug = category.toLowerCase().replace(/\s+/g, '-');

            // 3. DATE HANDLING
            // Fallback to current date if updated_at is missing or invalid
            let lastModified = new Date();
            if (data.updated_at) {
                // Handle Firestore Timestamp or standard Date/string
                // Check for toDate function (Firestore Timestamp)
                if (typeof data.updated_at.toDate === 'function') {
                    lastModified = data.updated_at.toDate();
                } else {
                    // Try parsing string/number
                    const parsedDate = new Date(data.updated_at);
                    if (!isNaN(parsedDate.getTime())) {
                        lastModified = parsedDate;
                    }
                }
            }

            // Add dynamic route
            routes.push({
                url: `${BASE_URL}/${categorySlug}/${slug}`,
                lastModified: lastModified,
                changeFrequency: 'weekly',
                priority: 0.8,
            });
        });

        console.log(`✅ Sitemap generated successfully with ${snapshot.size} dynamic items.`);

    } catch (error) {
        // 🛑 CRITICAL ERROR HANDLING
        // Log the error but DO NOT crash the build. Return static routes only.
        console.error('⚠️ Sitemap generation failed (Firestore Error). Returning static routes only.');
        if (error instanceof Error) {
            console.error(error.message);
        } else {
            console.error(error);
        }
        // No throw - proceed with static routes
    }

    return routes;
}
