import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import SugerenciasVision from '@/components/inventario/SugerenciasVision';
import type { VisionConteoData } from '@/types/inventario';

const PROPS_BASE = {
    sugerencias: [],
    etiquetas: [],
    unidades: [],
    analizando: false,
    error: null,
    analizandoMultimodal: false,
    errorMultimodal: null,
    onUsarCantidad: vi.fn(),
    onReintentar: vi.fn(),
    onReintentarMultimodal: vi.fn(),
};

function conteo(
    overrides: Partial<VisionConteoData> = {}
): VisionConteoData {
    return {
        cantidad_sugerida_multimodal: 7,
        justificacion_multimodal: 'Siete unidades visibles.',
        confidence_multimodal: 0.82,
        puede_contar: true,
        motivo_no_conteo: null,
        saturada: false,
        ...overrides,
    };
}

describe('SugerenciasVision — conteo multimodal', () => {
    it('no autocompleta al renderizar y exige clic explícito', () => {
        const onUsarCantidadMultimodal = vi.fn();
        render(
            <SugerenciasVision
                {...PROPS_BASE}
                conteoMultimodal={conteo()}
                onUsarCantidadMultimodal={onUsarCantidadMultimodal}
            />
        );

        expect(onUsarCantidadMultimodal).not.toHaveBeenCalled();
        const boton = screen.getByRole('button', {
            name: /Usar cantidad sugerida/i,
        });
        expect(boton).toBeEnabled();

        fireEvent.click(boton);
        expect(onUsarCantidadMultimodal).toHaveBeenCalledWith(7);
    });

    it('deshabilita el autocompletado con confianza baja y muestra alerta', () => {
        render(
            <SugerenciasVision
                {...PROPS_BASE}
                conteoMultimodal={conteo({
                    cantidad_sugerida_multimodal: 5,
                    confidence_multimodal: 0.4,
                    puede_contar: false,
                    motivo_no_conteo: 'confianza_baja',
                })}
                onUsarCantidadMultimodal={vi.fn()}
            />
        );

        expect(
            screen.getByRole('button', { name: /Usar cantidad sugerida/i })
        ).toBeDisabled();
        expect(
            screen.getByText(/no pudo contar con confianza suficiente/i)
        ).toBeInTheDocument();
        expect(screen.getByText(/5 unidades/i)).toBeInTheDocument();
    });

    it('deshabilita el autocompletado y oculta la cantidad si la imagen está saturada', () => {
        render(
            <SugerenciasVision
                {...PROPS_BASE}
                conteoMultimodal={conteo({
                    cantidad_sugerida_multimodal: null,
                    confidence_multimodal: 0.9,
                    puede_contar: false,
                    motivo_no_conteo: 'imagen_saturada',
                    saturada: true,
                })}
                onUsarCantidadMultimodal={vi.fn()}
            />
        );

        expect(
            screen.getByRole('button', { name: /Usar cantidad sugerida/i })
        ).toBeDisabled();
        expect(
            screen.getByText(/La imagen está saturada/i)
        ).toBeInTheDocument();
        expect(screen.queryByText(/\d+ unidades/i)).not.toBeInTheDocument();
    });
});
