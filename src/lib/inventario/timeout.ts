export const TIMEOUT_ANALISIS_MS = 30_000;

export class TimeoutError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'TimeoutError';
    }
}

/**
 * Limita la espera de una promesa sin cancelar la operación subyacente.
 * El llamador debe invalidar su secuencia para ignorar resultados tardíos.
 */
export function conTimeout<T>(
    promesa: Promise<T>,
    ms: number,
    mensaje: string
): Promise<T> {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const timeout = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
            reject(new TimeoutError(mensaje));
        }, ms);
    });

    return Promise.race([promesa, timeout]).finally(() => {
        if (timeoutId !== undefined) {
            clearTimeout(timeoutId);
        }
    });
}
