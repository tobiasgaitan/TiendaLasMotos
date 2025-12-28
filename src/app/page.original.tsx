import { getCatalogoMotos } from "@/lib/firestore";
import MotoCard from "@/components/MotoCard";
import Image from "next/image";
import StickyBar from "@/components/StickyBar";

export const revalidate = 3600; // Revalidate every hour

export default async function Home() {
  const motos = await getCatalogoMotos();

  return (
    <div className="min-h-screen flex flex-col font-sans">
      {/* HEADER / NAV (Simple Overlay) */}
      <header className="fixed top-0 w-full z-50 p-4 bg-gradient-to-b from-black/80 to-transparent">
        <div className="container mx-auto flex justify-between items-center">
          <div className="text-2xl font-black text-white italic tracking-wider">
            TIENDA<span className="text-orange-600">LASMOTOS</span>
          </div>
          <nav className="hidden md:flex gap-6 text-sm font-medium text-slate-200">
            <a href="#catalogo" className="hover:text-orange-500 transition-colors">CATÁLOGO</a>
            <a href="#" className="hover:text-orange-500 transition-colors">FINANCIACIÓN</a>
            <a href="#" className="hover:text-orange-500 transition-colors">CONTACTO</a>
          </nav>
        </div>
      </header>

      <main className="flex-grow">
        {/* HERO SECTION */}
        <section className="relative h-screen w-full flex items-center justify-center overflow-hidden">
          {/* Background Image - Placeholder or Gradient if no image */}
          <div className="absolute inset-0 bg-slate-900">
            {/* Ideally we would have a high-res hero image here. Using a gradient + abstract shape for now or standard placeholder */}
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-slate-800 via-slate-950 to-black opacity-80 z-0"></div>
            {/* Optional: Add an actual image if we had one URL, for now using pure CSS automotive vibes */}
          </div>

          <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-transparent z-10"></div>

          <div className="relative z-20 container mx-auto px-4 text-center md:text-left">
            <h1 className="text-5xl md:text-7xl font-black text-white mb-6 uppercase leading-tight tracking-tight drop-shadow-2xl">
              Domina <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-500 to-red-600">
                El Asfalto
              </span>
            </h1>
            <p className="text-lg md:text-2xl text-slate-300 max-w-2xl mb-8 leading-relaxed">
              Descubre la mejor selección de máquinas de alto rendimiento.
              Potencia, diseño y libertad en cada kilómetro.
            </p>
            <div className="flex flex-col md:flex-row gap-4">
              <a href="#catalogo" className="bg-orange-600 hover:bg-orange-700 text-white font-bold py-4 px-8 rounded-full transition-all hover:scale-105 shadow-[0_0_20px_rgba(234,88,12,0.5)]">
                VER CATÁLOGO
              </a>
            </div>
          </div>
        </section>

        {/* CATALOG GRID */}
        <section id="catalogo" className="py-20 bg-slate-950">
          <div className="container mx-auto px-4">
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-bold text-white mb-4 uppercase tracking-wide">
                Nuestras Motos
              </h2>
              <div className="h-1 w-24 bg-orange-600 mx-auto"></div>
            </div>

            {motos.length === 0 ? (
              <div className="text-center py-20 text-slate-500">
                <p className="text-xl">Cargando inventario o inventario vacío...</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
                {motos.map((moto) => (
                  <MotoCard key={moto.id} moto={moto} />
                ))}
              </div>
            )}
          </div>
        </section>
      </main>

      {/* FOOTER */}
      <footer className="bg-black text-slate-500 py-10 text-center text-sm border-t border-slate-900 pb-24 md:pb-10">
        <p>&copy; {new Date().getFullYear()} TiendaLasMotos.com. Todos los derechos reservados.</p>
      </footer>

      {/* STICKY ACTION BAR (Mobile Only) */}
      <StickyBar />
    </div>
  );
}
