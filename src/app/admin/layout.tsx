import AdminSidenav from '@/app/ui/admin-sidenav'; // Verified import path

/**
 * Layout principal para el panel de administración.
 * HOTFIX: Fuerza la visibilidad del sidebar eliminando restricciones responsive (md:hidden).
 * 
 * @param {Object} props - Propiedades del componente
 * @param {React.ReactNode} props.children - Elementos hijos a renderizar
 * @returns {JSX.Element} Estructura del layout con sidebar fijo
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className="flex h-screen w-full bg-black text-white overflow-hidden">

            {/* SIDEBAR: Siempre visible (flex), sin condiciones (md:hidden eliminado) */}
            <div className="flex w-64 flex-none border-r border-gray-800 bg-gray-900 flex-col z-10">
                <AdminSidenav />
            </div>
            {/* CONTENIDO */}
            <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
                <main className="flex-1 overflow-y-auto p-4 md:p-8 scroll-smooth">
                    {children}
                </main>
            </div>
        </div>
    );
}