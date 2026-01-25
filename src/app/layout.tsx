import type { Metadata, Viewport } from "next"; // <--- Agregamos 'Viewport' aquí
import { Inter, Roboto_Mono } from "next/font/google"; // <--- Cambiado a fuentes estándar compatibles
import "./globals.css";

const interSans = Inter({
  variable: "--font-geist-sans", // Mantenemos la variable para no romper CSS global
  subsets: ["latin"],
});

const robotoMono = Roboto_Mono({
  variable: "--font-geist-mono", // Mantenemos la variable
  subsets: ["latin"],
});

// --- ESTA ES LA PIEZA QUE FALTABA ---
// Le dice al navegador: "Usa el ancho real del dispositivo y escala al 100%"
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false, // Opcional: evita zoom accidental en inputs en móviles
};

export const metadata: Metadata = {
  title: "Tienda Las Motos",
  description: "Gestión de inventario y ventas",
};

import { LeadModalProvider } from "@/context/LeadModalContext";
import { AuthProvider } from "@/context/AuthContext";
import LeadForm from "@/components/LeadForm";
import SmartFooter from "@/components/SmartFooter";
import NavigationWrapper from "@/components/NavigationWrapper";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  /**
   * Root Layout Component
   * Configures the global HTML structure, fonts, and providers (Auth, LeadModal).
   * This layout wraps all pages in the application.
   * 
   * Navigation Structure:
   * - NavigationWrapper: Handles conditional rendering of TopBar and Navbar (hides on /admin)
   * - Children: Page content
   * - LeadForm: Global modal for lead capture
   * - SmartFooter: Global footer with dynamic content
   */
  return (
    <html lang="en">
      <body
        className={`${interSans.variable} ${robotoMono.variable} antialiased bg-slate-50 text-slate-900`}
      >
        <LeadModalProvider>
          <AuthProvider>
            <NavigationWrapper />
            {children}
            <LeadForm />
            <SmartFooter />
          </AuthProvider>
        </LeadModalProvider>
      </body>
    </html >
  );
}
