import { useState, useEffect } from 'react';
import { Timestamp, arrayUnion } from 'firebase/firestore';
import { toast } from 'sonner';
import { updateProspectAction } from '@/app/actions';

/**
 * Estructura de una nota interna en el historial del prospecto.
 */
interface Note {
    content: string;
    created_at: Timestamp;
    author: string; // 'Admin' or 'System' for now
}

/**
 * Interfaz principal del usuario/prospecto conforme al estándar UNE v7.0.0 (snake_case).
 */
export interface Prospect {
    id: string;
    // PII
    nombre: string;
    celular: string;
    ciudad?: string;

    // Compliance
    habeas_data?: boolean;
    habeas_data_sent?: boolean;

    // Funnel
    moto_interes?: string;
    moto_offered?: string;
    moto_confirmada?: boolean;
    forma_pago?: string;

    // Crédito
    ocupacion?: string;
    ingresos?: number;
    gastos?: number;
    datacredito?: string;
    vivienda?: 'Propia' | 'Familiar' | 'Arrendada' | string;
    servicios_publicos?: boolean;
    plan_celular?: boolean;

    // Simulación
    cuota_simulada?: number;
    plazo_simulado?: number;
    score_resultado?: number;
    entidad_simulada?: string;

    // Metadatos y Gestión
    fecha: Timestamp; // internal timestamp of creation
    updated_at?: Timestamp;
    status?: 'PENDING' | 'IN_PROGRESS' | 'DONE' | 'DISCARDED';
    ai_summary?: string;
    notes?: Note[];
    human_help_requested?: boolean;
    doc_cedula_url?: string;
    doc_recibo_gas_url?: string;
    [key: string]: any;
}

interface ProspectModalProps {
    isOpen: boolean;
    onClose: () => void;
    prospect: Prospect | null;
}

// Status Configuration Map
const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
    PENDING: { label: 'Pendientes', color: 'bg-amber-500/20 text-amber-500 border-amber-500/50' },
    IN_PROGRESS: { label: 'En Gestión', color: 'bg-blue-500/20 text-blue-500 border-blue-500/50' },
    DONE: { label: 'Venta Cerrada', color: 'bg-green-500/20 text-green-500 border-green-500/50' },
    DISCARDED: { label: 'Descartados', color: 'bg-gray-500/20 text-gray-400 border-gray-500/50' },
};

/**
 * ProspectModal Component
 * 
 * Modal para la gestión detallada de un prospecto. Permite:
 * 1. Cambiar el estado del lead (Pendiente, Gestión, Venta, Descartado).
 * 2. Visualizar y agregar notas internas al historial.
 * 3. Ver el resumen generado por IA (si existe).
 * 
 * @param isOpen - Controla la visibilidad del modal.
 * @param onClose - Función para cerrar el modal.
 * @param prospect - Objeto prospecto seleccionado.
 */
