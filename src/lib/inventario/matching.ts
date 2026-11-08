import { categoriaDesdeEtiqueta } from '@/lib/actions/vision-mapping';
import type { RepuestoCandidato } from '@/types/inventario';

/**
 * WEB-043 — Capa pura de matching entre etiquetas de Vision y el catálogo.
 *
 * La identidad del candidato SIEMPRE es `referencia`, que el servidor toma de
 * `doc.id` en `inventario_repuestos`. Este módulo no importa Firestore, React
 * ni APIs del navegador.
 */

export interface CandidatoFuente {
    referencia: string;
    descripcion: string;
    fabricante: string;
    categoria: string;
    aplica_a?: string[];
    stock: number;
}

export interface OpcionesMatching {
    etiquetas?: readonly string[];
    consulta?: string;
}

const STOPWORDS = new Set([
    'a',
    'al',
    'and',
    'con',
    'de',
    'del',
    'el',
    'en',
    'for',
    'la',
    'las',
    'los',
    'of',
    'para',
    'por',
    'the',
    'with',
    'y',
]);

function normalizarTextoBase(valor: string): string {
    return valor
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim()
        .replace(/\s+/g, ' ');
}

export function normalizarTexto(valor: string): string {
    return normalizarTextoBase(valor);
}

export function tokenizar(valor: string): string[] {
    const normalizado = normalizarTextoBase(valor);
    if (!normalizado) return [];
    return normalizado
        .split(' ')
        .filter((token) => token.length > 1 && !STOPWORDS.has(token));
}

function tokensUnicos(valores: readonly string[]): string[] {
    const vistos = new Set<string>();
    const resultado: string[] = [];
    for (const valor of valores) {
        for (const token of tokenizar(valor)) {
            if (vistos.has(token)) continue;
            vistos.add(token);
            resultado.push(token);
        }
    }
    return resultado;
}

interface Puntaje {
    score: number;
    coincidencia: boolean;
}

function puntuarContraCampos(
    etiqueta: string,
    referenciaNormalizada: string,
    camposNormalizados: readonly string[],
    tokensCampos: readonly string[],
    pesoExacto: number,
    pesoIncluye: number,
    pesoToken: number
): Puntaje {
    const normalizada = normalizarTextoBase(etiqueta);
    if (!normalizada) return { score: 0, coincidencia: false };

    if (referenciaNormalizada === normalizada) {
        return { score: pesoExacto, coincidencia: true };
    }

    let score = 0;
    let coincidencia = false;

    if (referenciaNormalizada.includes(normalizada)) {
        score += pesoIncluye;
        coincidencia = true;
    }

    for (const campo of camposNormalizados) {
        if (campo.includes(normalizada)) {
            score += pesoIncluye;
            coincidencia = true;
            break;
        }
    }

    const tokensEtiqueta = tokenizar(etiqueta);
    if (tokensEtiqueta.length > 1) {
        let coincidencias = 0;
        for (const token of tokensEtiqueta) {
            if (tokensCampos.includes(token)) coincidencias += 1;
        }
        if (coincidencias > 0) {
            score += Math.min(coincidencias * pesoToken, pesoIncluye);
            coincidencia = true;
        }
    }

    return { score, coincidencia };
}

function puntuarEtiqueta(
    etiqueta: string,
    referenciaNormalizada: string,
    camposNormalizados: readonly string[],
    tokensCampos: readonly string[],
    categoriaNormalizada: string
): Puntaje {
    const base = puntuarContraCampos(
        etiqueta,
        referenciaNormalizada,
        camposNormalizados,
        tokensCampos,
        120,
        45,
        12
    );

    const categoriaMapeada = categoriaDesdeEtiqueta(etiqueta);
    if (categoriaMapeada) {
        const categoriaMapeadaNormalizada = normalizarTextoBase(categoriaMapeada);
        if (
            categoriaMapeadaNormalizada &&
            categoriaMapeadaNormalizada === categoriaNormalizada
        ) {
            return {
                score: Math.max(base.score, 70),
                coincidencia: true,
            };
        }
    }

    return base;
}

function puntuarConsulta(
    consulta: string,
    referenciaNormalizada: string,
    camposNormalizados: readonly string[],
    tokensCampos: readonly string[]
): Puntaje {
    return puntuarContraCampos(
        consulta,
        referenciaNormalizada,
        camposNormalizados,
        tokensCampos,
        130,
        55,
        15
    );
}

function puntuarCandidato(
    candidato: CandidatoFuente,
    etiquetas: readonly string[],
    consulta: string
): { score: number; coincidencias: string[] } {
    const referenciaNormalizada = normalizarTextoBase(candidato.referencia);
    const categoriaNormalizada = normalizarTextoBase(candidato.categoria);
    const aplicaA = candidato.aplica_a ?? [];
    const camposNormalizados = [
        candidato.descripcion,
        candidato.fabricante,
        candidato.categoria,
        ...aplicaA,
    ].map(normalizarTextoBase);
    const tokensCampos = tokensUnicos([
        candidato.descripcion,
        candidato.fabricante,
        candidato.categoria,
        ...aplicaA,
    ]);

    let score = 0;
    const coincidencias: string[] = [];

    for (const etiqueta of etiquetas) {
        const resultado = puntuarEtiqueta(
            etiqueta,
            referenciaNormalizada,
            camposNormalizados,
            tokensCampos,
            categoriaNormalizada
        );
        if (!resultado.coincidencia) continue;
        score += resultado.score;
        if (!coincidencias.includes(etiqueta)) {
            coincidencias.push(etiqueta);
        }
    }

    if (consulta.trim()) {
        const resultadoConsulta = puntuarConsulta(
            consulta,
            referenciaNormalizada,
            camposNormalizados,
            tokensCampos
        );
        if (!resultadoConsulta.coincidencia) {
            return { score: 0, coincidencias: [] };
        }
        score += resultadoConsulta.score;
    }

    return { score, coincidencias };
}

/**
 * Rankea candidatos por coincidencia de etiquetas/consulta. Si no hay
 * etiquetas ni consulta, devuelve el catálogo ordenado por referencia.
 */
export function rankearCandidatos(
    candidatos: readonly CandidatoFuente[],
    opciones: OpcionesMatching = {}
): RepuestoCandidato[] {
    const etiquetas: string[] = [];
    const etiquetasVistas = new Set<string>();
    for (const etiqueta of opciones.etiquetas ?? []) {
        const limpia = etiqueta.trim();
        const clave = normalizarTextoBase(limpia);
        if (!clave || etiquetasVistas.has(clave)) continue;
        etiquetasVistas.add(clave);
        etiquetas.push(limpia);
        if (etiquetas.length >= 10) break;
    }
    const consulta = (opciones.consulta ?? '').trim().slice(0, 64);
    const hayFiltro = etiquetas.length > 0 || consulta.length > 0;

    const rankeados: RepuestoCandidato[] = [];

    for (const candidato of candidatos) {
        const referencia = candidato.referencia;
        if (!referencia) continue;

        const evaluacion = puntuarCandidato(candidato, etiquetas, consulta);
        if (hayFiltro && evaluacion.score <= 0) continue;

        rankeados.push({
            referencia,
            descripcion: candidato.descripcion,
            fabricante: candidato.fabricante,
            categoria: candidato.categoria,
            stock: candidato.stock,
            score: evaluacion.score,
            coincidencias: evaluacion.coincidencias,
        });
    }

    rankeados.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return a.referencia.localeCompare(b.referencia, 'es');
    });

    return rankeados;
}
