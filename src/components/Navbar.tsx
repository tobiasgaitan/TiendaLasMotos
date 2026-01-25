"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
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
    const pathname = usePathname();

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

    return (
        <nav className="sticky top-0 z-40 bg-brand-blue shadow-lg border-b border-blue-900/30">
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
                    <Link
                        href="/presupuesto"
                        className="hidden md:flex items-center gap-2 bg-gradient-to-r from-orange-500 to-yellow-500 hover:from-orange-600 hover:to-yellow-600 text-slate-900 font-bold py-2.5 px-6 rounded-full transition-all hover:scale-105 shadow-[0_0_20px_rgba(251,146,60,0.4)] active:scale-95"
                    >
                        <Calculator className="w-4 h-4" />
                        CALCULA TU CUOTA
                    </Link>

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
                <div className="md:hidden bg-brand-blue border-t border-blue-900/30 shadow-xl">
                    <div className="container mx-auto px-4 py-4 space-y-3">
                        {/* Mobile CTA Button - Top Priority */}
                        <Link
                            href="/presupuesto"
                            onClick={handleLinkClick}
                            className="flex items-center justify-center gap-2 bg-gradient-to-r from-orange-500 to-yellow-500 hover:from-orange-600 hover:to-yellow-600 text-slate-900 font-bold py-3 px-6 rounded-full transition-all shadow-[0_0_20px_rgba(251,146,60,0.4)] active:scale-95 w-full"
                        >
                            <Calculator className="w-5 h-5" />
                            CALCULA TU CUOTA
                        </Link>

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
    );
}
