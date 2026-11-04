/**
 * WEB-038 — Landing por rol (helper puro, sin SDK).
 *
 * Contrato SSOT:
 * - `asesor` → `/admin/inventario-asesor`
 * - `admin_creditos` → `/admin/creditos`
 * - resto (incl. null/undefined/guest) → `/admin/simulador`
 */
export function landingPorRol(rol: string | null | undefined): string {
    const r = (rol ?? '').toLowerCase().trim();
    if (r === 'asesor') return '/admin/inventario-asesor';
    if (r === 'admin_creditos') return '/admin/creditos';
    return '/admin/simulador';
}
