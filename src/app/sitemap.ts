export const dynamic = 'force-dynamic'; // ⚡ URGENT: Fix for Cloud Build (No creds at build time)

import { MetadataRoute } from 'next';

// 🛑 REMOVED TOP-LEVEL IMPORT to prevent build-time initialization
// import { db } from '@/lib/firebase-admin';

/**
 * Sitemap dinámico para TiendaLasMotos.
 *
 * ⚡ PERFORMANCE & SAFETY:
 * - force-dynamic: Ensures execution ONLY at runtime, never during build.
 * - Dynamic Import: Loads firebase-admin ONLY when function runs.
 * - Fail-Safe: Static routes are defined outside the try/catch and returned on ANY error.
 * - Limit 50: Strict limit to prevent timeouts.
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
    // 1. Log start to verify function execution in logs
    console.log('🗺️ Sitemap generation started. Initializing static routes.');

    // 2. Define payload with static routes initially
    const fullSitemap: MetadataRoute.Sitemap = [...STATIC_ROUTES];

    try {
        // ⚡ DYNAMIC IMPORT: Load DB only at runtime to avoid build crashes
        console.log('🔄 Loading Firebase Admin dynamically...');
        const { db } = await import('@/lib/firebase-admin');

        // 3. Dynamic Data Fetching with strict error isolation
        console.log('🔌 Connecting to Firestore for dynamic routes...');

        const snapshot = await db.collection('pagina/catalogo/items')
            .orderBy('updated_at', 'desc')
            .limit(50)
            .select('slug', 'updated_at', 'categories', 'category', 'categoria')
            .get();

        if (snapshot.empty) {
            console.warn('⚠️ Sitemap query returned 0 documents.');
        } else {
            console.log(`✅ Fetched ${snapshot.size} items from Firestore.`);
        }

        snapshot.forEach((doc) => {
            const data = doc.data();

            // Robust Slug
            const slug = data.slug || doc.id;

            // Robust Category
            let category = 'general';
            if (Array.isArray(data.categories) && data.categories.length > 0) {
                category = data.categories[0];
            } else if (data.category && typeof data.category === 'string') {
                category = data.category;
            } else if (data.categoria && typeof data.categoria === 'string') {
                category = data.categoria;
            }
            const categorySlug = category.toLowerCase().replace(/\s+/g, '-');

            // Robust Date
            let lastModified = new Date();
            if (data.updated_at) {
                if (typeof data.updated_at.toDate === 'function') {
                    lastModified = data.updated_at.toDate();
                } else {
                    const parsedDate = new Date(data.updated_at);
                    if (!isNaN(parsedDate.getTime())) {
                        lastModified = parsedDate;
                    }
                }
            }

            fullSitemap.push({
                url: `${BASE_URL}/${categorySlug}/${slug}`,
                lastModified: lastModified,
                changeFrequency: 'weekly',
                priority: 0.8,
            });
        });

        console.log(`✅ Sitemap generation completed. Total URLs: ${fullSitemap.length}`);
        return fullSitemap;

    } catch (error) {
        // 4. CATASTROPHIC FAILURE HANDLER
        // If ANYTHING fails (DB Auth, Network, Parsing), log it and return static routes only.
        console.error('🚨 SITEMAP_FETCH_ERROR: Critical failure in dynamic sitemap generation.');
        if (error instanceof Error) {
            console.error(error.message);
            console.error(error.stack);
        } else {
            console.error(error);
        }

        // IMPORTANT: Return static routes to avoid 500 Internal Server Error
        console.log('⚠️ Returning static routes ONLY to prevent build failure.');
        return STATIC_ROUTES;
    }
}
