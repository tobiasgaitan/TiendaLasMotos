"use client";

import { useEffect, useState } from "react";
import { collection, query, orderBy, getDocs, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase"; // Importing client SDK db
import { Lead } from "@/types";

interface LeadWithId extends Lead {
    id: string;
}

export default function LeadsPage() {
    const [leads, setLeads] = useState<LeadWithId[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchLeads = async () => {
            try {
                const leadsRef = collection(db, "leads");
                // Sort by fecha desc as requested
                const q = query(leadsRef, orderBy("fecha", "desc"));
                const querySnapshot = await getDocs(q);

                const fetchedLeads: LeadWithId[] = querySnapshot.docs.map((doc) => {
                    const data = doc.data();
                    return {
                        id: doc.id,
                        ...data,
                        // Ensure fecha is treated as Timestamp if it exists, otherwise fallback or handle error
                        // We cast to Lead but need to be careful with optional fields or mismatches
                    } as LeadWithId;
                });

                setLeads(fetchedLeads);
            } catch (err: unknown) {
                console.error("Error fetching leads:", err);
                setError("No tienes permisos para ver esta información o hubo un error de conexión.");
            } finally {
                setLoading(false);
            }
        };

        fetchLeads();
    }, []);

    const formatDate = (timestamp: Timestamp | Date | string | null | undefined) => {
        if (!timestamp) return 'Sin fecha';
        // Handle Firebase Timestamp
        if (typeof timestamp === 'object' && 'toDate' in timestamp && typeof (timestamp as Timestamp).toDate === 'function') {
            return (timestamp as Timestamp).toDate().toLocaleDateString('es-CO', {
                day: '2-digit', month: '2-digit', year: 'numeric',
                hour: '2-digit', minute: '2-digit'
            });
        }
        // Handle potential string or standard Date
        return new Date(timestamp as string | Date).toLocaleString('es-CO');
    };

    const getWhatsAppLink = (phone: string) => {
        // Remove symbols to get raw number
        const raw = phone.replace(/\D/g, '');
        // Add country code if missing (assuming 57 for Colombia based on context)
        const number = raw.startsWith('57') ? raw : `57${raw}`;
        return `https://wa.me/${number}`;
    };

    if (loading) {
        return (
            <div className="flex justify-center items-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600"></div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative" role="alert">
                <strong className="font-bold">Error: </strong>
                <span className="block sm:inline">{error}</span>
            </div>
        );
    }

    return (
        <div>
            <h1 className="text-3xl font-bold mb-6 text-gray-800 dark:text-white">Prospectos (CRM)</h1>

            {leads.length === 0 ? (
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-12 text-center">
                    <UserGroupIcon className="mx-auto h-12 w-12 text-gray-400" />
                    <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-gray-100">No hay prospectos</h3>
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Aún no se han capturado clientes potenciales.</p>
                </div>
            ) : (
                <div className="bg-white dark:bg-gray-800 shadow-md rounded-lg overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                            <thead className="bg-gray-50 dark:bg-gray-700">
                                <tr>
                                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Fecha</th>
                                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Nombre</th>
                                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Celular</th>
                                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Moto Interés</th>
                                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Motivo</th>
                                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Acción</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                                {leads.map((lead) => (
                                    <tr key={lead.id} className="hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors">
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                            {formatDate(lead.fecha)}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                                            {lead.nombre}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                            {lead.celular}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                            {lead.motoInteres}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full 
                            ${lead.motivo_inscripcion === 'Solicitud de Crédito' ? 'bg-blue-100 text-blue-800' :
                                                    lead.motivo_inscripcion === 'Pago de Contado' ? 'bg-green-100 text-green-800' :
                                                        lead.motivo_inscripcion === 'Repuestos/Accesorios' ? 'bg-yellow-100 text-yellow-800' :
                                                            'bg-gray-100 text-gray-800'}`}>
                                                {lead.motivo_inscripcion || 'General'}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                            <a
                                                href={getWhatsAppLink(lead.celular)}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-green-600 hover:text-green-900 flex items-center gap-1 bg-green-50 px-3 py-1 rounded-md border border-green-200 hover:bg-green-100"
                                            >
                                                Contactar
                                            </a>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}

function UserGroupIcon({ className }: { className?: string }) {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
    )
}
