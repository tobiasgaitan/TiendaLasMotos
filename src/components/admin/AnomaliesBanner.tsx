'use client';

import React from 'react';
import { AlertCircle, AlertTriangle, Info, X } from 'lucide-react';

export interface Anomaly {
    id: string;
    severity: 'critical' | 'warning' | 'info' | string;
    user_id: string;
    query: string;
    message: string;
    fecha?: any; // Firestore Timestamp
}

interface AnomaliesBannerProps {
    anomalies: Anomaly[];
    onDismiss?: (id: string) => void;
}

export default function AnomaliesBanner({ anomalies, onDismiss }: AnomaliesBannerProps) {
    if (!anomalies || anomalies.length === 0) {
        return null;
    }

    const getSeverityStyles = (severity: string) => {
        switch (severity?.toLowerCase()) {
            case 'critical':
                return {
                    bg: '#7f1d1d', // Red 900 (Fondo rojo oscuro)
                    border: '#f87171', // Red 400
                    text: '#ffffff', // Blanco puro (contraste WCAG AA > 7:1)
                    secondaryText: '#fecaca', // Red 200 (contraste alto)
                    labelBg: '#b91c1c', // Red 700
                    icon: <AlertCircle className="w-5 h-5" style={{ color: '#f87171', flexShrink: 0 }} />
                };
            case 'warning':
                return {
                    bg: '#78350f', // Amber 900
                    border: '#fbbf24', // Amber 400
                    text: '#ffffff',
                    secondaryText: '#fef08a', // Yellow 200
                    labelBg: '#b45309', // Amber 700
                    icon: <AlertTriangle className="w-5 h-5" style={{ color: '#fbbf24', flexShrink: 0 }} />
                };
            default:
                return {
                    bg: '#1e3a8a', // Blue 900
                    border: '#60a5fa', // Blue 400
                    text: '#ffffff',
                    secondaryText: '#bfdbfe', // Blue 200
                    labelBg: '#1d4ed8', // Blue 700
                    icon: <Info className="w-5 h-5" style={{ color: '#60a5fa', flexShrink: 0 }} />
                };
        }
    };

    return (
        <div 
            className="space-y-4 mb-6 rounded-xl overflow-hidden border"
            style={{
                borderColor: '#ef4444', // Red 500 para llamar la atención del contenedor
                backgroundColor: '#111827', // Gray 900
                padding: '16px',
            }}
        >
            <div className="flex items-center justify-between border-b pb-2" style={{ borderColor: '#374151' }}>
                <div className="flex items-center gap-2">
                    <span 
                        className="animate-pulse inline-block w-2.5 h-2.5 rounded-full" 
                        style={{ backgroundColor: '#ef4444' }} 
                    />
                    <h2 
                        className="text-lg font-bold tracking-tight" 
                        style={{ color: '#ffffff', fontFamily: 'system-ui, sans-serif' }}
                    >
                        Anomalías Críticas de Catálogo Detectadas ({anomalies.length})
                    </h2>
                </div>
                <span 
                    className="text-xs font-mono font-semibold px-2 py-0.5 rounded"
                    style={{ 
                        backgroundColor: '#ef4444', 
                        color: '#ffffff',
                        fontSize: '11px',
                        letterSpacing: '0.05em'
                    }}
                >
                    REAL-TIME
                </span>
            </div>

            <div className="max-h-[300px] overflow-y-auto space-y-3 pr-1">
                {anomalies.map((anomaly) => {
                    const styles = getSeverityStyles(anomaly.severity);
                    return (
                        <div
                            key={anomaly.id}
                            className="relative p-4 rounded-lg border transition-all duration-200 shadow-md"
                            style={{
                                backgroundColor: styles.bg,
                                borderColor: styles.border,
                                color: styles.text,
                            }}
                        >
                            {onDismiss && (
                                <button
                                    onClick={() => onDismiss(anomaly.id)}
                                    className="absolute top-2 right-2 p-1 rounded-full hover:bg-black/20 transition-colors"
                                    style={{ color: styles.text }}
                                    title="Descartar visualmente"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            )}

                            <div className="flex items-start gap-3">
                                {styles.icon}
                                <div className="flex-1 space-y-2">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span
                                            className="text-xs uppercase font-extrabold px-2 py-0.5 rounded font-mono"
                                            style={{
                                                backgroundColor: styles.labelBg,
                                                color: '#ffffff',
                                                fontSize: '10px'
                                            }}
                                        >
                                            {anomaly.severity}
                                        </span>
                                        <span 
                                            className="text-xs font-mono"
                                            style={{ color: styles.secondaryText }}
                                        >
                                            Usuario: {anomaly.user_id || 'N/A'}
                                        </span>
                                    </div>

                                    <p className="text-sm font-semibold" style={{ lineHeight: '1.4' }}>
                                        {anomaly.message}
                                    </p>

                                    <div 
                                        className="text-xs p-2 rounded font-mono border"
                                        style={{
                                            backgroundColor: 'rgba(0, 0, 0, 0.25)',
                                            borderColor: 'rgba(255, 255, 255, 0.1)',
                                            color: styles.secondaryText,
                                            whiteSpace: 'pre-wrap',
                                            wordBreak: 'break-all'
                                        }}
                                    >
                                        <span className="font-bold block mb-1">Consulta (Query):</span>
                                        {anomaly.query || '<Vacío>'}
                                    </div>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
