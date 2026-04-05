'use client';

import { useState, useCallback } from 'react';
import Papa from 'papaparse';
import { Upload, FileText, CheckCircle2, AlertCircle, Loader2, X } from 'lucide-react';
import { bulkImportProspectsAction } from '@/app/actions';
import { toast } from 'sonner';

interface BulkImportModalProps {
    isOpen: boolean;
    onClose: () => void;
}

interface RowData {
    document_id: string;
    nombre: string;
    celular: string;
    moto_interest: string;
    habeas_data: string;
    ciudad?: string;
    ocupacion?: string;
    ingresos?: string;
    gastos?: string;
    datacredito?: string;
    vivienda?: string;
    servicios_publicos?: string;
    plan_celular?: string;
    status?: string;
    status_row?: 'VALID' | 'ERROR';
}

export default function BulkImportModal({ isOpen, onClose }: BulkImportModalProps) {
    const [file, setFile] = useState<File | null>(null);
    const [previewData, setPreviewData] = useState<RowData[]>([]);
    const [csvData, setCsvData] = useState<RowData[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [report, setReport] = useState<{ created: number; updated: number; failed: number } | null>(null);

    const normalizeDocumentId = (id: string): { id: string; valid: boolean } => {
        const clean = id?.toString().trim().replace(/\D/g, '');
        if (clean.length === 10) {
            return { id: `57${clean}`, valid: true };
        }
        if (clean.length === 12 && clean.startsWith('57')) {
            return { id: clean, valid: true };
        }
        return { id: clean, valid: false };
    };

    const handleFileLoad = (file: File) => {
        setFile(file);
        setReport(null);
        
        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            // 1. Destruir espacios ocultos y BOM en cabeceras
            transformHeader: (header) => header.trim().replace(/^\uFEFF/, ''),
            complete: (results) => {
                const cleanData = results.data.map((row: any) => {
                    // 2. Extraer limpiando espacios en llaves y valores
                    const rawStatus = row.status || row.STATUS || row.Status || '';
                    const rawMoto = row.moto_interest || row.MOTO_INTERES || row.moto_interes || '';
                    const rawIdField = row.celular || row.document_id || row.CELULAR || row.DOCUMENT_ID;
                    
                    let finalStatus = 'PENDING';
                    if (rawStatus.toString().trim() !== '') {
                        finalStatus = rawStatus.toString().trim();
                    }

                    // Aplicar Regla Tobias (normalización de ID)
                    const { id, valid } = normalizeDocumentId(rawIdField);

                    return {
                        ...row,
                        document_id: id,
                        // 3. Limpieza extrema
                        moto_interest: rawMoto.toString().replace(/;/g, '').trim(),
                        status: finalStatus,
                        status_row: valid ? 'VALID' : 'ERROR'
                    };
                });

                // 2. IMPORTANTE: Usar cleanData para la pre-visualización, NO results.data
                setPreviewData(cleanData.slice(0, 5));
                setCsvData(cleanData); // Guardar la data limpia para el envío
            },
            error: (error) => {
                toast.error("Error al leer el archivo CSV", { description: error.message });
            }
        });
    };

    const onDrop = (e: React.DragEvent) => {
        e.preventDefault();
        const droppedFile = e.dataTransfer.files[0];
        if (droppedFile && droppedFile.type === "text/csv") {
            handleFileLoad(droppedFile);
        } else {
            toast.error("Por favor sube un archivo CSV válido.");
        }
    };

    const handleImport = async () => {
        const validProspects = csvData.filter(p => p.status_row === 'VALID');
        if (validProspects.length === 0) {
            toast.error("No hay registros válidos para importar.");
            return;
        }

        setIsProcessing(true);
        try {
            const result = await bulkImportProspectsAction(validProspects);
            if (result.success && result.report) {
                setReport(result.report);
                toast.success("Importación completada!");
            } else {
                throw new Error(result.message);
            }
        } catch (error: any) {
            toast.error("Error en la importación", { description: error.message });
        } finally {
            setIsProcessing(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md">
            <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                
                {/* Header */}
                <div className="p-6 border-b border-gray-800 flex justify-between items-center bg-gray-900/50">
                    <div>
                        <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                            <Upload className="w-6 h-6 text-green-500" />
                            Carga Masiva v1.2
                        </h2>
                        <p className="text-gray-400 text-sm mt-1">Estándar UNE v7.0.2 • Regla Tobias</p>
                    </div>
                    <button onClick={onClose} className="text-gray-500 hover:text-white p-2">
                        <X className="w-6 h-6" />
                    </button>
                </div>

                <div className="p-6 overflow-y-auto space-y-6">
                    
                    {/* Drag & Drop Zone */}
                    {!file ? (
                        <div 
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={onDrop}
                            className="border-2 border-dashed border-gray-700 rounded-xl p-12 flex flex-col items-center justify-center gap-4 hover:border-green-500/50 hover:bg-green-500/5 transition-all cursor-pointer group"
                            onClick={() => document.getElementById('csvInput')?.click()}
                        >
                            <div className="w-16 h-16 bg-gray-800 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform">
                                <FileText className="w-8 h-8 text-gray-400 group-hover:text-green-500" />
                            </div>
                            <div className="text-center">
                                <p className="text-lg font-bold text-white">Haz clic o arrastra tu archivo CSV</p>
                                <p className="text-gray-500 text-sm">El archivo debe contener las columnas: nombre, celular, moto_interest, habeas_data</p>
                            </div>
                            <input 
                                id="csvInput"
                                type="file" 
                                accept=".csv" 
                                className="hidden" 
                                onChange={(e) => e.target.files?.[0] && handleFileLoad(e.target.files[0])}
                            />
                        </div>
                    ) : (
                        <div className="space-y-6">
                            {/* File Info Card */}
                            <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4 flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-green-500/20 rounded-lg">
                                        <FileText className="w-6 h-6 text-green-500" />
                                    </div>
                                    <div>
                                        <p className="font-bold text-white">{file.name}</p>
                                        <p className="text-xs text-gray-500">{(file.size / 1024).toFixed(2)} KB • {csvData.length} registros detectados</p>
                                    </div>
                                </div>
                                <button 
                                    onClick={() => {setFile(null); setPreviewData([]); setReport(null);}}
                                    className="text-red-400 hover:text-red-300 text-sm font-medium"
                                >
                                    Cambiar archivo
                                </button>
                            </div>

                            {/* Preview Table */}
                            <div className="space-y-3">
                                <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider">Vista Previa (Primeros 5 registros)</h3>
                                <div className="border border-gray-800 rounded-xl overflow-hidden">
                                    <table className="w-full text-left text-sm">
                                        <thead className="bg-gray-800 text-gray-400 border-b border-gray-700">
                                            <tr>
                                                <th className="p-3">Document_ID (Normalized)</th>
                                                <th className="p-3">Nombre</th>
                                                <th className="p-3">Moto Interés</th>
                                                <th className="p-3">Habeas</th>
                                                <th className="p-3 text-center">Estado</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-800">
                                            {previewData.map((row, i) => (
                                                <tr key={i} className="hover:bg-gray-800/30">
                                                    <td className="p-3">
                                                        {/* Forzar color blanco ignorando Tailwind */}
                                                        <p style={{ color: '#ffffff', fontWeight: 'bold', fontSize: '14px' }}>
                                                            {row.document_id}
                                                        </p>
                                                    </td>
                                                    <td className="p-3 text-white">{row.nombre}</td>
                                                    <td className="p-3 text-white font-medium">{row.moto_interest}</td>
                                                    <td className="p-3 text-gray-400">{row.status || 'PENDING'}</td>
                                                    <td className="p-3 text-center">
                                                        {row.status_row === 'VALID' ? (
                                                            <span className="inline-flex items-center gap-1 text-green-400 bg-green-400/10 px-2 py-0.5 rounded-full text-xs">
                                                                <CheckCircle2 className="w-3 h-3" /> Válido
                                                            </span>
                                                        ) : (
                                                            <span className="inline-flex items-center gap-1 text-red-400 bg-red-400/10 px-2 py-0.5 rounded-full text-xs">
                                                                <AlertCircle className="w-3 h-3" /> Error
                                                            </span>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                {csvData.length > 5 && (
                                    <p className="text-xs text-center text-gray-600">... y {csvData.length - 5} registros más</p>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Report Summary */}
                    {report && (
                        <div className="bg-green-900/20 border border-green-500/30 rounded-xl p-6 grid grid-cols-3 gap-4 text-center animate-in zoom-in-95 duration-300">
                            <div>
                                <p className="text-xs text-gray-400 uppercase font-bold">Nuevos</p>
                                <p className="text-3xl font-bold text-white">{report.created}</p>
                            </div>
                            <div className="border-x border-green-500/20">
                                <p className="text-xs text-gray-400 uppercase font-bold">Actualizados</p>
                                <p className="text-3xl font-bold text-green-400">{report.updated}</p>
                            </div>
                            <div>
                                <p className="text-xs text-gray-400 uppercase font-bold">Fallidos</p>
                                <p className="text-3xl font-bold text-red-400">{report.failed}</p>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer Actions */}
                <div className="p-6 border-t border-gray-800 bg-gray-900/50 flex justify-end gap-3 mt-auto">
                    <button 
                        onClick={onClose}
                        className="px-6 py-2 rounded-xl text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
                    >
                        Cancelar
                    </button>
                    <button 
                        onClick={handleImport}
                        disabled={!file || isProcessing || !!report}
                        className="bg-green-600 hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-8 py-2 rounded-xl font-bold shadow-lg shadow-green-900/20 flex items-center gap-2 transition-all transform active:scale-95"
                    >
                        {isProcessing ? (
                            <>
                                <Loader2 className="w-5 h-5 animate-spin" />
                                Procesando...
                            </>
                        ) : (
                            <>
                                <CheckCircle2 className="w-5 h-5" />
                                Iniciar Importación
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
