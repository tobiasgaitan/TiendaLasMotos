'use client';

import { useEffect, useState } from 'react';
import { collection, query, orderBy, onSnapshot, Timestamp, doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { toast } from 'sonner';
import ProspectModal, { Prospect } from '@/components/admin/ProspectModal';

// Status Configuration Map (Must match Modal)
const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
    PENDING: { label: 'Pendientes', color: 'bg-amber-500/20 text-amber-500 border-amber-500/50' },
    IN_PROGRESS: { label: 'En Gestión', color: 'bg-blue-500/20 text-blue-500 border-blue-500/50' },
    DONE: { label: 'Venta Cerrada', color: 'bg-green-500/20 text-green-500 border-green-500/50' },
    DISCARDED: { label: 'Descartados', color: 'bg-gray-500/20 text-gray-400 border-gray-500/50' },
};

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
    const [togglingId, setTogglingId] = useState<string | null>(null);

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

    // Filter Logic
    useEffect(() => {
        if (currentFilter === 'ALL') {
            setFilteredLeads(leads);
        } else {
            setFilteredLeads(leads.filter(lead => {
                const status = lead.status || 'PENDING'; // Default to PENDING if undefined
                return status === currentFilter;
            }));
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
     * Construye y abre el enlace de WhatsApp
     */
    const handleWhatsAppClick = (e: React.MouseEvent, lead: Prospect) => {
        e.stopPropagation(); // Prevent opening modal
        const interes = lead.motoInteres || lead.motivo_inscripcion || "nuestras motos";
        const message = `Hola ${lead.nombre}, vi que te interesaste en la ${interes}, ¿cómo puedo ayudarte hoy?`;

        const encodedMessage = encodeURIComponent(message);
        const url = `https://wa.me/${lead.celular}?text=${encodedMessage}`;

        window.open(url, '_blank', 'noopener,noreferrer');
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
                'https://bot-tiendalasmotos-467812260261.us-central1.run.app/api/admin/reset-handoff',
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Admin-API-Key': 'moto_master_2026'
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

    const getStatusBadge = (status?: string) => {
        const key = status || 'PENDING';
        const config = STATUS_CONFIG[key] || STATUS_CONFIG.PENDING;
        return (
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${config.color}`}>
                {config.label}
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
            <div>
                <h1 className="text-3xl font-bold text-white tracking-tight">Prospectos & Ventas</h1>
                <p className="text-gray-400 mt-1">
                    Gestiona los <span className="text-white font-bold">{leads.length}</span> clientes interesados en tiempo real.
                </p>
            </div>

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
                                    <th className="p-4 font-medium text-center">Bot</th>
                                    <th className="p-4 font-medium text-center">Estado</th>
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
                                                <span className="text-sm text-gray-500 font-mono tracking-wide">
                                                    {lead.celular}
                                                </span>
                                            </div>
                                        </td>

                                        {/* INTERÉS */}
                                        <td className="p-4 text-gray-300">
                                            {lead.motoInteres || lead.motivo_inscripcion || <span className="text-gray-600 italic">General</span>}
                                        </td>

                                        {/* BOT STATUS — Interactive Toggle */}
                                        <td className="p-4 text-center">
                                            <button
                                                onClick={(e) => handleBotToggle(e, lead)}
                                                disabled={togglingId === lead.id}
                                                className="inline-flex items-center gap-2 group/toggle disabled:opacity-50 disabled:cursor-wait"
                                                title={lead.human_help_requested ? 'Modo Humano — Click para reactivar bot' : 'Bot Activo — Click para pausar'}
                                            >
                                                {/* CSS Toggle Track */}
                                                <div className={`relative w-10 h-5 rounded-full transition-colors duration-200 ${!lead.human_help_requested ? 'bg-green-500' : 'bg-orange-500'
                                                    }`}>
                                                    <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${!lead.human_help_requested ? 'translate-x-5' : 'translate-x-0'
                                                        }`} />
                                                </div>
                                                {/* Status Badge */}
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

                                        {/* ACCIONES */}
                                        <td className="p-4 text-right">
                                            <button
                                                onClick={(e) => handleWhatsAppClick(e, lead)}
                                                className="
                                                    inline-flex items-center gap-2 
                                                    bg-green-600 hover:bg-green-500 text-white 
                                                    px-4 py-2 rounded-lg font-bold shadow-lg 
                                                    transition-all transform hover:scale-105 active:scale-95
                                                "
                                            >
                                                <span>WhatsApp</span>
                                                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                                    <path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.711 2.592 2.654-.696c1.029.56 1.77.854 3.018.855 3.19.001 5.783-2.593 5.783-5.785 0-3.193-2.591-5.79-5.783-5.79zm1.506 8.971c-.167.092-2.502 1.398-2.616 1.408-.12.012-.27.173-.41-.122-.162-.338-.857-1.579-1.256-2.274-.403-.695-.084-.666.27-.98.358-.318.514-.668.618-.95.101-.282-.124-1.293-.46-1.895-.296-.531-.692-.472-.942-.486-.296-.017-.597.051-.82.355-.262.358-1.041 1.059-1.041 2.571 0 1.512.986 2.946 1.154 3.181.166.233 2.126 3.011 4.965 4.304.773.35 1.791.439 2.515.118.598-.266 1.676-1.066 1.944-1.821.267-.754.216-1.564.127-1.761-.106-.233-.409-.327-.852-.544z" />
                                                </svg>
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Detail Modal */}
            <ProspectModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                prospect={selectedProspect}
            />
        </div>
    );
}
