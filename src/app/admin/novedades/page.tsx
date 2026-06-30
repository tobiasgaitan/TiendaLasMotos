'use client';

import { useEffect, useState } from 'react';
import { collection, query, orderBy, onSnapshot, doc, deleteDoc, writeBatch, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { toast } from 'sonner';
import { 
    Bell, 
    ShieldAlert, 
    Trash2, 
    Calendar, 
    User, 
    Search, 
    RefreshCw, 
    AlertCircle, 
    AlertTriangle, 
    Info,
    CheckCircle,
    Terminal
} from 'lucide-react';
import AnomaliesBanner, { Anomaly } from '@/components/admin/AnomaliesBanner';

/**
 * NovedadesPage - Panel Administrativo de Auditoría y Anomalías
 * 
 * Monitorea en tiempo real la colección "anomalias" en Firestore,
 * la cual registra desajustes del catálogo detectados durante las búsquedas
 * del cliente. Permite filtrar, revisar el historial completo y depurar reportes.
 */
export default function NovedadesPage() {
    const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // States de filtro
    const [searchTerm, setSearchTerm] = useState('');
    const [severityFilter, setSeverityFilter] = useState<string>('all');
    const [clearing, setClearing] = useState(false);

    // 1. Escucha reactiva en tiempo real sobre la colección de Firestore "anomalias"
    useEffect(() => {
        setLoading(true);
        setError(null);
        let unsubscribe = () => {};

        try {
            const q = query(
                collection(db, 'anomalias'),
                orderBy('fecha', 'desc')
            );

            unsubscribe = onSnapshot(
                q,
                (snapshot) => {
                    const data = snapshot.docs.map((doc) => ({
                        id: doc.id,
                        ...doc.data()
                    } as Anomaly));
                    setAnomalies(data);
                    setLoading(false);
                },
                (err: any) => {
                    // ZERO-SILENT-FAILURES: Log forense obligatorio del error original
                    console.error('[FORENSIC ERROR] Failed to subscribe to collection "anomalias":', err);
                    setError('Error al conectar con la base de datos de auditoría.');
                    toast.error('Error al cargar novedades en tiempo real', {
                        description: err?.message || 'Permisos insuficientes o fallo de red.'
                    });
                    setLoading(false);
                }
            );
        } catch (err: any) {
            // ZERO-SILENT-FAILURES: Captura del error de inicialización
            console.error('[FORENSIC ERROR] Synchronous catch in onSnapshot initialization:', err);
            setError('Error de inicialización del listener de auditoría.');
            setLoading(false);
        }

        return () => unsubscribe();
    }, []);

    // Formateador de fechas de Firestore
    const formatTimestamp = (timestamp: any) => {
        if (!timestamp) return 'N/A';
        try {
            const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
            return date.toLocaleString('es-CO', {
                dateStyle: 'medium',
                timeStyle: 'medium'
            });
        } catch (err: any) {
            console.error('[FORENSIC ERROR] Failed to parse timestamp field:', err);
            return 'Fecha inválida';
        }
    };

    // Descartar/Eliminar una anomalía individual de Firestore
    const handleDismiss = async (id: string) => {
        try {
            await deleteDoc(doc(db, 'anomalias', id));
            toast.success('Reporte de anomalía descartado correctamente');
        } catch (err: any) {
            // ZERO-SILENT-FAILURES: Registro del fallo con metadatos del ID
            console.error(`[FORENSIC ERROR] Failed to delete anomaly with ID ${id}:`, err);
            toast.error('Error al descartar la anomalía', {
                description: err?.message || 'Fallo de escritura en Firestore.'
            });
        }
    };

    // Limpiar todos los reportes de anomalías (Borrado en lote)
    const handleClearAll = async () => {
        if (anomalies.length === 0) return;
        if (!confirm('¿Está seguro de que desea eliminar todos los reportes de novedades e inconsistencias registrados? Esta acción no se puede deshacer.')) {
            return;
        }

        setClearing(true);
        try {
            const batch = writeBatch(db);
            const querySnapshot = await getDocs(collection(db, 'anomalias'));
            
            querySnapshot.docs.forEach((docSnap) => {
                batch.delete(docSnap.ref);
            });

            await batch.commit();
            toast.success('Todos los reportes de auditoría han sido depurados');
        } catch (err: any) {
            // ZERO-SILENT-FAILURES: Registro de error de lote completo
            console.error('[FORENSIC ERROR] Failed to execute batch delete on "anomalias":', err);
            toast.error('Fallo en la depuración masiva de reportes', {
                description: err?.message || 'Fallo de escritura en lote.'
            });
        } finally {
            setClearing(false);
        }
    };

    // Filtrar la lista local según los criterios ingresados
    const filteredAnomalies = anomalies.filter((a) => {
        const matchesSearch = 
            (a.message?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
            (a.query?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
            (a.user_id?.toLowerCase() || '').includes(searchTerm.toLowerCase());

        const matchesSeverity = 
            severityFilter === 'all' || 
            (a.severity?.toLowerCase() || '') === severityFilter.toLowerCase();

        return matchesSearch && matchesSeverity;
    });

    // Conteos rápidos para las métricas superiores
    const criticalCount = anomalies.filter(a => a.severity?.toLowerCase() === 'critical').length;
    const warningCount = anomalies.filter(a => a.severity?.toLowerCase() === 'warning').length;
    const infoCount = anomalies.filter(a => a.severity?.toLowerCase() !== 'critical' && a.severity?.toLowerCase() !== 'warning').length;

    return (
        <div className="space-y-8 p-4 md:p-8 max-w-7xl mx-auto">
            {/* Header de la Sección */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-800 pb-6">
                <div className="flex items-center gap-3">
                    <div className="p-3 bg-purple-900/30 border border-purple-800/50 rounded-xl text-purple-400 animate-pulse">
                        <Bell size={28} />
                    </div>
                    <div>
                        <h1 className="text-3xl font-extrabold text-white tracking-tight">Centro de Reportes & Novedades</h1>
                        <p className="text-gray-400 mt-1">
                            Auditoría de consistencia de catálogo e inconsistencias críticas en tiempo real.
                        </p>
                    </div>
                </div>

                {anomalies.length > 0 && (
                    <button
                        onClick={handleClearAll}
                        disabled={clearing}
                        className="inline-flex items-center gap-2 bg-red-950/40 hover:bg-red-900/50 text-red-300 border border-red-800 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all disabled:opacity-50"
                    >
                        <Trash2 size={16} />
                        Depurar Historial ({anomalies.length})
                    </button>
                )}
            </div>

            {/* MÓDULO DE MÉTRICAS */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-gray-900/50 border border-gray-800 p-5 rounded-2xl flex flex-col justify-between">
                    <span className="text-gray-400 text-xs font-bold uppercase tracking-wider">Reportes Totales</span>
                    <span className="text-3xl font-extrabold text-white mt-2 font-mono">{anomalies.length}</span>
                </div>
                <div className="bg-red-950/20 border border-red-900/40 p-5 rounded-2xl flex flex-col justify-between relative overflow-hidden">
                    <div className="absolute top-3 right-3 flex h-3 w-3">
                        {criticalCount > 0 && (
                            <>
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                            </>
                        )}
                    </div>
                    <span className="text-red-400 text-xs font-bold uppercase tracking-wider">Críticos</span>
                    <span className="text-3xl font-extrabold text-red-500 mt-2 font-mono">{criticalCount}</span>
                </div>
                <div className="bg-amber-950/20 border border-amber-900/40 p-5 rounded-2xl flex flex-col justify-between">
                    <span className="text-amber-400 text-xs font-bold uppercase tracking-wider">Advertencias</span>
                    <span className="text-3xl font-extrabold text-amber-500 mt-2 font-mono">{warningCount}</span>
                </div>
                <div className="bg-blue-950/20 border border-blue-900/40 p-5 rounded-2xl flex flex-col justify-between">
                    <span className="text-blue-400 text-xs font-bold uppercase tracking-wider">Informativos</span>
                    <span className="text-3xl font-extrabold text-blue-500 mt-2 font-mono">{infoCount}</span>
                </div>
            </div>

            {/* BANNER REACTIVO DE ALTA PRIORIDAD */}
            {anomalies.length > 0 && (
                <div className="bg-gray-950/30 border border-gray-900 rounded-2xl p-4">
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">
                        Vista Rápida de Alertas
                    </p>
                    <AnomaliesBanner 
                        anomalies={anomalies}
                        onDismiss={handleDismiss}
                    />
                </div>
            )}

            {/* BARRA DE FILTROS & BÚSQUEDA */}
            <div className="bg-gray-900/40 border border-gray-800/80 p-4 rounded-2xl flex flex-col md:flex-row gap-4 items-center justify-between">
                <div className="relative w-full md:max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 w-4 h-4" />
                    <input
                        type="text"
                        placeholder="Buscar por mensaje, usuario o consulta..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full bg-slate-950 border border-gray-800 text-sm text-gray-200 pl-9 pr-4 py-2.5 rounded-xl focus:border-purple-500 focus:outline-none transition-all placeholder:text-gray-600"
                    />
                </div>

                <div className="flex gap-3 w-full md:w-auto">
                    <select
                        value={severityFilter}
                        onChange={(e) => setSeverityFilter(e.target.value)}
                        className="bg-slate-950 border border-gray-800 text-sm text-gray-300 px-4 py-2.5 rounded-xl focus:border-purple-500 focus:outline-none transition-all cursor-pointer w-full md:w-auto font-medium"
                    >
                        <option value="all">Severidad: Todas</option>
                        <option value="critical">🔴 Críticas</option>
                        <option value="warning">🟡 Advertencias</option>
                        <option value="info">🔵 Informativas</option>
                    </select>
                </div>
            </div>

            {/* HISTORIAL DETALLADO DE AUDITORÍA */}
            <div className="bg-gray-900/20 border border-gray-800 rounded-2xl overflow-hidden shadow-inner">
                <div className="p-5 border-b border-gray-800 flex items-center justify-between bg-gray-900/40">
                    <h3 className="font-bold text-lg text-white flex items-center gap-2">
                        <Terminal size={18} className="text-purple-400" />
                        Historial de Auditoría
                    </h3>
                    <span className="text-xs text-gray-400 font-mono">
                        Visualizando {filteredAnomalies.length} de {anomalies.length} reportes
                    </span>
                </div>

                {loading ? (
                    <div className="py-16 flex flex-col items-center justify-center gap-3 text-gray-500">
                        <RefreshCw className="animate-spin text-purple-500" size={24} />
                        <span>Cargando reportes del sistema...</span>
                    </div>
                ) : error ? (
                    <div className="py-16 text-center text-red-400 flex flex-col items-center justify-center gap-2">
                        <ShieldAlert size={32} />
                        <p className="font-semibold">{error}</p>
                    </div>
                ) : filteredAnomalies.length === 0 ? (
                    <div className="py-20 text-center text-gray-500 flex flex-col items-center justify-center gap-4">
                        <div className="p-4 bg-green-950/20 border border-green-800/30 text-green-400 rounded-full">
                            <CheckCircle size={32} />
                        </div>
                        <div>
                            <p className="font-bold text-gray-300 text-lg">Historial Saludable</p>
                            <p className="text-sm text-gray-500 max-w-sm mx-auto mt-1">
                                No se encontraron anomalías registradas o activas que coincidan con los filtros de búsqueda.
                            </p>
                        </div>
                    </div>
                ) : (
                    <div className="divide-y divide-gray-800">
                        {filteredAnomalies.map((anomaly) => {
                            const isCritical = anomaly.severity?.toLowerCase() === 'critical';
                            const isWarning = anomaly.severity?.toLowerCase() === 'warning';
                            
                            let severityBadgeStyle = "bg-blue-900/20 border-blue-800 text-blue-400";
                            let icon = <Info size={14} />;
                            if (isCritical) {
                                severityBadgeStyle = "bg-red-950/50 border-red-950 text-red-400";
                                icon = <AlertCircle size={14} />;
                            } else if (isWarning) {
                                severityBadgeStyle = "bg-amber-950/50 border-amber-950 text-amber-400";
                                icon = <AlertTriangle size={14} />;
                            }

                            return (
                                <div 
                                    key={anomaly.id} 
                                    className="p-5 hover:bg-gray-900/30 transition-colors flex flex-col lg:flex-row lg:items-start justify-between gap-4 group"
                                >
                                    <div className="space-y-3 flex-1">
                                        {/* Fila superior de metadatos */}
                                        <div className="flex flex-wrap items-center gap-3">
                                            <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border text-xs font-bold uppercase tracking-wider ${severityBadgeStyle}`}>
                                                {icon}
                                                {anomaly.severity || 'info'}
                                            </span>
                                            
                                            <div className="flex items-center gap-1.5 text-xs text-gray-500 font-mono">
                                                <User size={12} />
                                                <span>Usuario:</span>
                                                <span className="text-gray-300 bg-gray-900 px-2 py-0.5 rounded border border-gray-800">
                                                    {anomaly.user_id || 'N/A'}
                                                </span>
                                            </div>

                                            <div className="flex items-center gap-1.5 text-xs text-gray-500">
                                                <Calendar size={12} />
                                                <span>{formatTimestamp(anomaly.fecha)}</span>
                                            </div>
                                        </div>

                                        {/* Mensaje descriptivo */}
                                        <p className="text-gray-200 text-sm font-medium leading-relaxed">
                                            {anomaly.message}
                                        </p>

                                        {/* Sección de Query de Búsqueda */}
                                        {anomaly.query && (
                                            <div className="p-3 bg-slate-950/80 border border-gray-800/60 rounded-xl font-mono text-xs text-purple-300 max-w-2xl">
                                                <span className="text-gray-500 font-bold block mb-1">Consulta SQL / Búsqueda:</span>
                                                <span className="word-break-all break-all">{anomaly.query}</span>
                                            </div>
                                        )}
                                    </div>

                                    {/* Botón de descartar */}
                                    <div className="flex items-center self-end lg:self-start">
                                        <button
                                            onClick={() => handleDismiss(anomaly.id)}
                                            className="p-2 bg-gray-900 hover:bg-red-950/30 text-gray-400 hover:text-red-400 border border-gray-800 hover:border-red-900/60 rounded-xl transition-all shadow-md flex items-center gap-1.5 text-xs font-semibold"
                                            title="Descartar de base de datos"
                                        >
                                            <Trash2 size={14} />
                                            Descartar
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
