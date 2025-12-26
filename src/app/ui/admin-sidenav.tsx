import Link from 'next/link';
import { logoutAction } from '@/lib/actions';

/**
 * Componente de navegación lateral para el panel de administración.
 * 
 * Implementa la lógica de cierre de sesión mediante Server Actions
 * para eliminar la cookie '__session' y redirigir al login, asegurando
 * que la acción ocurra en el servidor sin dependencias de cliente inseguras.
 */
export default function SideNav() {
    return (
        <div className="flex h-full flex-col px-3 py-4 md:px-2">
            {/* Título / Logo */}
            <Link
                className="mb-2 flex h-20 items-end justify-start rounded-md bg-blue-600 p-4"
                href="/"
            >
                <div className="w-32 text-white md:w-40">
                    <span className="text-xl font-bold">TiendaMotos</span>
                </div>
            </Link>
            {/* Enlaces de Navegación */}
            <div className="flex grow flex-row justify-between space-x-2 md:flex-col md:space-x-0 md:space-y-2">

                <Link
                    href="/admin/inventory"
                    className="flex h-[48px] grow items-center justify-center gap-2 rounded-md bg-gray-800 p-3 text-sm font-medium hover:bg-blue-600 hover:text-white md:flex-none md:justify-start md:p-2 md:px-3"
                >
                    <p>Inventario</p>
                </Link>
                <Link
                    href="/admin/leads"
                    className="flex h-[48px] grow items-center justify-center gap-2 rounded-md bg-gray-800 p-3 text-sm font-medium hover:bg-blue-600 hover:text-white md:flex-none md:justify-start md:p-2 md:px-3"
                >
                    <p>Prospectos</p>
                </Link>
                <div className="hidden h-auto w-full grow rounded-md bg-gray-900 md:block"></div>
                {/* Botón Salir (Lógica Nativa) */}
                <form
                    action={logoutAction}
                >
                    <button className="flex h-[48px] w-full grow items-center justify-center gap-2 rounded-md bg-gray-800 p-3 text-sm font-medium hover:bg-red-600 hover:text-white md:flex-none md:justify-start md:p-2 md:px-3">
                        <div className="hidden md:block">Cerrar Sesión</div>
                        {/* Icono visible en móvil para logout (opcional) */}
                        <div className="block md:hidden">Salir</div>
                    </button>
                </form>
            </div>
        </div>
    );
}
