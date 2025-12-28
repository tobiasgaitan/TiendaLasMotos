"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLeadModal } from "@/context/LeadModalContext";
import { createPortal } from "react-dom";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";

/**
 * Validatio Schema
 * Ensures data quality before sending to Firebase
 */
const clientSchema = z.object({
    nombre: z.string().min(3, "El nombre es muy corto"),
    celular: z.string().regex(/^[0-9+-\s()]*$/, "Carácter no válido en el celular").min(7, "El número es muy corto").max(20, "El número es muy largo"),
    motivo_inscripcion: z.enum([
        'Solicitud de Crédito',
        'Pago de Contado',
        'Asesoría General',
        'Repuestos/Accesorios'
    ], { message: "Selecciona un motivo" }),
});

type ClientFormSchema = z.infer<typeof clientSchema>;

/**
 * LeadForm Component
 * 
 * Floating modal that captures user leads and saves them to Firestore
 * in the 'prospectos' collection. Prepared for AI/Chatbot integration.
 */
export default function LeadForm() {
    const { isOpen, closeModal, selectedMoto } = useLeadModal();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitSuccess, setSubmitSuccess] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);

    const {
        register,
        handleSubmit,
        formState: { errors, isValid },
        reset
    } = useForm<ClientFormSchema>({
        resolver: zodResolver(clientSchema),
        mode: "onBlur"
    });

    // Close on success after delay
    useEffect(() => {
        if (submitSuccess) {
            const timer = setTimeout(() => {
                closeModal();
                setSubmitSuccess(false); // Reset internal state
                reset(); // Reset form for next time
            }, 3000);
            return () => clearTimeout(timer);
        }
    }, [submitSuccess, closeModal, reset]);

    if (!isOpen) return null;

    /**
     * Handles form submission
     * - Sanitizes the phone number to store only digits (removes formatting like spaces, dashes).
     * - Adds metadata for Bot processing (AI summary placeholder, origin).
     * - Saves the clean data to Firestore 'prospectos' collection.
     */
    const onSubmit = async (data: ClientFormSchema) => {
        setIsSubmitting(true);
        setSubmitError(null);

        try {
            // 1. Clean Phone Number (Remove spaces, dashes, etc - though Regex enforces digits, being safe)
            const cleanPhone = data.celular.replace(/\D/g, '');

            // 2. Prepare Payload
            const payload = {
                nombre: data.nombre,
                celular: cleanPhone,
                motoInteres: selectedMoto ? selectedMoto.referencia : "General",
                motivo_inscripcion: data.motivo_inscripcion,
                fecha: serverTimestamp(),
                estado: "NUEVO",

                // AI/Chatbot Fields
                ai_summary: null,
                chatbot_status: "PENDING",
                origen: "WEB_COTIZADOR"
            };

            // 3. Send to Firestore
            await addDoc(collection(db, "prospectos"), payload);

            // 4. Handle Success
            setSubmitSuccess(true);

        } catch (error) {
            console.error("Error submitting lead:", error);
            setSubmitError("Hubo un error al enviar tus datos. Por favor intenta de nuevo.");
        } finally {
            setIsSubmitting(false);
        }
    };

    // Render Portal to body to avoid z-index issues
    return createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl relative overflow-hidden animate-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="p-6 border-b border-slate-800 flex justify-between items-center bg-slate-900/50">
                    <div>
                        <h2 className="text-xl font-bold text-white">
                            {selectedMoto ? `Cotizar ${selectedMoto.referencia}` : "Habla con un asesor"}
                        </h2>
                        <p className="text-slate-400 text-sm mt-1">
                            Déjanos tus datos y te contactamos hoy mismo.
                        </p>
                    </div>
                    <button
                        onClick={closeModal}
                        className="text-slate-400 hover:text-white transition-colors p-2 hover:bg-slate-800 rounded-full"
                    >
                        ✕
                    </button>
                </div>

                {/* Form Body */}
                <div className="p-6">
                    {submitSuccess ? (
                        <div className="bg-green-900/20 border border-green-800 rounded-xl p-6 text-center animate-in fade-in slide-in-from-bottom-4">
                            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-green-600 mb-4 shadow-lg shadow-green-900/50">
                                <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                            </div>
                            <h3 className="text-lg font-bold text-white mb-2">¡Mensaje Enviado!</h3>
                            <p className="text-slate-300">
                                Un asesor experto te escribirá al WhatsApp en breve.
                            </p>
                        </div>
                    ) : (
                        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">

                            <div>
                                <label htmlFor="nombre" className="block text-sm font-medium text-slate-300 mb-1">
                                    Nombre Completo
                                </label>
                                <input
                                    {...register("nombre")}
                                    type="text"
                                    id="nombre"
                                    placeholder="Ej: Juan Pérez"
                                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-orange-600 focus:border-transparent transition-all"
                                />
                                {errors.nombre && (
                                    <p className="text-red-500 text-xs mt-1">
                                        {errors.nombre.message}
                                    </p>
                                )}
                            </div>

                            <div>
                                <label htmlFor="celular" className="block text-sm font-medium text-slate-300 mb-1">
                                    Número Celular
                                </label>
                                <input
                                    {...register("celular")}
                                    type="tel"
                                    id="celular"
                                    placeholder="Ej: 300 123 4567"
                                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-orange-600 focus:border-transparent transition-all"
                                />
                                {errors.celular && (
                                    <p className="text-red-500 text-xs mt-1">
                                        {errors.celular.message}
                                    </p>
                                )}
                            </div>

                            <div>
                                <label htmlFor="motivo_inscripcion" className="block text-sm font-medium text-slate-300 mb-1">
                                    Motivo de Contacto
                                </label>
                                <select
                                    {...register("motivo_inscripcion")}
                                    id="motivo_inscripcion"
                                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-orange-600 focus:border-transparent transition-all appearance-none"
                                    defaultValue=""
                                >
                                    <option value="" disabled>Selecciona una opción</option>
                                    <option value="Solicitud de Crédito">Solicitud de Crédito</option>
                                    <option value="Pago de Contado">Pago de Contado</option>
                                    <option value="Asesoría General">Asesoría General</option>
                                    <option value="Repuestos/Accesorios">Repuestos / Accesorios</option>
                                </select>
                                {errors.motivo_inscripcion && (
                                    <p className="text-red-500 text-xs mt-1">
                                        {errors.motivo_inscripcion.message}
                                    </p>
                                )}
                            </div>

                            {submitError && (
                                <div className="p-3 rounded-lg bg-red-900/20 border border-red-800 text-red-200 text-sm">
                                    {submitError}
                                </div>
                            )}

                            <button
                                type="submit"
                                disabled={isSubmitting || !isValid}
                                className="w-full bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-500 hover:to-red-500 text-white font-bold py-4 rounded-xl shadow-lg shadow-orange-900/20 transform transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2"
                            >
                                {isSubmitting ? (
                                    <>
                                        <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                        </svg>
                                        Enviando...
                                    </>
                                ) : (
                                    "Solicitar Información"
                                )}
                            </button>

                            <p className="text-xs text-center text-slate-500 mt-4">
                                Tus datos están seguros. Solo te contactaremos para brindarte la información solicitada.
                            </p>
                        </form>
                    )}
                </div>
            </div>
        </div>,
        document.body
    );
}
