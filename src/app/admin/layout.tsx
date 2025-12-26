import AdminSidenav from '@/app/ui/admin-sidenav'; // Verified import path

/**
 * Layout principal para el panel de administración.
 * Implementa un diseño responsivo con sidebar fijo en escritorio y oculto con adaptación en móvil.
 * Utiliza Flexbox para gestión de columnas y scroll independiente.
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className="flex h-screen md:flex-row md:overflow-hidden bg-black text-white">
            {/* 
       * 1. SIDEBAR (Navegación)
       * 'hidden': Oculto en vista móvil para maximizar espacio.
       * 'md:flex': Visible y fijo (w-64) en pantallas medianas+.
       */}
            <div className="hidden md:flex w-64 flex-none border-r border-gray-800 bg-gray-900 flex-col">
                <AdminSidenav />
            </div>

            {/* 
       * 2. AREA DE CONTENIDO (Móvil y Desktop)
       * Flex-1 asegura que ocupe el espacio restante.
       * overflow-hidden previene scroll en el contenedor padre.
       */}
            <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

                {/* Header Móvil: Visible solo en móvil para branding/menú */}
                <div className="md:hidden flex items-center justify-between p-4 border-b border-gray-800 bg-gray-900">
                    <span className="font-bold text-lg">TiendaLasMotos</span>
                    {/* TODO: Implementar botón de menú hamburguesa para togglear sidebar en móvil */}
                </div>

                {/* Main: Area scrolleable independiente para el contenido */}
                <main className="flex-1 overflow-y-auto p-4 md:p-8 scroll-smooth">
                    {children}
                </main>
            </div>
        </div>
    );
}