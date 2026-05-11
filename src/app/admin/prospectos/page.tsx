'use client';

import { useEffect, useState } from 'react';
import { collection, query, orderBy, onSnapshot, Timestamp, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { toast } from 'sonner';
import { UserRound, Flame, Phone, Check, CheckCheck, AlertCircle, AlertTriangle } from 'lucide-react';
import ProspectModal, { Prospect } from '@/components/admin/ProspectModal';
import BulkImportModal from '@/components/admin/BulkImportModal';
import CampaignControl from '@/components/admin/CampaignControl';

// Status Configuration Map (Must match Modal)
const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
    PENDING: { label: 'Pendientes', color: 'bg-amber-500/20 text-amber-500 border-amber-500/50' },
    IN_PROGRESS: { label: 'En Gestión', color: 'bg-blue-500/20 text-blue-500 border-blue-500/50' },
    // [WEB-OBS-1.3] Estandarización v8.1.1: DONE → CLOSED
    CLOSED: { label: 'Venta Cerrada', color: 'bg-green-500/20 text-green-500 border-green-500/50' },
    DISCARDED: { label: 'Descartados', color: 'bg-gray-500/20 text-gray-400 border-gray-500/50' },
};

// [UI-HOMOLOGACION-PENDING-001] LEGACY_STATUS_MAP y normalizeStatus() eliminados.
// El pipeline BULK_IMPORT persiste 'PENDING' directamente (estándar v2.0.0).
// No se requiere capa de traducción.

/**
 * ProspectsPage - Dashboard de Prospectos y Ventas
 * 
 * Visualiza los leads capturados en tiempo real desde la colección "prospectos".
 * Permite filtrar por estado, ver detalles y gestionar el ciclo de vida del cliente.
 */
