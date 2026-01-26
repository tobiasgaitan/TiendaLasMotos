"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Menu, X, Calculator } from "lucide-react";

/**
 * Navbar Component
 * 
 * Main navigation menu with logo, navigation links, and prominent CTA button.
 * Features responsive design with hamburger menu for mobile devices.
 * 
 * Layout:
 * - Left: Tienda Las Motos logo (links to /)
 * - Center: Navigation links (Inicio, Catálogo, Financiación, Sedes)
 * - Right: Prominent "CALCULA TU CUOTA" CTA button
 * 
 * Mobile Behavior:
 * - Hamburger menu icon
 * - Slide-in menu with all navigation links
 * - CTA button remains visible in mobile menu
 * 
 * @returns {JSX.Element} The navigation bar component
 */
export default function Navbar() {
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const [ctaModalOpen, setCtaModalOpen] = useState(false);
    const pathname = usePathname();
    const router = useRouter();

    /**
     * Navigation links configuration.
     * Each link has a label and href path.
     */
    const navLinks = [
        { label: "Inicio", href: "/" },
        { label: "Catálogo", href: "/catalogo" },
        { label: "Financiación", href: "/financiacion" },
        { label: "Sedes", href: "/sedes" },
    ];

    /**
     * Checks if a link is currently active based on pathname.
     * 
     * @param href - The link's href path
     * @returns True if the link is active
     */
    const isActive = (href: string): boolean => {
        if (href === "/") {
            return pathname === "/";
        }
        return pathname?.startsWith(href) || false;
    };

    /**
     * Closes mobile menu when a link is clicked.
     */
    const handleLinkClick = () => {
        setMobileMenuOpen(false);
    };

    /**
     * Handles CTA Modal Selection
     */
    const openCtaModal = (e: React.MouseEvent) => {
        e.preventDefault();
        setCtaModalOpen(true);
        setMobileMenuOpen(false); // Close mobile menu if open
    };

    return (
        <>
            <nav className="sticky top-0 z-40 bg-[#001f3f] shadow-lg border-b border-blue-900/30">
                <div className="container mx-auto px-4">
                    <div className="flex items-center justify-between h-16">
                        {/* Logo - Left Zone */}
                        <Link
                            href="/"
                            className="text-2xl font-black text-white italic tracking-wider hover:opacity-90 transition-opacity"
                            onClick={handleLinkClick}
                        >
                            TIENDA<span className="text-brand-yellow">LASMOTOS</span>
                        </Link>

                        {/* Desktop Navigation - Center Zone */}
                        <div className="hidden md:flex items-center gap-8">
                            {navLinks.map((link) => (
                                <Link
                                    key={link.href}
                                    href={link.href}
                                    className={`text-sm font-medium transition-colors relative group ${isActive(link.href)
                                        ? "text-brand-yellow"
                                        : "text-white hover:text-brand-yellow"
                                        }`}
                                >
                                    {link.label}
                                    {/* Active indicator underline */}
                                    {isActive(link.href) && (
                                        <span className="absolute -bottom-1 left-0 right-0 h-0.5 bg-brand-yellow rounded-full" />
                                    )}
                                </Link>
                            ))}
                        </div>

                        {/* CTA Button - Right Zone (Desktop) */}
                        <button
                            onClick={openCtaModal}
                            className="hidden md:flex items-center gap-2 bg-gradient-to-r from-orange-500 to-yellow-500 hover:from-orange-600 hover:to-yellow-600 text-slate-900 font-bold py-2.5 px-6 rounded-full transition-all hover:scale-105 shadow-[0_0_20px_rgba(251,146,60,0.4)] active:scale-95 cursor-pointer"
                            title="Calcula tu Cuota"
                        >
                            <Calculator className="w-4 h-4" />
                            CALCULA TU CUOTA
                        </button>

                        {/* Mobile Menu Button */}
                        <button
                            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                            className="md:hidden text-white p-2 hover:bg-blue-800 rounded-lg transition-colors"
                            aria-label="Toggle mobile menu"
                        >
                            {mobileMenuOpen ? (
                                <X className="w-6 h-6" />
                            ) : (
                                <Menu className="w-6 h-6" />
                            )}
                        </button>
                    </div>
                </div>

                {/* Mobile Menu */}
                {mobileMenuOpen && (
                    <div className="md:hidden bg-[#001f3f] border-t border-blue-900/30 shadow-xl">
                        <div className="container mx-auto px-4 py-4 space-y-3">
                            {/* Mobile CTA Button - Top Priority */}
                            <button
                                onClick={openCtaModal}
                                className="flex items-center justify-center gap-2 bg-gradient-to-r from-orange-500 to-yellow-500 hover:from-orange-600 hover:to-yellow-600 text-slate-900 font-bold py-3 px-6 rounded-full transition-all shadow-[0_0_20px_rgba(251,146,60,0.4)] active:scale-95 w-full cursor-pointer"
                            >
                                <Calculator className="w-5 h-5" />
                                CALCULA TU CUOTA
                            </button>

                            {/* Mobile Navigation Links */}
                            <div className="pt-2 space-y-2">
                                {navLinks.map((link) => (
                                    <Link
                                        key={link.href}
                                        href={link.href}
                                        onClick={handleLinkClick}
                                        className={`block py-2.5 px-4 rounded-lg font-medium transition-colors ${isActive(link.href)
                                            ? "bg-blue-800 text-brand-yellow"
                                            : "text-white hover:bg-blue-800/50"
                                            }`}
                                    >
                                        {link.label}
                                    </Link>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
            </nav>

            {/* CTA SELECTION MODAL */}
            {ctaModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200 relative">
                        {/* Close Button */}
                        <button
                            onClick={() => setCtaModalOpen(false)}
                            className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 bg-slate-100 p-1 rounded-full transition-colors"
                        >
                            <X className="w-5 h-5" />
                        </button>

                        <div className="p-8 text-center">
                            <div className="w-16 h-16 bg-brand-yellow/20 rounded-full flex items-center justify-center mx-auto mb-6">
                                <Calculator className="w-8 h-8 text-brand-yellow" />
                            </div>

                            <h3 className="text-2xl font-black text-slate-900 mb-2">
                                ¿Qué deseas hacer?
                            </h3>
                            <p className="text-slate-600 mb-8">
                                Elige cómo quieres iniciar tu proceso de financiación
                            </p>

                            <div className="space-y-4">
                                {/* Option A: Catalog - NOW POINTS TO BUDGET SIMULATOR */}
                                <div
                                    onClick={() => {
                                        setCtaModalOpen(false);
                                        router.push('/presupuesto');
                                    }}
                                    className="block w-full p-4 rounded-xl border-2 border-slate-100 hover:border-brand-blue hover:bg-blue-50 transition-all group text-left cursor-pointer"
                                >
                                    <div className="flex items-center gap-4">
                                        <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center text-brand-blue group-hover:scale-110 transition-transform">
                                            <span className="text-xl">🏍️</span>
                                        </div>
                                        <div>
                                            <h4 className="font-bold text-slate-900 group-hover:text-brand-blue transition-colors">
                                                Simular Crédito de una Moto
                                            </h4>
                                            <p className="text-xs text-slate-500">
                                                Elige una moto del catálogo y cotiza
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                {/* Option B: Budget Calculator - NOW POINTS TO CATALOG (TEMP) */}
                                <Link
                                    href="/catalogo"
                                    onClick={() => setCtaModalOpen(false)}
                                    className="block w-full p-4 rounded-xl border-2 border-slate-100 hover:border-green-500 hover:bg-green-50 transition-all group text-left"
                                >
                                    <div className="flex items-center gap-4">
                                        <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center text-green-600 group-hover:scale-110 transition-transform">
                                            <span className="text-xl">💰</span>
                                        </div>
                                        <div>
                                            <h4 className="font-bold text-slate-900 group-hover:text-green-700 transition-colors">
                                                Buscar por Presupuesto
                                            </h4>
                                            <p className="text-xs text-slate-500">
                                                Calcula cuánto puedes financiar
                                            </p>
                                        </div>
                                    </div>
                                </Link>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
