import { NextResponse } from 'next/server';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, orderBy, limit, Timestamp } from 'firebase/firestore';

export const dynamic = 'force-dynamic'; // ⚡ FORCE RUNTIME EXECUTION

const BASE_URL = 'https://tiendalasmotos.com';

const STATIC_URLS = [
    { loc: BASE_URL, priority: '1.0', changefreq: 'daily' },
    { loc: `${BASE_URL}/catalogo`, priority: '0.9', changefreq: 'weekly' },
    { loc: `${BASE_URL}/financiacion`, priority: '0.8', changefreq: 'monthly' },
    { loc: `${BASE_URL}/contacto`, priority: '0.7', changefreq: 'monthly' },
    { loc: `${BASE_URL}/admin/prospectos`, priority: '0.6', changefreq: 'daily' },
    { loc: `${BASE_URL}/admin/login`, priority: '0.5', changefreq: 'monthly' },
];

function generateXml(urls: any[]) {
    const urlElements = urls.map(url => `
  <url>
    <loc>${url.loc}</loc>
    <lastmod>${new Date().toISOString()}</lastmod>
    <changefreq>${url.changefreq}</changefreq>
    <priority>${url.priority}</priority>
  </url>`).join('');

    return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urlElements}
</urlset>`;
}

export async function GET() {
    // 🛑 BUILD-TIME CHECK
    if (process.env.NEXT_PHASE === 'phase-production-build') {
        return new NextResponse(null, { status: 204 });
    }

    console.log('🗺️ Generating sitemap.xml via Route Handler (Isolated Client SDK)...');
    let urls = [...STATIC_URLS];

    try {
        // 🔒 ROBUST LOCAL INITIALIZATION
        // Do NOT import from @/lib/firebase to avoid build-time top-level execution errors.
        // Initialize locally only when this function actually runs.

        let db;

        const firebaseConfig = {
            apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
            authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
            projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
            storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
            messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
            appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
            measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
        };

        // Check for minimal config presence to avoid 'invalid config' crash
        if (!firebaseConfig.projectId) {
            console.warn('⚠️ Missing Project ID in env. Using static routes only.');
            throw new Error('Missing Firebase Config');
        }

        const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
        db = getFirestore(app);

        console.log('🔌 Connecting to Firestore (Isolated)...');

        const q = query(
            collection(db, 'pagina/catalogo/items'),
            orderBy('updated_at', 'desc'),
            limit(50)
        );

        const snapshot = await getDocs(q);

        if (!snapshot.empty) {
            console.log(`✅ Fetched ${snapshot.size} items.`);
            snapshot.forEach(doc => {
                const data = doc.data();
                const slug = data.slug || doc.id;

                let category = 'general';
                if (Array.isArray(data.categories) && data.categories.length > 0) category = data.categories[0];
                else if (typeof data.category === 'string') category = data.category;
                else if (typeof data.categoria === 'string') category = data.categoria;

                const categorySlug = category.toLowerCase().replace(/\s+/g, '-');

                let lastModified = new Date();
                if (data.updated_at) {
                    if (data.updated_at instanceof Timestamp) {
                        lastModified = data.updated_at.toDate();
                    } else if (typeof data.updated_at.toDate === 'function') {
                        lastModified = data.updated_at.toDate();
                    } else {
                        const parsedDate = new Date(data.updated_at);
                        if (!isNaN(parsedDate.getTime())) lastModified = parsedDate;
                    }
                }

                urls.push({
                    loc: `${BASE_URL}/${categorySlug}/${slug}`,
                    priority: '0.8',
                    changefreq: 'weekly'
                });
            });
        }

    } catch (error) {
        console.error('🚨 Sitemap generation failed. Returning static XML only.');
        if (error instanceof Error) console.error(error.message);
    }

    const xml = generateXml(urls);

    return new NextResponse(xml, {
        headers: {
            'Content-Type': 'application/xml',
            'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=59',
        },
    });
}
