import { ShieldAlert } from "lucide-react";

interface AccesoDenegadoProps {
    mensaje?: string;
}

/**
 * Fallback compartido para guards de rutas administrativas.
 * La barrera real siempre es el servidor/Firestore Rules.
 */
export default function AccesoDenegado({
    mensaje = "No tienes permisos para acceder a esta sección.",
}: AccesoDenegadoProps) {
    return (
        <div className="mx-auto flex max-w-xl flex-col items-center gap-4 rounded-2xl border border-red-900/60 bg-red-950/40 p-8 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-red-500/15 text-red-400">
                <ShieldAlert aria-hidden="true" className="h-7 w-7" />
            </span>
            <div className="space-y-2">
                <h1 className="text-xl font-bold text-white">Acceso denegado</h1>
                <p className="text-sm leading-relaxed text-red-100/80">
                    {mensaje}
                </p>
            </div>
        </div>
    );
}
