import { MetadataRoute } from 'next';
import { getCatalogoMotos } from '@/lib/firestore';

const BASE_URL = 'https://tiendalasmotos.com';

function toSlug(text: string): string {
    return text
        .toLowerCase()
        .normalize('NFD') // Remove accents
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-') // Replace non-alphanumeric with hyphens
        .replace(/^-+|-+$/g, ''); // Remove leading/trailing hyphens
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
    const motos = await getCatalogoMotos();

    const productUrls = motos.map((moto) => {
        // Asumiendo que [slug] por ahora es 'catalogo' o la categoría si existiera.
        // Y [model] es el slug de la referencia o el ID.
        // Dado el mock en page.tsx, usaremos el slug de la referencia.
        const modelSlug = toSlug(moto.referencia);
        const categorySlug = 'catalogo'; // Placeholder robusto

        return {
            url: `${BASE_URL}/${categorySlug}/${modelSlug}`,
            lastModified: new Date(),
            changeFrequency: 'weekly' as const,
            priority: 0.8,
        };
    });

    return [
        {
            url: BASE_URL,
            lastModified: new Date(),
            changeFrequency: 'daily',
            priority: 1,
        },
        {
            url: `${BASE_URL}/admin/login`,
            lastModified: new Date(),
            changeFrequency: 'monthly',
            priority: 0.5,
        },
        ...productUrls,
    ];
}
