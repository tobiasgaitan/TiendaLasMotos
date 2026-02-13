import { NextResponse } from 'next/server';

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
    // 🛑 BUILD-TIME CHECK: Return empty response during build to prevent Firebase init
    if (process.env.NEXT_PHASE === 'phase-production-build') {
        return new NextResponse(null, { status: 204 });
    }

    console.log('🗺️ Generating sitemap.xml via Route Handler...');
    let urls = [...STATIC_URLS];

    try {
        console.log('🔄 Loading Firebase Admin dynamically...');
        // ⚡ DYNAMIC IMPORT to strictly avoid build-time init
        const { db } = await import('@/lib/firebase-admin');

        console.log('🔌 Connecting to Firestore...');
        const snapshot = await db.collection('pagina/catalogo/items')
            .orderBy('updated_at', 'desc')
            .limit(50)
            .select('slug', 'updated_at', 'categories', 'category', 'categoria')
            .get();

        if (!snapshot.empty) {
            console.log(`✅ Fetched ${snapshot.size} items.`);
            snapshot.forEach(doc => {
                const data = doc.data();

                // Robust Fallbacks
                const slug = data.slug || doc.id;

                let category = 'general';
                if (Array.isArray(data.categories) && data.categories.length > 0) category = data.categories[0];
                else if (typeof data.category === 'string') category = data.category;
                else if (typeof data.categoria === 'string') category = data.categoria;

                const categorySlug = category.toLowerCase().replace(/\s+/g, '-');

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
        // Fallback to static URLs only
    }

    const xml = generateXml(urls);

    return new NextResponse(xml, {
        headers: {
            'Content-Type': 'application/xml',
            'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=59',
        },
    });
}
