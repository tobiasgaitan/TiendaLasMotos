import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import SugerenciasVision from '@/components/inventario/SugerenciasVision';
import type {
    MatchingVisualResult,
    VisionConteoData,
    VisionConteoMotivo,
} from '@/types/inventario';

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

const GUIA_POR_MOTIVO: Record<
    VisionConteoMotivo,
    { causa: string; accion: string; recuperable: boolean }
> = {
    imagen_saturada: {
        causa: 'La imagen está saturada o sobreexpuesta.',
        accion: 'Toma otra foto evitando luz directa sobre el repuesto.',
        recuperable: true,
    },
    unidades_superpuestas: {
        causa: 'Hay varias unidades superpuestas que no se distinguen.',
        accion: 'Separa las unidades y toma otra foto.',
        recuperable: true,
    },
    iluminacion_deficiente: {
        causa: 'La iluminación de la foto es insuficiente.',
        accion: 'Toma otra foto con mejor iluminación.',
        recuperable: true,
    },
    angulo_no_adecuado: {
        causa: 'El ángulo de la foto no permite ver todas las unidades.',
        accion: 'Toma otra foto desde un ángulo más cenital.',
        recuperable: true,
    },
    imagen_borrosa: {
        causa: 'La imagen está borrosa.',
        accion: 'Toma otra foto enfocando mejor el repuesto.',
        recuperable: true,
    },
    objeto_no_visible: {
        causa: 'El repuesto principal no se ve con claridad.',
        accion: 'Asegúrate de que el repuesto sea visible en la foto.',
        recuperable: true,
    },
    confianza_baja: {
        causa: 'El modelo no pudo contar con confianza suficiente.',
        accion: 'Cuenta manualmente o toma otra foto más clara.',
        recuperable: true,
    },
    otro: {
        causa: 'El modelo no pudo contar las unidades con confianza suficiente.',
        accion: 'Cuenta manualmente.',
        recuperable: false,
    },
};

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

    it.each(
        (Object.keys(GUIA_POR_MOTIVO) as VisionConteoMotivo[]).map(
            (motivo) => [motivo, GUIA_POR_MOTIVO[motivo]] as const
        )
    )('muestra causa y acción propias para el motivo %s', (motivo, guia) => {
        const onUsarCantidadMultimodal = vi.fn();
        render(
            <SugerenciasVision
                {...PROPS_BASE}
                conteoMultimodal={conteo({
                    cantidad_sugerida_multimodal: 4,
                    confidence_multimodal: 0.5,
                    puede_contar: false,
                    motivo_no_conteo: motivo,
                    justificacion_multimodal: 'Detalle del modelo.',
                })}
                onUsarCantidadMultimodal={onUsarCantidadMultimodal}
            />
        );

        expect(screen.getByText(guia.causa)).toBeInTheDocument();
        expect(screen.getByText(guia.accion)).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: /Usar cantidad sugerida/i })
        ).toBeDisabled();
        expect(onUsarCantidadMultimodal).not.toHaveBeenCalled();
    });

    it.each(
        (Object.keys(GUIA_POR_MOTIVO) as VisionConteoMotivo[]).map(
            (motivo) => [motivo, GUIA_POR_MOTIVO[motivo]] as const
        )
    )(
        'sugiere «Repetir foto» solo para motivos recuperables (%s)',
        (motivo, guia) => {
            render(
                <SugerenciasVision
                    {...PROPS_BASE}
                    conteoMultimodal={conteo({
                        cantidad_sugerida_multimodal: 4,
                        confidence_multimodal: 0.5,
                        puede_contar: false,
                        motivo_no_conteo: motivo,
                    })}
                    onUsarCantidadMultimodal={vi.fn()}
                />
            );

            const hint = screen.queryByText(
                /Puedes usar «Repetir foto» en el paso 1\./
            );
            if (guia.recuperable) {
                expect(hint).toBeInTheDocument();
            } else {
                expect(hint).not.toBeInTheDocument();
            }
        }
    );

    it('usa el copy de "otro" cuando el motivo persistido es null', () => {
        render(
            <SugerenciasVision
                {...PROPS_BASE}
                conteoMultimodal={conteo({
                    cantidad_sugerida_multimodal: null,
                    confidence_multimodal: null,
                    puede_contar: false,
                    motivo_no_conteo: null,
                })}
                onUsarCantidadMultimodal={vi.fn()}
            />
        );

        expect(
            screen.getByText(
                GUIA_POR_MOTIVO.otro.causa
            )
        ).toBeInTheDocument();
        expect(
            screen.getByText(GUIA_POR_MOTIVO.otro.accion)
        ).toBeInTheDocument();
    });

    it('prioriza la guía de saturación sobre el motivo persistido', () => {
        render(
            <SugerenciasVision
                {...PROPS_BASE}
                conteoMultimodal={conteo({
                    cantidad_sugerida_multimodal: null,
                    confidence_multimodal: 0.9,
                    puede_contar: false,
                    motivo_no_conteo: 'confianza_baja',
                    saturada: true,
                })}
                onUsarCantidadMultimodal={vi.fn()}
            />
        );

        expect(
            screen.getByText(GUIA_POR_MOTIVO.imagen_saturada.causa)
        ).toBeInTheDocument();
        expect(
            screen.getByText(GUIA_POR_MOTIVO.imagen_saturada.accion)
        ).toBeInTheDocument();
        expect(
            screen.queryByText(GUIA_POR_MOTIVO.confianza_baja.causa)
        ).not.toBeInTheDocument();
    });

    it('muestra la justificación dentro de un <details> cerrado en alerta', () => {
        render(
            <SugerenciasVision
                {...PROPS_BASE}
                conteoMultimodal={conteo({
                    cantidad_sugerida_multimodal: 4,
                    confidence_multimodal: 0.5,
                    puede_contar: false,
                    motivo_no_conteo: 'confianza_baja',
                    justificacion_multimodal: 'Hay sombras sobre dos unidades.',
                })}
                onUsarCantidadMultimodal={vi.fn()}
            />
        );

        const resumen = screen.getByText('Ver detalle del modelo');
        const details = resumen.closest('details');
        expect(details).not.toBeNull();
        expect(details).not.toHaveAttribute('open');
        expect(
            screen.getByText('Hay sombras sobre dos unidades.')
        ).toBeInTheDocument();
    });

    it('mantiene la justificación visible y sin recomendaciones en ruta feliz', () => {
        render(
            <SugerenciasVision
                {...PROPS_BASE}
                conteoMultimodal={conteo({
                    justificacion_multimodal: 'Siete unidades visibles.',
                })}
                onUsarCantidadMultimodal={vi.fn()}
            />
        );

        expect(
            screen.getByText('Siete unidades visibles.')
        ).toBeInTheDocument();
        expect(
            screen.queryByText('Ver detalle del modelo')
        ).not.toBeInTheDocument();
        expect(
            screen.queryByText(/Puedes usar «Repetir foto»/)
        ).not.toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: /Usar cantidad sugerida/i })
        ).toBeEnabled();
    });
});

