import Link from 'next/link';
import { signOut } from '@/auth'; // Hypothetical, but user provided inline action.
// We will use the inline action pattern provided by the user to ensure it compiles as requested.

export default function SideNav() {
    return (
        <div className="flex h-full flex-col px-3 py-4 md:px-2 bg-gray-900 text-white">
            {/* Logo / Título */}
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

                {/* Espaciador */}
                <div className="hidden h-auto w-full grow rounded-md bg-gray-900 md:block"></div>

                {/* Botón Salir */}
                <form
                    action={async () => {
                        "use server"
                        // Since we don't have the `signOut` imported from a library that works here easily without setup,
                        // and `cookies` need to be cleared.
                        // For this specific 'hotfix', the user asked for this structure.
                        // We'll leave the logic empty or add a basic redirect if possible, 
                        // but `redirect` needs import.
                        // User comment: "// Redirigir o limpiar cookies"
                        // I'll add the imports to make it actually work if I can, but strict adherence says use their code.
                        // Their code had `action={async () => { "use server" ... }}`
                        const { cookies } = await import("next/headers");
                        const { redirect } = await import("next/navigation");
                        const cookieStore = await cookies();
                        cookieStore.delete("__session"); // Attempt to delete
                        redirect("/login");
                    }}
                >
                    <button className="flex h-[48px] w-full grow items-center justify-center gap-2 rounded-md bg-gray-800 p-3 text-sm font-medium hover:bg-red-600 hover:text-white md:flex-none md:justify-start md:p-2 md:px-3">
                        <div className="hidden md:block">Cerrar Sesión</div>
                        {/* Small icon for mobile if text is hidden? User code said hidden md:block for text. 
                 Let's stick to their code which only had text. */}
                    </button>
                </form>
            </div>
        </div>
    );
}
