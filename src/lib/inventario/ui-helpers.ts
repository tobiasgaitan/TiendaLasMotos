import type { DatosMaestroInput } from '@/lib/actions/inventario-schemas';

/**
 * Helpers puros de la pantalla de aprobaciones de repuestos.
 * No dependen de Firestore ni del runtime del navegador.
 */

export function parseAplicaA(texto: string): string[] {
    const vistos = new Set<string>();
    const resultado: string[] = [];

    for (const parte of texto.split(',')) {
        const limpio = parte.trim();
        if (!limpio) continue;

        const clave = limpio.toLowerCase();
        if (vistos.has(clave)) continue;

        vistos.add(clave);
        resultado.push(limpio);
    }

    return resultado;
}

export function formatearFecha(iso: string): string {
    if (!iso || !iso.trim()) return '—';

    try {
        const fecha = new Date(iso.trim());
        if (Number.isNaN(fecha.getTime())) return '—';

        return fecha.toLocaleString('es-CO', {
            year: 'numeric',
            month: 'short',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
        });
    } catch (error) {
        console.error('[inventario-ui] formatearFecha falló:', error);
        return '—';
    }
}

export function validarMotivoRechazo(texto: string): boolean {
    const limpio = texto.trim();
    return limpio.length >= 5 && limpio.length <= 500;
}

function convertirNumero(
    valor: string | number,
    campo: 'precio' | 'stock_minimo'
): number {
    if (typeof valor === 'number') {
        if (!Number.isFinite(valor)) {
            throw new Error(`${campo} no es un número válido.`);
        }
        return valor;
    }

    const limpio = valor.trim();
    if (!limpio) return Number.NaN;

    const numero = Number(limpio);
    if (!Number.isFinite(numero)) {
        throw new Error(`${campo} no es un número válido.`);
    }

    return numero;
}

export function construirDatosMaestro(input: {
    fabricante: string;
    aplicaA: string;
    categoria: string;
    precio: string | number;
    stockMinimo: string | number;
}): DatosMaestroInput | undefined {
    const fabricante = input.fabricante.trim();
    const aplicaA = parseAplicaA(input.aplicaA);
    const categoria = input.categoria.trim();

    const precioTexto =
        typeof input.precio === 'string' ? input.precio.trim() : '';
    const stockTexto =
        typeof input.stockMinimo === 'string'
            ? input.stockMinimo.trim()
            : '';

    const hayPrecio =
        typeof input.precio === 'number' || precioTexto.length > 0;
    const hayStock =
        typeof input.stockMinimo === 'number' || stockTexto.length > 0;

    const hayDatos =
        fabricante.length > 0 ||
        aplicaA.length > 0 ||
        categoria.length > 0 ||
        hayPrecio ||
        hayStock;

    if (!hayDatos) return undefined;

    try {
        return {
            fabricante,
            aplica_a: aplicaA,
            categoria,
            precio: convertirNumero(input.precio, 'precio'),
            stock_minimo: convertirNumero(
                input.stockMinimo,
                'stock_minimo'
            ),
        };
    } catch (error) {
        console.error(
            '[inventario-ui] construirDatosMaestro falló:',
            error
        );
        return undefined;
    }
}
