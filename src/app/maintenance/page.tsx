"use client";

import { useLeadModal } from "@/context/LeadModalContext";

/**
 * Maintenance Page Component
 * 
 * Displays a "Under Maintenance" message to the public while allowing
 * admin access via /admin routes.
 * 
 * @returns {JSX.Element} The maintenance landing page.
 */
export default function MaintenancePage() {
    const { openModal } = useLeadModal();

    return (
        <div className="min-h-screen flex flex-col items-center justify-center p-4 relative overflow-hidden bg-black">
            {/* Background with Overlay */}
            <div
                className="absolute inset-0 z-0 opacity-50 bg-[url('https://images.unsplash.com/photo-1558981403-c5f9899a28bc?q=80&w=2070&auto=format&fit=crop')] bg-cover bg-center"
                aria-hidden="true"
            />
            <div className="absolute inset-0 z-10 bg-black/70" />

            {/* Content */}
            <main className="relative z-20 max-w-2xl w-full text-center space-y-8 animate-in fade-in zoom-in duration-700">

                {/* Logo / Brand */}
                <div className="mb-12">
                    <h1 className="text-3xl md:text-5xl font-black text-white italic tracking-wider">
                        TIENDA<span className="text-orange-600">LASMOTOS</span>
                    </h1>
                </div>

                {/* Message */}
                <div className="space-y-6">
                    <h2 className="text-2xl md:text-4xl font-bold text-slate-100">
                        Estamos renovando nuestra experiencia digital
                    </h2>
                    <p className="text-lg md:text-xl text-slate-300 leading-relaxed">
                        Para brindarte lo mejor de Tienda Las Motos. <br className="hidden md:block" />
                        Volveremos muy pronto con más potencia.
                    </p>
                </div>

                {/* CTA Button */}
                <div className="pt-8">
                    <button
                        onClick={() => openModal()}
                        className="inline-flex items-center gap-3 bg-green-600 hover:bg-green-500 text-white font-bold py-4 px-8 rounded-full transition-all hover:scale-105 shadow-[0_0_20px_rgba(22,163,74,0.4)]"
                    >
                        <svg viewBox="0 0 24 24" className="w-6 h-6 fill-current" aria-hidden="true">
                            <path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.087l-.63 2.306 2.366-.621c.792.574 1.73.91 2.76.911h.005c3.181 0 5.767-2.586 5.768-5.766.001-3.18-2.585-5.766-5.766-5.767zm6.591-3.328C16.852 1.08 14.536.103 12.035.103c-6.471 0-11.749 5.275-11.751 11.743-.001 2.062.537 4.027 1.492 5.674l-1.583 5.776 5.925-1.547c1.585.86 3.42 1.343 5.564 1.343h.005c6.472 0 11.75-5.275 11.753-11.743.003-6.467-5.274-11.742-11.746-11.742zm.006 18.239l-.004.004c-3.57 0-6.908-1.554-9.255-4.298-.445-.519-.948-1.077-1.397-1.489-.6-.537-1.306-1.127-1.776-1.442-.451-.303-.585-.41-.715-.595l.951-3.483c-1.325-1.801-2.029-3.951-2.028-6.177 0-5.835 4.747-10.582 10.583-10.583 2.828 0 5.484 1.101 7.485 3.102 2.002 1.999 3.102 4.656 3.099 7.485-.002 5.86-4.757 10.638-10.64 10.638z" />
                        </svg>
                        Escríbenos para tener el gusto de atenderte
                    </button>
                </div>

            </main>

            {/* Footer */}
            <footer className="absolute bottom-4 z-20 text-slate-500 text-xs text-center w-full px-4">
                &copy; {new Date().getFullYear()} TiendaLasMotos.com. Todos los derechos reservados.
            </footer>
        </div>
    );
}
