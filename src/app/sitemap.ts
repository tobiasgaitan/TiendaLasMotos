import { MetadataRoute } from 'next';

/**
 * Sitemap estático para TiendaLasMotos.
 *
 * ⚡ PERF: Se eliminó la consulta dinámica a Firestore (getCatalogoMotos)
 * porque provocaba un timeout de 60s durante `npm run build` en Cloud Shell.
 * Ahora se devuelve únicamente la lista de rutas principales del sitio.
 *
 * TODO: Cuando el entorno de build soporte tiempos más largos o se implemente
 * ISR/on-demand revalidation, restaurar la generación dinámica de URLs
 * de productos desde Firestore.
 */

const BASE_URL = 'https://tiendalasmotos.com';

export default function sitemap(): MetadataRoute.Sitemap {
    return [
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
}
