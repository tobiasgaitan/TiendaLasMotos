"use client";

import { createContext, useContext, useState, ReactNode } from "react";
import { Moto } from "@/types";

interface LeadModalContextType {
    isOpen: boolean;
    selectedMoto: Moto | null; // Null means "General Interest"
    openModal: (moto?: Moto) => void;
    closeModal: () => void;
}

const LeadModalContext = createContext<LeadModalContextType | undefined>(undefined);

export function LeadModalProvider({ children }: { children: ReactNode }) {
    const [isOpen, setIsOpen] = useState(false);
    const [selectedMoto, setSelectedMoto] = useState<Moto | null>(null);

    const openModal = (moto?: Moto) => {
        setSelectedMoto(moto || null);
        setIsOpen(true);
    };

    const closeModal = () => {
        setIsOpen(false);
        setSelectedMoto(null);
    };

    return (
        <LeadModalContext.Provider value={{ isOpen, selectedMoto, openModal, closeModal }}>
            {children}
        </LeadModalContext.Provider>
    );
}

export function useLeadModal() {
    const context = useContext(LeadModalContext);
    if (!context) {
        throw new Error("useLeadModal must be used within a LeadModalProvider");
    }
    return context;
}
