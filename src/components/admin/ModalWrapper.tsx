"use client";

import { useEffect, ReactNode } from "react";
import { X } from "lucide-react";

interface ModalWrapperProps {
    isOpen: boolean;
    onClose: () => void;
    title?: ReactNode; // Allow string or complex ReactNode
    children: ReactNode;
    maxWidth?: string;
}

/**
 * ModalWrapper
 * 
 * Componente unificado para modales administrativos.
 * Centraliza estilos (Dark Mode), z-index, overlay y bloqueo de scroll.
 */
export default function ModalWrapper({ isOpen, onClose, title, children, maxWidth = "800px" }: ModalWrapperProps) {

    // Bloqueo de Scroll
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
        }
        return () => { document.body.style.overflow = 'unset'; };
    }, [isOpen]);

    if (!isOpen) return null;

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            zIndex: 99999,
            backgroundColor: 'rgba(0,0,0,0.85)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '1rem'
        }}>
            {/* Click outside to close */}
            <div className="absolute inset-0" onClick={onClose} />

            <div
                style={{
                    backgroundColor: '#111827', // Dark Mode bg
                    color: '#ffffff',
                    border: '1px solid #374151',
                    borderRadius: '12px',
                    width: '100%',
                    maxWidth: maxWidth,
                    maxHeight: '90vh',
                    overflowY: 'auto',
                    position: 'relative',
                    zIndex: 100000,
                    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
                }}
                className="animate-in fade-in zoom-in duration-200"
            >
                {/* Header Opcional Estandarizado */}
                {title && (
                    <div className="flex justify-between items-center p-6 border-b border-gray-700">
                        <div className="text-xl font-bold text-white">
                            {title}
                        </div>
                        <button onClick={onClose} className="p-2 text-gray-400 hover:text-white transition-colors">
                            <X size={20} />
                        </button>
                    </div>
                )}

                {/* Si no hay título, mostramos botón de cierre flotante por defecto (estilo EditProductModal antiguo) 
                    o dejamos que el hijo lo maneje? 
                    Para unificar, vamos a preferir el Header. 
                    Pero si no pasan título, asumimos que el hijo quiere control total O poner el botón flotante.
                    Pongamos el botón flotante si NO hay título, para retrocompatibilidad visual si se desea.
                */}
                {!title && (
                    <button
                        onClick={onClose}
                        style={{ position: 'absolute', top: '16px', right: '16px', background: 'none', border: 'none', cursor: 'pointer', zIndex: 10 }}
                        className="text-gray-400 hover:text-white"
                    >
                        <X size={24} />
                    </button>
                )}

                <div className={title ? "" : "p-6"}>
                    {children}
                </div>
            </div>
        </div>
    );
}
