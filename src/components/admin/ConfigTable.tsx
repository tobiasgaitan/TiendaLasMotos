"use client";

import { Edit2, Trash2 } from "lucide-react";

interface Column<T> {
    header: string;
    accessor: (item: T) => React.ReactNode;
}

interface ConfigTableProps<T> {
    data: T[];
    columns: Column<T>[];
    onEdit: (item: T) => void;
    onDelete: (item: T) => void;
}

export default function ConfigTable<T extends { id: string }>({
    data,
    columns,
    onEdit,
    onDelete
}: ConfigTableProps<T>) {
    if (!data || data.length === 0) {
        return <div className="p-8 text-center text-gray-500 bg-white rounded-xl border border-dashed">No hay registros aún.</div>;
    }

    return (
        <div className="overflow-x-auto bg-white rounded-xl shadow-sm border border-gray-100">
            <table className="w-full text-sm text-left">
                <thead className="text-xs text-gray-500 uppercase bg-gray-50 border-b">
                    <tr>
                        {columns.map((col, idx) => (
                            <th key={idx} className="px-6 py-3 font-medium">{col.header}</th>
                        ))}
                        <th className="px-6 py-3 text-right">Acciones</th>
                    </tr>
                </thead>
                <tbody>
                    {data.map((item) => (
                        <tr key={item.id} className="border-b last:border-0 hover:bg-gray-50 transition-colors">
                            {columns.map((col, idx) => (
                                <td key={idx} className="px-6 py-4 font-medium text-gray-900">
                                    {col.accessor(item)}
                                </td>
                            ))}
                            <td className="px-6 py-4 text-right flex justify-end gap-2">
                                <button
                                    onClick={() => onEdit(item)}
                                    className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                    title="Editar"
                                >
                                    <Edit2 size={16} />
                                </button>
                                <button
                                    onClick={() => onDelete(item)}
                                    className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                    title="Eliminar"
                                >
                                    <Trash2 size={16} />
                                </button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
