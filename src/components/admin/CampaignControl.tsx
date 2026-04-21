'use client';

import { useState } from 'react';

// --- Tipos y Contratos ---

/**
 * CampaignStartRequest - Contrato del body POST hacia el orquestador.
 * Contrato v2.0.0 — coincide con CampaignRequest en app/routers/admin.py
 */
interface CampaignStartRequest {
    limit: number;
    template_a: string;
    template_b: string;
    language: string;
    /** phone_id — WhatsApp Business Account Phone ID para la línea de salida. Contrato v2.1.0 */
    phone_id: string;
}

/**
 * TemplateOption - Opciones de plantilla disponibles para el dropdown.
 * Cada opción expone el nombre de la plantilla y el código de idioma requerido por Meta.
 */
interface TemplateOption {
    label: string;
    template_name: string;
    language: string;
}

const TEMPLATE_OPTIONS: TemplateOption[] = [
    { label: 'contactos_impulsa (en)', template_name: 'contactos_impulsa', language: 'en' },
    { label: 'envio_mensaje_prospectos (es_CO)', template_name: 'envio_mensaje_prospectos', language: 'es_CO' },
];

/**
 * PhoneOption — Líneas de salida de WhatsApp Business disponibles.
 * POR QUÉ: Permite seleccionar el Phone Number ID de la WABA desde el que se envía
 * la campaña, habilitando operación multi-número sin re-despliegue del backend.
 */
interface PhoneOption {
    label: string;
    phone_id: string;
}

const PHONE_OPTIONS: PhoneOption[] = [
    { label: 'Línea Principal (1021779847693778)', phone_id: '1021779847693778' },
];

// Endpoint del orquestador de campañas — Cloud Run Beta
const CAMPAIGN_API_URL =
    'https://bot-tiendalasmotos-beta-467812260261.us-central1.run.app/api/admin/campaign/start';

// Llave de administrador — guardada por contrato (usada también en handleBotToggle)
const ADMIN_API_KEY = 'moto_master_2026';

// --- Estilos (Bypass Nuclear — sin Tailwind arbitrario) ---

const styles: Record<string, React.CSSProperties> = {
    container: {
        background: '#111827',
        border: '1px solid #374151',
        borderRadius: '16px',
        padding: '32px',
        display: 'flex',
        flexDirection: 'column',
        gap: '28px',
    },
    header: {
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
    },
    headerTitle: {
        color: '#ffffff',
        fontWeight: '700',
        fontSize: '22px',
        margin: 0,
    },
    headerSubtitle: {
        color: '#9ca3af',
        fontSize: '14px',
        margin: 0,
    },
    formGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '20px',
    },
    formGroup: {
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
    },
    label: {
        color: '#d1d5db',
        fontSize: '13px',
        fontWeight: '600',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
    },
    select: {
        background: '#1f2937',
        border: '1px solid #374151',
        borderRadius: '10px',
        color: '#f9fafb',
        fontSize: '14px',
        fontWeight: '500',
        padding: '10px 14px',
        outline: 'none',
        cursor: 'pointer',
        width: '100%',
        appearance: 'none' as const,
        WebkitAppearance: 'none' as const,
    },
    numberInput: {
        background: '#1f2937',
        border: '1px solid #374151',
        borderRadius: '10px',
        color: '#f9fafb',
        fontSize: '15px',
        fontWeight: '700',
        padding: '10px 14px',
        outline: 'none',
        width: '100%',
        boxSizing: 'border-box' as const,
    },
    launchButton: {
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '10px',
        background: '#16a34a',
        color: '#ffffff',
        padding: '13px 36px',
        borderRadius: '12px',
        fontWeight: '700',
        fontSize: '15px',
        border: 'none',
        cursor: 'pointer',
        transition: 'background 0.15s ease, opacity 0.15s ease',
        alignSelf: 'flex-start',
    },
    launchButtonDisabled: {
        background: '#374151',
        cursor: 'not-allowed',
        opacity: 0.7,
    },
    logArea: {
        background: '#0d1117',
        border: '1px solid #1f2937',
        borderRadius: '12px',
        padding: '20px',
        minHeight: '140px',
        fontFamily: '"Fira Code", "Cascadia Code", "Courier New", monospace',
        fontSize: '13px',
        lineHeight: '1.7',
        overflowY: 'auto' as const,
        maxHeight: '320px',
    },
    logPlaceholder: {
        color: '#4b5563',
        fontStyle: 'italic',
    },
    logConnecting: {
        color: '#fbbf24',
    },
    logSuccess: {
        color: '#34d399',
    },
    logError: {
        color: '#f87171',
    },
    metadataBadge: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        background: '#1f2937',
        border: '1px solid #374151',
        borderRadius: '8px',
        padding: '6px 12px',
        color: '#9ca3af',
        fontSize: '12px',
        fontWeight: '500',
    },
};

