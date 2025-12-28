import type { Metadata, Viewport } from "next"; // <--- Agregamos 'Viewport' aquí
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-slate-950 text-slate-200`}
      >
        <LeadModalProvider>
          <AuthProvider>
            {children}
            <LeadForm />
          </AuthProvider>
        </LeadModalProvider>
      </body>
    </html>
  );
}
