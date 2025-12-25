import SideNav from "@/app/ui/admin-sidenav";

export default function Layout({ children }: { children: React.ReactNode }) {
    return (
        // CAMBIO CLAVE: 'flex-col' (móvil) por defecto, 'md:flex-row' (PC)
        <div className="flex h-screen flex-col md:flex-row md:overflow-hidden bg-black">

            {/* SIDEBAR:
          - En Móvil: w-full (ancho completo) y flex-none (no estira)
          - En PC (md): w-64 (ancho fijo)
      */}
            <div className="w-full flex-none md:w-64 border-b md:border-b-0 md:border-r border-gray-800 bg-gray-900 text-white">

                {/* En móvil a veces queremos ocultar el título si el SideNav ya tiene uno,
            pero por seguridad lo dejamos visible o lo integramos.
            Aquí dejamos que el SideNav maneje su contenido. */}
                <div className="h-full">
                    <SideNav />
                </div>
            </div>

            {/* CONTENIDO:
          - Crece para llenar el resto
          - Tiene scroll propio
      */}
            <div className="flex-grow p-6 overflow-y-auto text-gray-200 bg-black">
                {children}
            </div>
        </div>
    );
}