// --- Componente Principal ---

/**
 * CampaignControl — Panel de disparo de campañas masivas de WhatsApp.
 *
 * POR QUÉ: Este componente centraliza el control de campaña en el frontend de admin,
 * eliminando la necesidad de llamadas curl manuales al orquestador. Actúa como
 * envoltorio UI sobre el endpoint POST /api/admin/campaign/start del backend.
 *
 * Contrato: El body POST envía {limit, template_a, template_b, language} — transparente
 * sin hardcoding de idioma o plantilla (patrón establecido en a2767d7e / b2ef5988).
 */
export default function CampaignControl() {
    // Línea de salida (WhatsApp Phone Number ID) — default: Línea Principal
    const [selectedPhone, setSelectedPhone] = useState('1021779847693778');

    // Dropdown selection (índice dentro de TEMPLATE_OPTIONS)
    const [selectedTemplateIdx, setSelectedTemplateIdx] = useState<number>(0);

    // Límite de envío
    const [limit, setLimit] = useState<number>(10);

    // Estado del log de feedback
    const [logLines, setLogLines] = useState<{ text: string; type: 'connecting' | 'success' | 'error' | 'idle' }[]>([]);

    // Flag de petición en vuelo — previene doble disparo
    const [isSending, setIsSending] = useState(false);

    const selectedTemplate = TEMPLATE_OPTIONS[selectedTemplateIdx];

    /**
     * Añade una línea al área de log con su tipo de estilo.
     */
    const appendLog = (text: string, type: 'connecting' | 'success' | 'error') => {
        setLogLines(prev => [...prev, { text, type }]);
    };

    /**
     * handleLaunch — Dispara la campaña masiva contra el orquestador.
     *
     * POR QUÉ BLOQUEANTE: La petición es síncrona (`await`) por mandato de observabilidad.
     * No usamos fire-and-forget: el log DEBE reflejar la respuesta real del servidor
     * antes de habilitar el botón nuevamente (Protocolo PVN Hardened).
     *
     * Body Contract:
     *   template_a == template_b == selectedTemplate.template_name
     *   (El orquestador usa template_a como plantilla principal — contrato actual del backend)
     */
    const handleLaunch = async () => {
        if (isSending) return;

        // Validación de límite
        if (!limit || limit < 1 || limit > 500) {
            setLogLines([{ text: '⚠️ Error: El límite debe estar entre 1 y 500.', type: 'error' }]);
            return;
        }

        setIsSending(true);
        setLogLines([{ text: '🔌 Conectando con el Bot...', type: 'connecting' }]);

        const requestBody: CampaignStartRequest = {
            limit,
            template_a: selectedTemplate.template_name,
            template_b: selectedTemplate.template_name,
            language: selectedTemplate.language,
            phone_id: selectedPhone,
        };

        try {
            appendLog(
                `📤 POST → ${CAMPAIGN_API_URL}`,
                'connecting'
            );
            appendLog(
                `📦 Body: ${JSON.stringify(requestBody)}`,
                'connecting'
            );

            const response = await fetch(CAMPAIGN_API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Admin-API-Key': ADMIN_API_KEY,
                },
                body: JSON.stringify(requestBody),
            });

            // Blindaje de Observabilidad HTTP (Zero-Silent-Failures)
            // Si el servidor devuelve un status !== 2xx, extraemos el body crudo del error.
            if (!response.ok) {
                const errorBody = await response.text();
                appendLog(
                    `❌ HTTP ${response.status} ${response.statusText}`,
                    'error'
                );
                appendLog(`📋 Cuerpo del error: ${errorBody}`, 'error');
                return;
            }

            const data = await response.json();
            appendLog('✅ Respuesta del servidor:', 'success');
            appendLog(JSON.stringify(data, null, 2), 'success');

        } catch (err: unknown) {
            // Captura errores de red (sin conexión, CORS, timeout)
            const message = err instanceof Error ? err.message : String(err);
            appendLog(`❌ Error de red: ${message}`, 'error');
        } finally {
            setIsSending(false);
        }
    };

    const getLogStyle = (type: string): React.CSSProperties => {
        if (type === 'connecting') return styles.logConnecting;
        if (type === 'success') return styles.logSuccess;
        if (type === 'error') return styles.logError;
        return styles.logPlaceholder;
    };

    return (
        <div style={styles.container}>
            {/* Header */}
            <div style={styles.header}>
                <h2 style={styles.headerTitle}>🚀 Panel de Envío Masivo</h2>
                <p style={styles.headerSubtitle}>
                    Dispara una campaña de WhatsApp a prospectos con estado <strong style={{ color: '#fbbf24' }}>PENDING</strong> y fuente <code style={{ color: '#34d399' }}>BULK_IMPORT_V1.2</code>.
                </p>
            </div>

            {/* Controles */}
            <div style={styles.formGrid}>
                {/* Dropdown: Línea de Salida (phone_id) */}
                <div style={styles.formGroup}>
                    <label htmlFor="campaign-phone-select" style={styles.label}>
                        Línea de Salida (WhatsApp ID)
                    </label>
                    <select
                        id="campaign-phone-select"
                        style={styles.select}
                        value={selectedPhone}
                        onChange={(e) => setSelectedPhone(e.target.value)}
                        disabled={isSending}
                    >
                        {PHONE_OPTIONS.map((opt) => (
                            <option key={opt.phone_id} value={opt.phone_id}>
                                {opt.label}
                            </option>
                        ))}
                    </select>
                </div>

                {/* Dropdown: Plantilla */}
                <div style={styles.formGroup}>
                    <label htmlFor="campaign-template-select" style={styles.label}>
                        Plantilla de Mensaje
                    </label>
                    <select
                        id="campaign-template-select"
                        style={styles.select}
                        value={selectedTemplateIdx}
                        onChange={(e) => setSelectedTemplateIdx(Number(e.target.value))}
                        disabled={isSending}
                    >
                        {TEMPLATE_OPTIONS.map((opt, idx) => (
                            <option key={opt.template_name} value={idx}>
                                {opt.label}
                            </option>
                        ))}
                    </select>
                </div>

                {/* Input: Límite de Envío */}
                <div style={styles.formGroup}>
                    <label htmlFor="campaign-limit-input" style={styles.label}>
                        Límite de Envío
                    </label>
                    <input
                        id="campaign-limit-input"
                        type="number"
                        min={1}
                        max={500}
                        style={styles.numberInput}
                        value={limit}
                        onChange={(e) => setLimit(Number(e.target.value))}
                        disabled={isSending}
                        placeholder="Ej: 10"
                    />
                </div>
            </div>

            {/* Metadata preview */}
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' as const }}>
                <span style={styles.metadataBadge}>
                    🗣️ Idioma: <strong style={{ color: '#e5e7eb' }}>{selectedTemplate.language}</strong>
                </span>
                <span style={styles.metadataBadge}>
                    📋 Plantilla: <strong style={{ color: '#e5e7eb' }}>{selectedTemplate.template_name}</strong>
                </span>
                <span style={styles.metadataBadge}>
                    🎯 Límite: <strong style={{ color: '#e5e7eb' }}>{limit}</strong> prospectos
                </span>
            </div>

            {/* Botón de acción */}
            <button
                id="campaign-launch-btn"
                style={{
                    ...styles.launchButton,
                    ...(isSending ? styles.launchButtonDisabled : {}),
                }}
                onClick={handleLaunch}
                disabled={isSending}
            >
                {isSending ? (
                    <>
                        <span
                            style={{
                                display: 'inline-block',
                                width: '16px',
                                height: '16px',
                                border: '2px solid rgba(255,255,255,0.3)',
                                borderTopColor: '#ffffff',
                                borderRadius: '50%',
                                animation: 'spin 0.8s linear infinite',
                            }}
                        />
                        Enviando...
                    </>
                ) : (
                    '🚀 Iniciar Envío Masivo'
                )}
            </button>

            {/* Área de Log */}
            <div>
                <label style={{ ...styles.label, display: 'block', marginBottom: '10px' }}>
                    📡 Log de Ejecución
                </label>
                <div style={styles.logArea}>
                    {logLines.length === 0 ? (
                        <span style={styles.logPlaceholder}>
                            El log de la campaña aparecerá aquí al iniciar el envío...
                        </span>
                    ) : (
                        logLines.map((line, idx) => (
                            <div key={idx} style={getLogStyle(line.type)}>
                                <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontFamily: 'inherit' }}>
                                    {line.text}
                                </pre>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* Spinner keyframe — inyectado como style tag para evitar dependencia CSS global */}
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    );
}