export default function ProspectsPage() {
    const [leads, setLeads] = useState<Prospect[]>([]);
    const [filteredLeads, setFilteredLeads] = useState<Prospect[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // UI State
    const [currentFilter, setCurrentFilter] = useState<string>('ALL');
    const [selectedProspect, setSelectedProspect] = useState<Prospect | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isImportModalOpen, setIsImportModalOpen] = useState(false);
    const [togglingId, setTogglingId] = useState<string | null>(null);
    // [WEB-751] Orchestrator-First Policy: estado de carga individual por prospecto
    const [orchestratingId, setOrchestratingId] = useState<string | null>(null);
    // [ARCH-BULK-META-008] Tab switcher: useState only (no new dependency — contrato v2.0.0)
    // [FRONTEND-ENVIO-MASIVO-TAB] Tercer estado añadido — contrato v2.1.0
    const [activeTab, setActiveTab] = useState<'dashboard' | 'carga_masiva' | 'envio_masivo'>('dashboard');

    useEffect(() => {
        // 1. Referencia a la colección
        const q = query(
            collection(db, "prospectos"),
            orderBy("fecha", "desc")
        );

        // 2. Suscripción en tiempo real
        const unsubscribe = onSnapshot(q,
            (snapshot) => {
                const leadsData: Prospect[] = snapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                } as Prospect));

                setLeads(leadsData);
                setLoading(false);
            },
            (err) => {
                console.error("Error fetching prospects:", err);
                setError("Error al cargar los prospectos. Verifica tu conexión o permisos.");
                setLoading(false);
            }
        );

        // Cleanup al desmontar
        return () => unsubscribe();
    }, []);

    // Filter Logic — [UI-HOMOLOGACION-PENDING-001]
    // Comparación directa: todos los documentos persisten el enum canónico en inglés.
    useEffect(() => {
        if (currentFilter === 'ALL') {
            setFilteredLeads(leads);
        } else {
            setFilteredLeads(leads.filter(lead => lead.status === currentFilter));
        }
    }, [leads, currentFilter]);

    // Helper para formatear fecha (ej: 28 Dic, 10:30 AM)
    const formatDate = (timestamp: Timestamp) => {
        if (!timestamp) return 'Fecha desconocida';
        try {
            const date = timestamp.toDate();
            return new Intl.DateTimeFormat('es-CO', {
                day: 'numeric',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit',
                hour12: true
            }).format(date);
        } catch (e) {
            return 'Fecha inválida';
        }
    };

    /**
     * [WEB-751] Orchestrator-First Policy — Detonador del orquestador backend.
     * PROHIBIDO usar wa.me directo. Toda comunicación individual debe pasar por
     * /api/admin/campaign/start para garantizar trazabilidad y persistencia en Firestore.
     *
     * Contrato: POST /api/admin/campaign/start (CampaignControl.tsx v2.1.0)
     * Template por defecto: envio_mensaje_prospectos (es_CO)
     * Phone ID por defecto: 1021779847693778 (Línea Principal)
     */
    const handleOrchestrate = async (e: React.MouseEvent, lead: Prospect) => {
        e.stopPropagation();
        if (orchestratingId) return; // Prevenir disparos concurrentes
        setOrchestratingId(lead.id);

        const BACKEND_URL = `${process.env.NEXT_PUBLIC_API_URL}/api/admin/campaign/start`;
        const ADMIN_API_KEY = process.env.NEXT_PUBLIC_BOT_API_KEY;

        try {
            const response = await fetch(BACKEND_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Admin-API-Key': ADMIN_API_KEY as string,
                },
                body: JSON.stringify({
                    targets: [{ celular: lead.celular }],
                    template_a: 'envio_mensaje_prospectos',
                    template_b: 'envio_mensaje_prospectos',
                    phone_id: '1021779847693778',
                    language: 'es_CO',
                }),
            });

            // [Zero-Silent-Failures] Captura del payload nativo del proveedor
            if (!response.ok) {
                const errorBody = await response.text();
                throw new Error(`Orquestador respondió ${response.status}: ${errorBody}`);
            }

            toast.success('📤 Mensaje orquestado', {
                description: `Campaña individual disparada para ${lead.nombre}. Revisa el log de envíos.`
            });
        } catch (error) {
            console.error('[WEB-751] Error al llamar al orquestador:', error);
            toast.error('Error al orquestar mensaje', {
                description: error instanceof Error ? error.message : 'Verifica tu conexión con el backend.'
            });
        } finally {
            setOrchestratingId(null);
        }
    };

    const handleRowClick = (lead: Prospect) => {
        setSelectedProspect(lead);
        setIsModalOpen(true);
    };

    /**
     * Toggles the bot status for a specific prospect.
     * Updates both the backend runtime state and Firestore persistence.
     * Uses optimistic UI: the switch flips immediately, rolls back on error.
     *
     * @param e - Click event (stopped to prevent row modal from opening)
     * @param lead - The prospect whose bot status is being toggled
     */
    const handleBotToggle = async (e: React.MouseEvent, lead: Prospect) => {
        e.stopPropagation();
        if (togglingId) return; // Prevent concurrent toggles

        const newHelpStatus = !lead.human_help_requested;
        setTogglingId(lead.id);

        try {
            // 1. Backend API sync (runtime bot state)
            const response = await fetch(
                `${process.env.NEXT_PUBLIC_API_URL}/api/admin/reset-handoff`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Admin-API-Key': process.env.NEXT_PUBLIC_BOT_API_KEY as string
                    },
                    body: JSON.stringify({
                        phone: lead.celular,
                        status: newHelpStatus
                    })
                }
            );

            if (!response.ok) {
                throw new Error(`API Error: ${response.status} ${response.statusText}`);
            }

            // 2. Persist to Firestore
            const prospectRef = doc(db, 'prospectos', lead.id);
            await updateDoc(prospectRef, { human_help_requested: newHelpStatus });

            // 3. Feedback
            if (newHelpStatus) {
                toast.warning('✋ Modo Humano Activado', {
                    description: 'El bot está silenciado para este cliente.'
                });
            } else {
                toast.success('🤖 Bot Reactivado', {
                    description: 'El bot volverá a responder automáticamente.'
                });
            }
        } catch (error) {
            console.error('Error toggling bot status:', error);
            toast.error('Error al cambiar estado del bot', {
                description: error instanceof Error ? error.message : 'Verifica tu conexión.'
            });
        } finally {
            setTogglingId(null);
        }
    };

    /**
     * [WEB-755] CSV Export — Patrón Data URI seguro.
     * Mapea filteredLeads al string CSV con cabeceras, codifica con
     * encodeURIComponent y fuerza la descarga mediante un <a> dinámico.
     * Safe-Fallback: los campos undefined se reemplazan por cadena vacía.
     */
    const handleExportCSV = () => {
        const headers = [
            'ID', 'Nombre', 'Celular', 'Ciudad',
            'Moto Interés', 'Forma Pago', 'Ocupación',
            'Ingresos', 'Gastos', 'Datacredito', 'Vivienda',
            'Score', 'Estado', 'Habeas Data', 'Envío WA',
            'Costo IA (USD)', 'Fecha'
        ];

        const escapeCell = (val: any): string => {
            if (val == null) return '';
            const str = String(val);
            // RFC 4180: si contiene coma, salto de línea o comilla → encerrar en comillas
            if (str.includes(',') || str.includes('"') || str.includes('\n')) {
                return `"${str.replace(/"/g, '""')}"`;
            }
            return str;
        };

        const rows = filteredLeads.map(lead => [
            escapeCell(lead.id),
            escapeCell(lead.nombre),
            escapeCell(lead.celular),
            escapeCell(lead.ciudad),
            escapeCell(lead.moto_interes || lead.motivo_inscripcion),
            escapeCell(lead.forma_pago),
            escapeCell(lead.ocupacion),
            escapeCell(lead.ingresos),
            escapeCell(lead.gastos),
            escapeCell(lead.datacredito),
            escapeCell(lead.vivienda),
            escapeCell(lead.score_resultado),
            escapeCell(lead.status),
            escapeCell(lead.habeas_data ? 'Sí' : 'No'),
            escapeCell(lead.whatsapp_delivery_status),
            escapeCell(lead.session_cost_usd),
            escapeCell(lead.fecha ? formatDate(lead.fecha) : ''),
        ].join(','));

        const csv = [headers.join(','), ...rows].join('\n');
        const uri = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);

        const link = document.createElement('a');
        link.setAttribute('href', uri);
        link.setAttribute('download', `prospectos_${new Date().toISOString().slice(0, 10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        toast.success('📥 CSV exportado', {
            description: `${filteredLeads.length} prospectos descargados correctamente.`
        });
    };

    /**
     * [WEB-755] Hard Delete individual — Optimistic UI.
     * Flujo: window.confirm → deleteDoc (Firestore) → filtrar estado local.
     * No recarga la página. Si Firestore falla, restaura la fila y muestra error.
     *
     * @param e  - MouseEvent (stopPropagation evita abrir el modal de detalle)
     * @param id - ID del documento Firestore a eliminar
     */
    const handleDelete = async (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        const confirmed = window.confirm(
            '⚠️ ¿Eliminar este prospecto permanentemente? Esta acción no se puede deshacer.'
        );
        if (!confirmed) return;

        // Optimistic UI: retirar la fila inmediatamente
        const snapshot = leads.filter(l => l.id !== id);
        setLeads(snapshot);

        try {
            await deleteDoc(doc(db, 'prospectos', id));
            toast.success('🗑️ Prospecto eliminado', {
                description: 'El registro fue eliminado permanentemente de Firestore.'
            });
        } catch (error) {
            // Rollback: restaurar el lead si Firestore rechaza la operación
            console.error('[WEB-755] Error al eliminar prospecto:', error);
            setLeads(prev => {
                const deleted = leads.find(l => l.id === id);
                return deleted ? [deleted, ...prev] : prev;
            });
            toast.error('Error al eliminar', {
                description: error instanceof Error ? error.message : 'Verifica tus permisos de Firestore.'
            });
        }
    };

    const getStatusBadge = (status?: string) => {
        // [UI-HOMOLOGACION-PENDING-001] Comparación directa sin normalización legacy
        const config = STATUS_CONFIG[status ?? ''] || STATUS_CONFIG.PENDING;
        return (
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${config.color}`}>
                {config.label}
            </span>
        );
    };

    const getWhatsAppDeliveryBadge = (lead: Prospect) => {
        const status = lead.whatsapp_delivery_status;
        if (!status) return <span className="text-gray-600 text-xs">-</span>;

        let isStale = false;
        if (status === 'read' && lead.whatsapp_read_at && lead.status === 'PENDING') {
            try {
                const readAtDate = lead.whatsapp_read_at.toDate ? lead.whatsapp_read_at.toDate() : new Date(lead.whatsapp_read_at);
                const now = new Date();
                const diffMinutes = Math.floor((now.getTime() - readAtDate.getTime()) / (1000 * 60));
                if (diffMinutes > 60) {
                    isStale = true;
                }
            } catch (e) {
                // Ignore parse errors
            }
        }

        switch (status) {
            case 'sent':
                return (
                    <span className="inline-flex items-center gap-1 text-gray-400 text-xs bg-gray-800/50 px-2 py-1 rounded-md" title="Enviado">
                        <Check className="w-3 h-3" />
                        <span className="hidden sm:inline">Enviado</span>
                    </span>
                );
            case 'delivered':
                return (
                    <span className="inline-flex items-center gap-1 text-gray-300 text-xs bg-gray-800/50 px-2 py-1 rounded-md" title="Entregado">
                        <CheckCheck className="w-3 h-3" />
                        <span className="hidden sm:inline">Entregado</span>
                    </span>
                );
            case 'read':
                return (
                    <div className="flex flex-col items-center gap-1">
                        <span className="inline-flex items-center gap-1 text-blue-400 text-xs bg-blue-900/20 border border-blue-500/30 px-2 py-1 rounded-md" title="Leído">
                            <CheckCheck className="w-3 h-3" />
                            <span className="hidden sm:inline">Leído</span>
                        </span>
                        {isStale && (
                            <span className="text-orange-500 cursor-help" title="¡Atención! Visto hace más de 1 hora sin respuesta.">
                                <AlertTriangle className="w-4 h-4 animate-pulse" />
                            </span>
                        )}
                    </div>
                );
            case 'failed':
                const errorMsg = lead.whatsapp_error_details?.message || 'Error de entrega';
                return (
                    <span className="inline-flex items-center gap-1 text-red-400 text-xs bg-red-900/20 border border-red-500/30 px-2 py-1 rounded-md cursor-help" title={errorMsg}>
                        <AlertCircle className="w-3 h-3" />
                        <span className="hidden sm:inline">Falló</span>
                    </span>
                );
            default:
                return <span className="text-gray-500 text-xs">{status}</span>;
        }
    };

    /**
     * [WEB-754] Credit Score Semaphore Badge
     * Reglas de negocio:
     *   Verde  >= 700 (perfil sólido de crédito)
     *   Amarillo >= 400 (perfil condicional)
     *   Rojo   < 400  (perfil de alto riesgo)
     *   Gris   null   (sin datos de scoring)
     *
     * Safe-Fallback: nunca arroja TypeError si score_resultado es undefined.
     */
    const getScoreBadge = (score: number | undefined | null) => {
        if (score == null) {
            return (
                // [WEB-754-WCAG] Bypass Nuclear: text-gray-500 falló WCAG AA (ratio 2.71:1 < 4.5:1).
                // Inline style garantiza text-gray-300 (#d1d5db) → ratio 8.89:1 ✅ contra bg efectivo #283140.
                <span
                    className="inline-flex items-center px-2 py-0.5 rounded text-xs font-mono font-bold bg-gray-700/60 border border-gray-600/50"
                    style={{ color: '#d1d5db' }}
                    title="Sin datos de scoring"
                >
                    —
                </span>
            );
        }
        if (score >= 700) {
            return (
                <span
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-mono font-bold bg-green-500/15 text-green-400 border border-green-500/40"
                    title={`Score: ${score} — Perfil sólido`}
                >
                    <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />
                    {score}
                </span>
            );
        }
        if (score >= 400) {
            return (
                <span
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-mono font-bold bg-yellow-500/15 text-yellow-400 border border-yellow-500/40"
                    title={`Score: ${score} — Perfil condicional`}
                >
                    <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 inline-block" />
                    {score}
                </span>
            );
        }
        return (
            <span
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-mono font-bold bg-red-500/15 text-red-400 border border-red-500/40"
                title={`Score: ${score} — Alto riesgo`}
            >
                <span className="w-1.5 h-1.5 rounded-full bg-red-400 inline-block" />
                {score}
            </span>
        );
    };

    // --- RENDERIZADO ---

    if (loading) {
        return (
            <div className="flex items-center justify-center p-12 min-h-[50vh]">
                <div className="flex flex-col items-center gap-4">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-500"></div>
                    <p className="text-gray-400 animate-pulse">Cargando prospectos...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-8 text-center bg-red-900/20 border border-red-900 rounded-xl mx-4 mt-8">
                <h3 className="text-xl font-bold text-red-400 mb-2">Error de Conexión</h3>
                <p className="text-gray-300">{error}</p>
            </div>
        );
    }

    return (
        <div className="space-y-8 p-4 md:p-8 max-w-7xl mx-auto">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-white tracking-tight">Prospectos & Ventas</h1>
                    <p className="text-gray-400 mt-1">
                        Gestiona los <span className="text-white font-bold">{leads.length}</span> clientes interesados en tiempo real.
                    </p>
                </div>
                {/* [WEB-755] Exportar CSV — Patrón Data URI */}
                <button
                    onClick={handleExportCSV}
                    disabled={filteredLeads.length === 0}
                    className="inline-flex items-center gap-2 bg-gray-800 hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed border border-gray-600 text-gray-200 hover:text-white px-4 py-2 rounded-lg font-semibold text-sm transition-all shadow-md"
                    title={`Exportar ${filteredLeads.length} prospectos visibles como CSV`}
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    Exportar CSV
                    <span className="ml-1 bg-gray-700 text-gray-300 text-xs px-1.5 py-0.5 rounded-full font-mono">{filteredLeads.length}</span>
                </button>
            </div>

            {/* [ARCH-BULK-META-008] Tab Switcher — useState only, Bypass Nuclear compliant (no library) */}
            <div style={{ display: 'flex', gap: '4px', borderBottom: '1px solid #374151', paddingBottom: '0' }}>
                <button
                    onClick={() => setActiveTab('dashboard')}
                    style={{
                        padding: '10px 20px',
                        borderRadius: '8px 8px 0 0',
                        fontWeight: '700',
                        fontSize: '14px',
                        cursor: 'pointer',
                        border: 'none',
                        transition: 'all 0.15s ease',
                        background: activeTab === 'dashboard' ? '#16a34a' : '#1f2937',
                        color: activeTab === 'dashboard' ? '#ffffff' : '#9ca3af',
                    }}
                >
                    📊 Dashboard
                </button>
                <button
                    onClick={() => setActiveTab('carga_masiva')}
                    style={{
                        padding: '10px 20px',
                        borderRadius: '8px 8px 0 0',
                        fontWeight: '700',
                        fontSize: '14px',
                        cursor: 'pointer',
                        border: 'none',
                        transition: 'all 0.15s ease',
                        background: activeTab === 'carga_masiva' ? '#16a34a' : '#1f2937',
                        color: activeTab === 'carga_masiva' ? '#ffffff' : '#9ca3af',
                    }}
                >
                    📤 Carga Masiva
                </button>
                {/* [FRONTEND-ENVIO-MASIVO-TAB] Tercer tab — disparo de campañas masivas */}
                <button
                    onClick={() => setActiveTab('envio_masivo')}
                    style={{
                        padding: '10px 20px',
                        borderRadius: '8px 8px 0 0',
                        fontWeight: '700',
                        fontSize: '14px',
                        cursor: 'pointer',
                        border: 'none',
                        transition: 'all 0.15s ease',
                        background: activeTab === 'envio_masivo' ? '#7c3aed' : '#1f2937',
                        color: activeTab === 'envio_masivo' ? '#ffffff' : '#9ca3af',
                    }}
                >
                    🚀 Envío Masivo
                </button>
            </div>

            {activeTab === 'envio_masivo' ? (
                <CampaignControl />
            ) : activeTab === 'carga_masiva' ? (
                <div style={{ background: '#111827', border: '1px solid #374151', borderRadius: '16px', padding: '32px', textAlign: 'center' }}>
                    <div style={{ fontSize: '48px', marginBottom: '16px' }}>📤</div>
                    <h2 style={{ color: '#ffffff', fontWeight: '700', fontSize: '22px', marginBottom: '8px' }}>Carga Masiva de Prospectos</h2>
                    <p style={{ color: '#9ca3af', fontSize: '14px', marginBottom: '24px' }}>
                        Importa hasta 500 prospectos en lote desde un archivo CSV. Estándar UNE v7.0.2 • Contrato v2.0.0.
                    </p>
                    <button
                        onClick={() => setIsImportModalOpen(true)}
                        style={{
                            background: '#16a34a',
                            color: '#ffffff',
                            padding: '12px 32px',
                            borderRadius: '12px',
                            fontWeight: '700',
                            fontSize: '15px',
                            border: 'none',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '8px',
                        }}
                    >
                        <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                        </svg>
                        Abrir Importador CSV
                    </button>
                </div>
            ) : (
                <div className="space-y-6">
                    {/* Filter Tabs */}
                    <div className="flex overflow-x-auto pb-2 gap-2 hide-scrollbar">
                        <button
                            onClick={() => setCurrentFilter('ALL')}
                            className={`px-4 py-2 rounded-full text-sm font-medium transition-colors whitespace-nowrap
                                ${currentFilter === 'ALL'
                                    ? 'bg-white text-black'
                                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                                }`}
                        >
                            Todos
                        </button>
                        {Object.entries(STATUS_CONFIG).map(([key, config]) => (
                            <button
                                key={key}
                                onClick={() => setCurrentFilter(key)}
                                className={`px-4 py-2 rounded-full text-sm font-medium transition-colors whitespace-nowrap border
                                    ${currentFilter === key
                                        ? config.color.replace('bg-opacity-20', 'bg-opacity-100') + ' ring-1'
                                        : 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-700'
                                    }`}
                            >
                                {config.label}
                            </button>
                        ))}
                    </div>

                    {/* Empty State (Filtered) */}
                    {filteredLeads.length === 0 ? (
                        <div className="bg-gray-900/50 p-12 rounded-xl border border-gray-800 text-center">
                            <div className="text-6xl mb-4">📭</div>
                            <h3 className="text-xl font-bold text-white mb-2">No se encontraron prospectos</h3>
                            <p className="text-gray-400">Intenta cambiar el filtro o espera nuevos clientes.</p>
                        </div>
                    ) : (
                        /* Data Table Container */
                        <div className="bg-gray-900/50 rounded-xl border border-gray-800 shadow-xl overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="bg-gray-800/50 text-gray-400 text-sm uppercase tracking-wider border-b border-gray-700">
                                            <th className="p-4 font-medium">Fecha</th>
                                            <th className="p-4 font-medium">Cliente</th>
                                            <th className="p-4 font-medium">Interés</th>
                                            {/* [WEB-754] Credit Score Column */}
                                            <th className="p-4 font-medium text-center">Score</th>
                                            <th className="p-4 font-medium text-center">Bot</th>
                                            <th className="p-4 font-medium text-center">Estado</th>
                                            <th className="p-4 font-medium text-center">Envío WA</th>
                                            <th className="p-4 font-medium text-right">Acciones</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-800">
                                        {filteredLeads.map((lead) => (
                                            <tr
                                                key={lead.id}
                                                onClick={() => handleRowClick(lead)}
                                                className="hover:bg-gray-800/30 transition-colors group cursor-pointer"
                                            >
                                                {/* FECHA */}
                                                <td className="p-4 text-gray-300 whitespace-nowrap">
                                                    {formatDate(lead.fecha)}
                                                </td>

                                                {/* CLIENTE */}
                                                <td className="p-4">
                                                    <div className="flex flex-col">
                                                        <span className="font-bold text-white text-lg">{lead.nombre}</span>
                                                        <div
                                                            className="mt-1 flex items-center gap-2"
                                                            style={{
                                                                color: '#F9FAFB',
                                                                opacity: 1,
                                                                visibility: 'visible',
                                                                fontFamily: 'monospace',
                                                                fontWeight: '500',
                                                                fontSize: '13px',
                                                            }}
                                                        >
                                                            <Phone className="w-3.5 h-3.5" style={{ color: '#6b7280', flexShrink: 0 }} />
                                                            {lead.celular}
                                                        </div>
                                                    </div>
                                                </td>

                                                {/* INTERÉS — [WEB-751] Fallback canónico: moto_interes (UNE snake_case) */}
                                                <td className="p-4 text-gray-300">
                                                    {lead.moto_interes || lead.motivo_inscripcion || <span className="text-gray-600 italic">General</span>}
                                                </td>

                                                {/* [WEB-754] SCORE — Semáforo de crédito (0-1000). Safe-Fallback: muestra '—' si null */}
                                                <td className="p-4 text-center">
                                                    {getScoreBadge(lead.score_resultado)}
                                                </td>

                                                {/* BOT STATUS — Interactive Toggle */}
                                                <td className="p-4 text-center">
                                                    <button
                                                        onClick={(e) => handleBotToggle(e, lead)}
                                                        disabled={togglingId === lead.id}
                                                        className="inline-flex items-center gap-2 group/toggle disabled:opacity-50 disabled:cursor-wait"
                                                        title={lead.human_help_requested ? 'Modo Humano — Click para reactivar bot' : 'Bot Activo — Click para pausar'}
                                                    >
                                                        <div className={`relative w-10 h-5 rounded-full transition-colors duration-200 ${!lead.human_help_requested ? 'bg-green-500' : 'bg-orange-500'
                                                            }`}>
                                                            <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${!lead.human_help_requested ? 'translate-x-5' : 'translate-x-0'
                                                                }`} />
                                                        </div>
                                                        <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${!lead.human_help_requested
                                                            ? 'bg-green-500/20 text-green-400'
                                                            : 'bg-orange-500/20 text-orange-400'
                                                            }`}>
                                                            {!lead.human_help_requested ? 'IA' : 'Humano'}
                                                        </span>
                                                    </button>
                                                </td>

                                                {/* ESTADO */}
                                                <td className="p-4 text-center">
                                                    {getStatusBadge(lead.status)}
                                                </td>

                                                {/* ENVÍO WA */}
                                                <td className="p-4 text-center">
                                                    {getWhatsAppDeliveryBadge(lead)}
                                                </td>

                                                {/* ACCIONES */}
                                                <td className="p-4 text-right">
                                                    <div className="flex items-center justify-end gap-3">
                                                        <div className="flex items-center gap-2 mr-2">
                                                            {lead.doc_cedula_url && (
                                                                <a
                                                                    href={lead.doc_cedula_url}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    onClick={(e) => e.stopPropagation()}
                                                                    className="p-2 rounded-full bg-slate-800 text-blue-400 hover:bg-blue-500/20 hover:text-white transition-all"
                                                                    title="Ver Cédula"
                                                                >
                                                                    <UserRound className="w-5 h-5" />
                                                                </a>
                                                            )}
                                                            {lead.doc_recibo_gas_url && (
                                                                <a
                                                                    href={lead.doc_recibo_gas_url}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    onClick={(e) => e.stopPropagation()}
                                                                    className="p-2 rounded-full bg-slate-800 text-orange-400 hover:bg-orange-500/20 hover:text-white transition-all"
                                                                    title="Ver Recibo Gas"
                                                                >
                                                                    <Flame className="w-5 h-5" />
                                                                </a>
                                                            )}
                                                        </div>

                                                        {/* [WEB-751] Orchestrator-First Policy — detonador del backend orquestador */}
                                                        <button
                                                            onClick={(e) => handleOrchestrate(e, lead)}
                                                            disabled={orchestratingId === lead.id}
                                                            className="inline-flex items-center gap-2 bg-green-600 hover:bg-green-500 disabled:opacity-50 disabled:cursor-wait text-white px-4 py-2 rounded-lg font-bold shadow-lg transition-all transform hover:scale-105 active:scale-95"
                                                            title="Enviar mensaje vía Orquestador (no abre wa.me)"
                                                        >
                                                            {orchestratingId === lead.id ? (
                                                                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                                                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                                                                </svg>
                                                            ) : (
                                                                <>
                                                                    <span className="hidden sm:inline">WhatsApp</span>
                                                                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                                                        <path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.711 2.592 2.654-.696c1.029.56 1.77.854 3.018.855 3.19.001 5.783-2.593 5.783-5.785 0-3.193-2.591-5.79-5.783-5.79zm1.506 8.971c-.167.092-2.502 1.398-2.616 1.408-.12.012-.27.173-.41-.122-.162-.338-.857-1.579-1.256-2.274-.403-.695-.084-.666.27-.98.358-.318.514-.668.618-.95.101-.282-.124-1.293-.46-1.895-.296-.531-.692-.472-.942-.486-.296-.017-.597.051-.82.355-.262.358-1.041 1.059-1.041 2.571 0 1.512.986 2.946 1.154 3.181.166.233 2.126 3.011 4.965 4.304.773.35 1.791.439 2.515.118.598-.266 1.676-1.066 1.944-1.821.267-.754.216-1.564.127-1.761-.106-.233-.409-.327-.852-.544z" />
                                                                    </svg>
                                                                </>
                                                            )}
                                                        </button>

                                                        {/* [WEB-755] Hard Delete — Optimistic UI */}
                                                        <button
                                                            onClick={(e) => handleDelete(e, lead.id)}
                                                            className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-red-900/30 hover:bg-red-600 border border-red-700/50 hover:border-red-500 text-red-400 hover:text-white transition-all transform hover:scale-105 active:scale-95 shadow"
                                                            title="Eliminar prospecto permanentemente"
                                                        >
                                                            🗑️
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Detail Modal */}
            <ProspectModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                prospect={selectedProspect}
            />

            <BulkImportModal 
                isOpen={isImportModalOpen}
                onClose={() => setIsImportModalOpen(false)}
            />
        </div>
    );
}
