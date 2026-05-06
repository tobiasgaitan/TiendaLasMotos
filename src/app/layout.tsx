import type { Metadata, Viewport } from "next";
import "./globals.css";

/**
 * System font stacks — eliminates build-time network dependency on fonts.gstatic.com.
 * Uses the same CSS variable names (--font-geist-sans, --font-geist-mono)
 * to maintain compatibility with any downstream CSS references.
 */
const SYSTEM_SANS = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
const SYSTEM_MONO = 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace';

// Viewport: ancho real del dispositivo, escala 100%
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export const metadata: Metadata = {
  title: "Tienda Las Motos",
  description: "Gestión de inventario y ventas",
};

import { Toaster } from "sonner";
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
   * Configures the global HTML structure, system fonts, and providers (Auth, LeadModal).
   * Font stacks are applied via inline CSS variables to avoid next/font/google build-time fetch.
   */
  return (
    <html lang="en" suppressHydrationWarning>
      {/*
        [WEB-752] Resource hints para los orígenes críticos del proyecto.
        - preconnect: Firebase Storage (imágenes de cédula/recibo) y Firestore API
        - dns-prefetch: Backend Cloud Run (orquestador + webhooks)
        NOTA: Google Fonts deliberadamente excluido — sistema usa system fonts (commit 81196e5).
      */}
      <head>
        <link rel="preconnect" href="https://firebasestorage.googleapis.com" />
        <link rel="preconnect" href="https://firestore.googleapis.com" />
        <link rel="dns-prefetch" href={process.env.NEXT_PUBLIC_API_URL} />
      </head>
      <body
        className="antialiased bg-slate-50 text-slate-900"
        style={{
          fontFamily: SYSTEM_SANS,
          '--font-geist-sans': SYSTEM_SANS,
          '--font-geist-mono': SYSTEM_MONO,
        } as React.CSSProperties}
      >
        <LeadModalProvider>
          <AuthProvider>
            <Toaster position="top-right" expand={false} richColors />
            <NavigationWrapper />
            {children}
            <LeadForm />
            <SmartFooter />
          </AuthProvider>
        </LeadModalProvider>
      </body>
    </html>
  );
}
