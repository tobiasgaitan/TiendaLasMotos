/**
 * WEB-038 — Landing por rol (helper puro, sin SDK).
 *
 * Contrato SSOT:
 * - `admin_creditos` → `/admin/creditos`
 * - resto (incl. null/undefined/guest) → `/admin/simulador`
 */
export function landingPorRol(rol: string | null | undefined): string {
    const r = (rol ?? '').toLowerCase().trim();
    return r === 'admin_creditos' ? '/admin/creditos' : '/admin/simulador';
}