export default function ProspectModal({ isOpen, onClose, prospect }: ProspectModalProps) {
    const [isSaving, setIsSaving] = useState(false);
    const [newNote, setNewNote] = useState('');
    
    // Form State (Internal copy for editing)
    const [formData, setFormData] = useState<Partial<Prospect>>({});
    const [isEditing, setIsEditing] = useState(false);

    // Sync local state when prospect opens
    useEffect(() => {
        if (prospect) {
            setFormData({ ...prospect });
            setIsEditing(false);
        }
    }, [prospect]);

    if (!isOpen || !prospect) return null;

    const handleSaveGeneral = async () => {
        if (!prospect) return;
        setIsSaving(true);
        try {
            // Estructura Mandatoria UNE v7.0.1 (JSON Voorhees)
            const payload = {
                document_id: prospect.id,
                updates: {
                    nombre: formData.nombre?.substring(0, 50),
                    ciudad: formData.ciudad?.substring(0, 50),
                    moto_interes: formData.moto_interes,
                    moto_offered: formData.moto_offered,
                    moto_confirmada: formData.moto_confirmada,
                    forma_pago: formData.forma_pago,
                    status: formData.status,
                    ocupacion: formData.ocupacion,
                    ingresos: Number(formData.ingresos) || 0,
                    gastos: Number(formData.gastos) || 0,
                    datacredito: formData.datacredito,
                    vivienda: formData.vivienda,
                    // [UNE v7.0.2] Coercive casting Boolean -> String ("Si" / "No")
                    servicios_publicos: formData.servicios_publicos ? "Si" : "No",
                    plan_celular: formData.plan_celular ? "Si" : "No",
                    habeas_data: formData.habeas_data,
                    habeas_data_sent: formData.habeas_data_sent,
                    chatbot_status: formData.human_help_requested ? "PAUSED" : "ACTIVE",
                    plazo_simulado: 24, // MANDATORIO v7.0.1
                    entidad_simulada: "Crediorbe" // MANDATORIO v7.0.1
                }
            };

            const result = await updateProspectAction(payload);
            
            if (result.success) {
                toast.success('Cambios guardados correctamente');
                setIsEditing(false);
            } else {
                throw new Error(result.message);
            }
        } catch (error: any) {
            console.error("Error saving prospect details:", error);
            toast.error('Error al guardar cambios', { description: error.message });
        } finally {
            setIsSaving(false);
        }
    };

    const handleStatusChange = (newStatus: any) => {
        setFormData(prev => ({ ...prev, status: newStatus }));
        if (!isEditing) {
            // Actualización asíncrona v7.0.1
            updateProspectAction({ 
                document_id: prospect!.id, 
                updates: { 
                    status: newStatus,
                    plazo_simulado: 24, 
                    entidad_simulada: "Crediorbe" 
                } 
            });
        }
    };

    const handleAddNote = async () => {
        if (!newNote.trim()) return;
        setIsSaving(true);
        try {
            const note: Note = {
                content: newNote.trim(),
                created_at: Timestamp.now(),
                author: 'Admin'
            };

            const result = await updateProspectAction({
                document_id: prospect.id,
                updates: {
                    notes: arrayUnion(note),
                    plazo_simulado: 24,
                    entidad_simulada: "Crediorbe"
                }
            } as any);

            if (!result.success) throw new Error(result.message);

            setFormData(prev => ({ 
                ...prev, 
                notes: [note, ...(prev.notes || [])] 
            }));
            setNewNote('');
        } catch (error) {
            console.error("Error adding note:", error);
            alert("Error al agregar nota");
        } finally {
            setIsSaving(false);
        }
    };

    /**
     * Reactivates the bot by calling the backend API and updating Firestore.
     * Toggles the human_help_requested flag.
     */
    const handleBotReactivation = async () => {
        if (!prospect) return;
        const newHelpStatus = !formData.human_help_requested;
        setIsSaving(true);

        try {
            // 1. Call Backend API to reset handoff
            const response = await fetch('https://bot-tiendalasmotos-467812260261.us-central1.run.app/api/admin/reset-handoff', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Admin-API-Key': 'moto_master_2026'
                },
                body: JSON.stringify({
                    phone: prospect.celular,
                    status: newHelpStatus
                })
            });

            if (!response.ok) {
                throw new Error(`API Error: ${response.status} ${response.statusText}`);
            }

            // 2. Update via Server Action (v7.0.1)
            const result = await updateProspectAction({
                document_id: prospect.id,
                updates: {
                    chatbot_status: newHelpStatus ? "PAUSED" : "ACTIVE",
                    plazo_simulado: 24,
                    entidad_simulada: "Crediorbe"
                }
            });

            if (!result.success) throw new Error(result.message);

            // 3. Update local state
            setFormData(prev => ({ ...prev, human_help_requested: newHelpStatus }));

            // 4. Show success feedback
            if (newHelpStatus) {
                toast.success('✋ Modo Humano Activado', {
                    description: 'El bot está silenciado para este cliente.'
                });
            } else {
                toast.success('🤖 Bot Reactivado', {
                    description: 'El bot volverá a responder automáticamente.'
                });
            }

        } catch (error) {
            console.error("Error toggling bot status:", error);
            toast.error('Error al cambiar estado del bot', {
                description: error instanceof Error ? error.message : 'Verifica tu conexión e intenta nuevamente.'
            });
        } finally {
            setIsSaving(false);
        }
    };

    const formatDate = (timestamp: any) => {
        if (!timestamp) return 'Fecha no disponible';
        try {
            const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
            return date.toLocaleString('es-CO', {
                day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
            });
        } catch (e) {
            return 'Fecha inválida';
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl">

                {/* Header */}
                <div className="p-6 border-b border-gray-800 flex justify-between items-start sticky top-0 bg-gray-900 z-10">
                    <div>
                        <h2 className="text-2xl font-bold text-white">{prospect.nombre}</h2>
                        <div className="flex flex-col gap-1 mt-1">
                            <span className="flex items-center gap-2 text-white font-medium">📱 {prospect.celular}</span>
                            {(prospect.moto_interes || prospect.moto_interest) && (
                                <span className="flex items-center gap-2">
                                    🏍️ Interés: <b className="text-blue-400">{prospect.moto_interes || prospect.moto_interest}</b>
                                </span>
                            )}
                            <span className="text-xs italic">🕒 {formatDate(prospect.fecha)}</span>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => isEditing ? handleSaveGeneral() : setIsEditing(true)}
                            disabled={isSaving}
                            className={`px-4 py-1.5 rounded-lg text-sm font-bold transition-all ${
                                isEditing 
                                ? 'bg-green-600 hover:bg-green-500 text-white shadow-lg shadow-green-900/20' 
                                : 'bg-blue-600/20 text-blue-400 border border-blue-500/50 hover:bg-blue-500/20'
                            }`}
                        >
                            {isSaving ? 'Guardando...' : (isEditing ? 'Guardar Cambios' : 'Editar Datos')}
                        </button>
                        <button
                            onClick={onClose}
                            className="text-gray-500 hover:text-white transition-colors p-2"
                            aria-label="Cerrar modal"
                        >
                            ✕
                        </button>
                    </div>
                </div>

                <div className="p-6 space-y-8">

                    {/* Basic Info & Funnel */}
                    <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-4">
                            <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider">Información PII</h3>
                            <div className="space-y-3">
                                <div>
                                    <label className="text-xs text-gray-500 block mb-1">Nombre Completo (max 50)</label>
                                    <input 
                                        type="text"
                                        disabled={!isEditing}
                                        value={formData.nombre || ''}
                                        onChange={(e) => setFormData({...formData, nombre: e.target.value})}
                                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white disabled:opacity-70"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs text-gray-500 block mb-1">Ciudad</label>
                                    <input 
                                        type="text"
                                        disabled={!isEditing}
                                        value={formData.ciudad || ''}
                                        onChange={(e) => setFormData({...formData, ciudad: e.target.value})}
                                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white disabled:opacity-70"
                                    />
                                </div>
                            </div>
                        </div>
                        <div className="space-y-4">
                            <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider">Embudo (Funnel)</h3>
                            <div className="space-y-3">
                                <div>
                                    <label className="text-xs text-gray-500 block mb-1">Moto de Interés</label>
                                    <input 
                                        type="text"
                                        disabled={!isEditing}
                                        value={formData.moto_interes || formData.moto_interest || ''}
                                        onChange={(e) => setFormData({...formData, moto_interes: e.target.value})}
                                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white disabled:opacity-70"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs text-gray-500 block mb-1">Forma de Pago</label>
                                    <select 
                                        disabled={!isEditing}
                                        value={formData.forma_pago || ''}
                                        onChange={(e) => setFormData({...formData, forma_pago: e.target.value})}
                                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white disabled:opacity-70"
                                    >
                                        <option value="">Seleccionar...</option>
                                        <option value="Crédito">Crédito</option>
                                        <option value="Contado">Contado</option>
                                        <option value="Retoma">Retoma (Parte de pago)</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* Financiación Detail */}
                    <section className="bg-gray-800/30 border border-gray-700 rounded-xl p-5">
                        <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                            💰 Perfil Crediticio
                        </h3>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <div>
                                <label className="text-xs text-gray-500 block mb-1">Ocupación</label>
                                <select 
                                    disabled={!isEditing}
                                    value={formData.ocupacion || ''}
                                    onChange={(e) => setFormData({...formData, ocupacion: e.target.value})}
                                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm"
                                >
                                    <option value="">Seleccionar...</option>
                                    <option value="Empleado">Empleado</option>
                                    <option value="Independiente">Independiente</option>
                                    <option value="Pensionado">Pensionado</option>
                                    <option value="Estudiante">Estudiante</option>
                                    <option value="Hogar">Hogar</option>
                                </select>
                            </div>
                            <div>
                                <label className="text-xs text-gray-500 block mb-1">Vivienda</label>
                                <select 
                                    disabled={!isEditing}
                                    value={formData.vivienda || ''}
                                    onChange={(e) => setFormData({...formData, vivienda: e.target.value as any})}
                                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm"
                                >
                                    <option value="">Seleccionar...</option>
                                    <option value="Propia">Propia</option>
                                    <option value="Familiar">Familiar</option>
                                    <option value="Arrendada">Arrendada</option>
                                </select>
                            </div>
                            <div>
                                <label className="text-xs text-gray-500 block mb-1">Datacrédito (Score/Estado)</label>
                                <input 
                                    type="text"
                                    disabled={!isEditing}
                                    placeholder="Ej: Bueno / 650+"
                                    value={formData.datacredito || ''}
                                    onChange={(e) => setFormData({...formData, datacredito: e.target.value})}
                                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm"
                                />
                            </div>
                            <div>
                                <label className="text-xs text-gray-500 block mb-1">Ingresos</label>
                                <input 
                                    type="number"
                                    disabled={!isEditing}
                                    value={formData.ingresos || ''}
                                    onChange={(e) => setFormData({...formData, ingresos: Number(e.target.value)})}
                                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm"
                                />
                            </div>
                            <div>
                                <label className="text-xs text-gray-500 block mb-1">Gastos</label>
                                <input 
                                    type="number"
                                    disabled={!isEditing}
                                    value={formData.gastos || ''}
                                    onChange={(e) => setFormData({...formData, gastos: Number(e.target.value)})}
                                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm"
                                />
                            </div>
                            <div className="flex items-center gap-4 pt-6">
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input 
                                        type="checkbox"
                                        disabled={!isEditing}
                                        checked={!!formData.servicios_publicos}
                                        onChange={(e) => setFormData({...formData, servicios_publicos: e.target.checked})}
                                        className="w-4 h-4 rounded bg-gray-900 border-gray-700 text-green-500 focus:ring-green-500"
                                    />
                                    <span className="text-xs text-gray-400">Recibo Gas?</span>
                                </label>
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input 
                                        type="checkbox"
                                        disabled={!isEditing}
                                        checked={!!formData.plan_celular}
                                        onChange={(e) => setFormData({...formData, plan_celular: e.target.checked})}
                                        className="w-4 h-4 rounded bg-gray-900 border-gray-700 text-green-500 focus:ring-green-500"
                                    />
                                    <span className="text-xs text-gray-400">Plan Celular?</span>
                                </label>
                            </div>
                        </div>
                    </section>

                    {/* Status Section */}
                    <section>
                        <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3">Estado del Prospecto</h3>
                        <div className="flex flex-wrap gap-2">
                            {Object.entries(STATUS_CONFIG).map(([key, config]) => (
                                <button
                                    key={key}
                                    onClick={() => handleStatusChange(key)}
                                    disabled={isSaving}
                                    className={`
                    px-4 py-2 rounded-lg border font-medium transition-all
                    ${(formData.status || 'PENDING') === key
                                            ? config.color + ' ring-2 ring-offset-2 ring-offset-gray-900 ring-gray-700'
                                            : 'bg-gray-800 text-gray-400 border-gray-700 hover:bg-gray-700'
                                        }
                  `}
                                >
                                    {config.label}
                                </button>
                            ))}
                        </div>
                    </section>

                    {/* Bot Status Section */}
                    <section>
                        <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3">Estado del Bot</h3>
                        <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <span className="text-2xl">{formData.human_help_requested ? '✋' : '🤖'}</span>
                                    <div>
                                        <p className="font-bold text-white">
                                            {formData.human_help_requested ? 'Modo Humano Activo' : 'Bot Activo'}
                                        </p>
                                        <p className="text-sm text-gray-400">
                                            {formData.human_help_requested
                                                ? 'El bot está silenciado. Un humano debe responder.'
                                                : 'El bot responde automáticamente a este cliente.'}
                                        </p>
                                    </div>
                                </div>
                                <button
                                    onClick={handleBotReactivation}
                                    disabled={isSaving}
                                    className={`
                                        px-4 py-2 rounded-lg font-medium transition-all
                                        ${formData.human_help_requested
                                            ? 'bg-green-600 hover:bg-green-500 text-white'
                                            : 'bg-amber-600 hover:bg-amber-500 text-white'}
                                        disabled:opacity-50 disabled:cursor-not-allowed
                                    `}
                                >
                                    {isSaving ? 'Guardando...' : (formData.human_help_requested ? 'Reactivar Bot' : 'Solicitar Humano')}
                                </button>
                            </div>
                        </div>
                    </section>

                    {/* AI Analysis Section */}
                    <section className="bg-indigo-900/20 border border-indigo-500/30 rounded-xl p-4">
                        <h3 className="flex items-center gap-2 text-sm font-bold text-indigo-400 uppercase tracking-wider mb-2">
                            🤖 Análisis del Bot
                        </h3>
                        <p className="text-gray-300 text-sm leading-relaxed">
                            {prospect.ai_summary || "Esperando primera interacción del bot..."}
                        </p>
                    </section>

                    {/* Expediente de Crédito Brilla - Document Section */}
                    <section className="bg-slate-800/40 border border-slate-700 rounded-xl p-5">
                        <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                            📄 Expediente de Crédito Brilla
                        </h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                            {/* Cédula */}
                            <div className="space-y-3">
                                <p className="text-xs font-semibold text-slate-500 uppercase tracking-tight">Documento de Identidad</p>
                                {prospect.doc_cedula_url ? (
                                    <div className="group relative">
                                        <a href={prospect.doc_cedula_url} target="_blank" rel="noopener noreferrer" className="block">
                                            <img
                                                src={prospect.doc_cedula_url}
                                                alt="Previsualización Cédula"
                                                className="h-24 w-full object-cover rounded-lg border-2 border-slate-600 cursor-zoom-in transition-all group-hover:border-blue-400"
                                            />
                                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-lg">
                                                <span className="text-white text-xs font-bold bg-blue-600 px-2 py-1 rounded">Ver pantalla completa</span>
                                            </div>
                                        </a>
                                        <a 
                                            href={prospect.doc_cedula_url} 
                                            target="_blank" 
                                            className="mt-2 inline-flex items-center text-xs text-blue-400 hover:text-blue-300 font-medium"
                                        >
                                            📥 Descargar Cédula
                                        </a>
                                    </div>
                                ) : (
                                    <div className="h-24 flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-700 bg-slate-900/50 text-slate-500 italic text-xs">
                                        <span>Pendiente</span>
                                        <span className="text-lg mt-1">❌</span>
                                    </div>
                                )}
                            </div>

                            {/* Recibo de Gas */}
                            <div className="space-y-3">
                                <p className="text-xs font-semibold text-slate-500 uppercase tracking-tight">Recibo de Gas</p>
                                {prospect.doc_recibo_gas_url ? (
                                    <div className="group relative">
                                        <a href={prospect.doc_recibo_gas_url} target="_blank" rel="noopener noreferrer" className="block">
                                            <img
                                                src={prospect.doc_recibo_gas_url}
                                                alt="Previsualización Recibo Gas"
                                                className="h-24 w-full object-cover rounded-lg border-2 border-slate-600 cursor-zoom-in transition-all group-hover:border-orange-400"
                                            />
                                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-lg">
                                                <span className="text-white text-xs font-bold bg-orange-600 px-2 py-1 rounded">Ver pantalla completa</span>
                                            </div>
                                        </a>
                                        <a 
                                            href={prospect.doc_recibo_gas_url} 
                                            target="_blank" 
                                            className="mt-2 inline-flex items-center text-xs text-orange-400 hover:text-orange-300 font-medium"
                                        >
                                            📥 Descargar Recibo
                                        </a>
                                    </div>
                                ) : (
                                    <div className="h-24 flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-700 bg-slate-900/50 text-slate-500 italic text-xs">
                                        <span>Pendiente</span>
                                        <span className="text-lg mt-1">❌</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    </section>

                    {/* Notes Section */}
                    <section>
                        <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3">Historial de Notas</h3>

                        {/* Input */}
                        <div className="flex gap-2 mb-6">
                            <input
                                type="text"
                                value={newNote}
                                onChange={(e) => setNewNote(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleAddNote()}
                                placeholder="Escribe una nota interna..."
                                className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-green-500"
                            />
                            <button
                                onClick={handleAddNote}
                                disabled={!newNote.trim() || isSaving}
                                className="bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white px-4 py-2 rounded-lg font-medium transition-colors"
                            >
                                Guardar
                            </button>
                        </div>

                        {/* List */}
                        <div className="space-y-4 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
                            {(formData.notes || []).length === 0 ? (
                                <p className="text-center text-gray-600 italic py-4">No hay notas registradas</p>
                            ) : (
                                (formData.notes || []).map((note, index) => (
                                    <div key={index} className="bg-gray-800/50 rounded-lg p-3 border border-gray-700/50">
                                        <p className="text-gray-200 mb-1">{note.content}</p>
                                        <div className="flex justify-between items-center text-xs text-gray-500">
                                            <span>{note.author}</span>
                                            <span>{formatDate(note.created_at)}</span>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </section>

                </div>
            </div>
        </div>
    );
}