describe('SugerenciasVision — matching visual', () => {
    function matching(
        overrides: Partial<MatchingVisualResult> = {}
    ): MatchingVisualResult {
        const mejor = {
            documento_id: 'BRK-001',
            referencia: 'BRK-001',
            estado: 'coincide' as const,
            coincide: true,
            confianza: 0.87,
            justificacion: 'Misma carcasa.',
            latencia_ms: 120,
        };
        return {
            success: true,
            disponible: true,
            modelo: 'z-ai/glm-5.3-flash',
            mejor,
            pares: [mejor],
            latencia_ms: 120,
            ...overrides,
        };
    }

    it('dispara el matching solo por clic humano', () => {
        const onVerificarMatching = vi.fn();
        render(
            <SugerenciasVision
                {...PROPS_BASE}
                conteoMultimodal={conteo()}
                onUsarCantidadMultimodal={vi.fn()}
                puedeVerificarMatching
                onVerificarMatching={onVerificarMatching}
            />
        );

        expect(onVerificarMatching).not.toHaveBeenCalled();
        fireEvent.click(
            screen.getByRole('button', {
                name: /Verificar coincidencia visual/i,
            })
        );
        expect(onVerificarMatching).toHaveBeenCalledTimes(1);
    });

    it('muestra la mejor coincidencia sin autoseleccionar', () => {
        const onUsarCantidadMultimodal = vi.fn();
        render(
            <SugerenciasVision
                {...PROPS_BASE}
                conteoMultimodal={conteo()}
                onUsarCantidadMultimodal={onUsarCantidadMultimodal}
                puedeVerificarMatching
                onVerificarMatching={vi.fn()}
                matchingVisual={matching()}
            />
        );

        expect(
            screen.getByText(/La IA sugiere BRK-001 \(87%\)/i)
        ).toBeInTheDocument();
        expect(
            screen.getByText(/Sugerencia no vinculante/i)
        ).toBeInTheDocument();
        expect(onUsarCantidadMultimodal).not.toHaveBeenCalled();
    });

    it('advierte confianza baja sin bloquear', () => {
        render(
            <SugerenciasVision
                {...PROPS_BASE}
                conteoMultimodal={conteo()}
                onUsarCantidadMultimodal={vi.fn()}
                puedeVerificarMatching
                onVerificarMatching={vi.fn()}
                matchingVisual={matching({
                    mejor: {
                        documento_id: 'BRK-001',
                        referencia: 'BRK-001',
                        estado: 'coincide',
                        coincide: true,
                        confianza: 0.45,
                        justificacion: '',
                        latencia_ms: 100,
                    },
                })}
            />
        );

        expect(
            screen.getByText(/Confianza baja/i)
        ).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: /Usar cantidad sugerida/i })
        ).toBeEnabled();
    });

    it('muestra fallback cuando no hay coincidencia', () => {
        render(
            <SugerenciasVision
                {...PROPS_BASE}
                conteoMultimodal={conteo()}
                onUsarCantidadMultimodal={vi.fn()}
                puedeVerificarMatching
                onVerificarMatching={vi.fn()}
                matchingVisual={matching({
                    disponible: false,
                    mejor: null,
                    pares: [],
                })}
            />
        );

        expect(
            screen.getByText(/Ninguna de las fichas candidatas coincide/i)
        ).toBeInTheDocument();
    });

    it('muestra error de matching sin romper el conteo', () => {
        render(
            <SugerenciasVision
                {...PROPS_BASE}
                conteoMultimodal={conteo()}
                onUsarCantidadMultimodal={vi.fn()}
                puedeVerificarMatching
                onVerificarMatching={vi.fn()}
                errorMatching="Matching visual no disponible."
            />
        );

        expect(
            screen.getByText('Matching visual no disponible.')
        ).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: /Usar cantidad sugerida/i })
        ).toBeEnabled();
    });
});
