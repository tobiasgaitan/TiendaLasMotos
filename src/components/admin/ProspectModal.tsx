import React, { useState, useEffect } from 'react';
import { Timestamp, updateDoc, doc, arrayUnion } from 'firebase/firestore';
import { db } from '@/lib/firebase';

/**
 * Estructura de una nota interna en el historial del prospecto.
 */
interface Note {
    content: string;
    createdAt: Timestamp;
    author: string; // 'Admin' or 'System' for now
}

/**
 * Interfaz principal del usuario/prospecto.
 * Extiende la interfaz base usada en la lista para incluir arrays de notas.
 */
export interface Prospect {
    id: string;
    nombre: string;
    celular: string;
    motoInteres?: string;
    motivo_inscripcion?: string;
    fecha: Timestamp;
    chatbot_status?: string; // Legacy
    status?: 'PENDING' | 'IN_PROGRESS' | 'DONE' | 'DISCARDED'; // Main status field
    ai_summary?: string;
    notes?: Note[];
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
    const [currentStatus, setCurrentStatus] = useState<string>('PENDING');
    const [newNote, setNewNote] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [notesHistory, setNotesHistory] = useState<Note[]>([]);

    // Sync local state when prospect opens
    useEffect(() => {
        if (prospect) {
            setCurrentStatus(prospect.status || 'PENDING');
            setNotesHistory(prospect.notes || []);
        }
    }, [prospect]);

    if (!isOpen || !prospect) return null;

    const handleStatusChange = async (newStatus: string) => {
        setIsSaving(true);
        try {
            const prospectRef = doc(db, 'prospectos', prospect.id);
            await updateDoc(prospectRef, {
                status: newStatus
            });
            setCurrentStatus(newStatus);
        } catch (error) {
            console.error("Error updating status:", error);
            alert("Error al actualizar estado");
        } finally {
            setIsSaving(false);
        }
    };

    const handleAddNote = async () => {
        if (!newNote.trim()) return;
        setIsSaving(true);
        try {
            const note: Note = {
                content: newNote.trim(),
                createdAt: Timestamp.now(),
                author: 'Admin'
            };

            const prospectRef = doc(db, 'prospectos', prospect.id);
            await updateDoc(prospectRef, {
                notes: arrayUnion(note)
            });

            setNotesHistory(prev => [note, ...prev]); // Optimistic update
            setNewNote('');
        } catch (error) {
            console.error("Error adding note:", error);
            alert("Error al agregar nota");
        } finally {
            setIsSaving(false);
        }
    };

    const formatDate = (timestamp: Timestamp) => {
        if (!timestamp) return 'Fecha no disponible';
        try {
            // Check if it's a Firestore Timestamp
            if (timestamp.toDate) {
                return timestamp.toDate().toLocaleString('es-CO', {
                    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
                });
            }
            // Fallback if somehow date is different
            return 'Fecha inválida';
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
                        <div className="flex items-center gap-3 mt-1 text-gray-400">
                            <span>📱 {prospect.celular}</span>
                            <span>•</span>
                            <span>{formatDate(prospect.fecha)}</span>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-gray-500 hover:text-white transition-colors"
                    >
                        ✕
                    </button>
                </div>

                <div className="p-6 space-y-8">

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
                    ${currentStatus === key
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

                    {/* AI Analysis Section */}
                    <section className="bg-indigo-900/20 border border-indigo-500/30 rounded-xl p-4">
                        <h3 className="flex items-center gap-2 text-sm font-bold text-indigo-400 uppercase tracking-wider mb-2">
                            🤖 Análisis del Bot
                        </h3>
                        <p className="text-gray-300 text-sm leading-relaxed">
                            {prospect.ai_summary || "Esperando primera interacción del bot..."}
                        </p>
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
                            {notesHistory.length === 0 ? (
                                <p className="text-center text-gray-600 italic py-4">No hay notas registradas</p>
                            ) : (
                                notesHistory.map((note, index) => (
                                    <div key={index} className="bg-gray-800/50 rounded-lg p-3 border border-gray-700/50">
                                        <p className="text-gray-200 mb-1">{note.content}</p>
                                        <div className="flex justify-between items-center text-xs text-gray-500">
                                            <span>{note.author}</span>
                                            <span>{formatDate(note.createdAt)}</span>
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
