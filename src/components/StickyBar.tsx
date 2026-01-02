"use client";

import { useLeadModal } from "@/context/LeadModalContext";

export default function StickyBar() {
    const { openModal } = useLeadModal();

    return (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-white/90 backdrop-blur-md border-t border-slate-200 md:hidden z-50 flex justify-between items-center px-6 pb-6 animate-in slide-in-from-bottom-full duration-500 shadow-[0_-5px_20px_rgba(0,0,0,0.1)]">
            <div className="flex flex-col">
                <span className="text-xs text-slate-500 uppercase">¿Interesado?</span>
                <span className="text-sm font-bold text-brand-blue">Habla con un asesor</span>
            </div>
            <button
                onClick={() => openModal()}
                className="bg-brand-yellow hover:bg-yellow-400 text-slate-900 font-bold py-3 px-6 rounded-full shadow-lg transition-transform hover:scale-105 flex items-center gap-2"
            >
                <span>COTIZAR</span>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />
                </svg>
            </button>
        </div>
    );
}
