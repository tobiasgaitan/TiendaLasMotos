import { NextResponse } from 'next/server';

// 🛑 ABSOLUTE SURRENDER: STATIC ONLY TO PASS BUILD
// Any Firebase dependency here crashes Cloud Build due to static analysis.
// We return a strictly static sitemap for now.

export const dynamic = 'force-static'; // Explicitly static to be safe

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
    console.log('🗺️ Generating STATIC sitemap.xml to ensure build success.');

    // Future TODO: Implement Pre-compiled JSON strategy here.
    // const dynamicUrls = require('@/data/sitemap-cache.json');
    // const allUrls = [...STATIC_URLS, ...dynamicUrls];

    const allUrls = [...STATIC_URLS];
    const xml = generateXml(allUrls);

    return new NextResponse(xml, {
        headers: {
            'Content-Type': 'application/xml',
            'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=59',
        },
    });
}
