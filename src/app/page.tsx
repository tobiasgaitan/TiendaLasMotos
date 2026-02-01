"use client";

import Image from "next/image";

export default function Home() {
    // Financial partners for carousel
    const financialPartners = [
        "Brilla",
        "Addi",
        "Sistecrédito",
        "Banco de Bogotá",
        "ProgreSER",
        "Crediorbe",
        "Galgo",
        "Soluciones Integrales"
    ];

    // WhatsApp configuration - using generic number, can be moved to config later
    const whatsappNumber = "573001234567"; // TODO: Replace with actual number from config
    const whatsappMessage = encodeURIComponent("Hola, quiero cotizar una moto");
    const whatsappUrl = `https://wa.me/${whatsappNumber}?text=${whatsappMessage}`;

    return (
        <div className="min-h-screen flex flex-col font-sans">
            <main className="flex-grow">
                {/* HERO SECTION - Identity & Primary CTA */}
                <section className="relative min-h-screen w-full flex items-center justify-center overflow-hidden bg-gradient-to-br from-brand-blue via-blue-800 to-blue-900">
                    {/* Decorative overlay */}
                    <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-blue-600/20 via-transparent to-transparent"></div>

                    <div className="relative z-10 container mx-auto px-4 py-16">
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
                            {/* Left Column - Copy & CTA */}
                            <div className="text-center lg:text-left space-y-8">
                                <h1 className="text-4xl md:text-5xl lg:text-6xl font-black text-white leading-tight">
                                    Progreso al Alcance de <span className="text-yellow-400">Todos</span>
                                </h1>
                                <p className="text-lg md:text-xl text-blue-100 leading-relaxed max-w-xl mx-auto lg:mx-0">
                                    Financiación fácil y rápida para motos en <span className="font-semibold text-white">Santa Marta</span>, <span className="font-semibold text-white">Riohacha</span> y <span className="font-semibold text-white">Zona Bananera</span>
                                </p>

                                {/* Primary CTA - WhatsApp */}
                                <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
                                    <a
                                        href={whatsappUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center justify-center gap-3 bg-yellow-400 hover:bg-yellow-500 text-black font-bold py-5 px-8 rounded-full transition-all hover:scale-105 shadow-[0_0_30px_rgba(252,209,22,0.6)] text-lg min-h-[56px]"
                                    >
                                        <span className="text-2xl">🟢</span>
                                        ASESORÍA POR WHATSAPP
                                    </a>
                                </div>
                            </div>

                            {/* Right Column - Advisor Image Placeholder */}
                            <div className="relative">
                                <div className="relative aspect-[4/5] max-w-md mx-auto lg:max-w-none rounded-2xl overflow-hidden shadow-2xl bg-gradient-to-br from-blue-700 to-blue-900">
                                    {/* Placeholder for advisor image */}
                                    <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-blue-600/50 to-blue-800/50 backdrop-blur-sm">
                                        <div className="text-center p-8">
                                            <div className="w-32 h-32 mx-auto mb-4 rounded-full bg-brand-yellow/20 flex items-center justify-center">
                                                <span className="text-6xl">👍</span>
                                            </div>
                                            <p className="text-white font-bold text-xl">Asesor Auteco</p>
                                            <p className="text-blue-200 text-sm mt-2">Imagen placeholder</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* FINANCIAL PARTNERS CAROUSEL */}
                <section className="py-16 bg-white">
                    <div className="container mx-auto px-4">
                        <h2 className="text-2xl md:text-3xl font-bold text-center text-brand-blue mb-8">
                            Aliados Financieros
                        </h2>

                        {/* Infinite Scroll Carousel */}
                        <div className="relative overflow-hidden mb-12">
                            <div className="flex animate-scroll">
                                {/* First set */}
                                {financialPartners.map((partner, index) => (
                                    <div
                                        key={`partner-1-${index}`}
                                        className="flex-shrink-0 w-48 h-32 mx-4 flex items-center justify-center bg-white rounded-lg shadow-md hover:shadow-lg transition-all border border-slate-100"
                                    >
                                        <span className="text-lg font-bold text-slate-800 text-center px-4">
                                            {partner}
                                        </span>
                                    </div>
                                ))}
                                {/* Duplicate set for seamless loop */}
                                {financialPartners.map((partner, index) => (
                                    <div
                                        key={`partner-2-${index}`}
                                        className="flex-shrink-0 w-48 h-32 mx-4 flex items-center justify-center bg-white rounded-lg shadow-md hover:shadow-lg transition-all border border-slate-100"
                                    >
                                        <span className="text-lg font-bold text-slate-800 text-center px-4">
                                            {partner}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Secondary CTA */}
                        <div className="text-center">
                            <a
                                href="/presupuesto"
                                className="inline-flex items-center justify-center gap-2 bg-yellow-400 hover:bg-yellow-500 text-black font-bold py-4 px-10 rounded-full transition-all hover:scale-105 shadow-lg text-lg min-h-[56px]"
                            >
                                SIMULAR MI CRÉDITO
                            </a>
                        </div>
                    </div>
                </section>

                {/* SOCIAL PROOF SECTION - Customer Testimonials */}
                <section className="py-20 bg-gradient-to-br from-slate-50 to-slate-100">
                    <div className="container mx-auto px-4">
                        <h2 className="text-3xl md:text-4xl font-bold text-center text-brand-blue mb-4">
                            Clientes Felices Estrenando
                        </h2>
                        <p className="text-center text-slate-600 mb-12 max-w-2xl mx-auto">
                            Conoce las historias de quienes ya cumplieron su sueño
                        </p>

                        {/* Video Grid - 9:16 Vertical Videos */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
                            {[1, 2, 3].map((video) => (
                                <div
                                    key={video}
                                    className="relative aspect-[9/16] rounded-2xl overflow-hidden shadow-xl group cursor-pointer bg-gradient-to-br from-slate-800 to-slate-900"
                                >
                                    {/* OFERTA Badge */}
                                    <div className="absolute top-4 left-4 z-20 bg-red-600 text-white font-bold text-sm px-4 py-2 rounded-lg shadow-lg">
                                        OFERTA
                                    </div>

                                    {/* Video Placeholder */}
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent flex items-center justify-center">
                                        {/* Play Button */}
                                        <div className="w-20 h-20 rounded-full bg-white/90 group-hover:bg-brand-yellow flex items-center justify-center transition-all group-hover:scale-110 shadow-2xl">
                                            <div className="w-0 h-0 border-t-[12px] border-t-transparent border-l-[20px] border-l-slate-900 border-b-[12px] border-b-transparent ml-1"></div>
                                        </div>
                                    </div>

                                    {/* Bottom Info */}
                                    <div className="absolute bottom-0 left-0 right-0 p-6 text-white z-10">
                                        <p className="font-bold text-lg mb-1">Cliente Feliz #{video}</p>
                                        <p className="text-sm text-slate-300">Video testimonial</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>
            </main>

            {/* CSS for Infinite Carousel Animation */}
            <style jsx>{`
                @keyframes scroll {
                    0% {
                        transform: translateX(0);
                    }
                    100% {
                        transform: translateX(-50%);
                    }
                }
                
                .animate-scroll {
                    animation: scroll 30s linear infinite;
                }
                
                .animate-scroll:hover {
                    animation-play-state: paused;
                }
            `}</style>
        </div>
    );
}
