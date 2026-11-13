import { describe, expect, it } from 'vitest';
import {
    conTimeout,
    TIMEOUT_ANALISIS_MS,
    TimeoutError,
} from '@/lib/inventario/timeout';

describe('conTimeout', () => {
    it('resuelve un análisis válido que termina antes del límite', async () => {
        await expect(
            conTimeout(Promise.resolve('analisis-ok'), 1_000, 'Timeout')
        ).resolves.toBe('analisis-ok');
    });

    it('rechaza con TimeoutError cuando la promesa no termina a tiempo', async () => {
        const pendiente = new Promise<string>(() => undefined);

        await expect(
            conTimeout(pendiente, 5, 'El análisis tardó demasiado.')
        ).rejects.toBeInstanceOf(TimeoutError);
    });

    it('expone el límite aprobado para el análisis de fotos', () => {
        expect(TIMEOUT_ANALISIS_MS).toBe(30_000);
    });
});
