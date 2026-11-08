"use server";

// ... imports
import { cookies } from "next/headers";
import { getAdminAuth } from "@/lib/firebase-admin";
import { resolverRolActor } from "@/lib/auth/require-permiso";
import { getCatalogoMotos } from "@/lib/firestore";

async function isAdminSession(): Promise<boolean> {
    try {
        const cookieStore = await cookies();
        const sessionCookie = cookieStore.get("__session")?.value;
        if (!sessionCookie) return false;

        const decoded = await getAdminAuth().verifySessionCookie(sessionCookie);
        const email = typeof decoded.email === "string"
            ? decoded.email.toLowerCase().trim()
            : "";
        if (!email) return false;

        const { rol } = await resolverRolActor(email);
        return rol === "admin" || rol === "superadmin";
    } catch (error) {
        console.error("Admin session verification failed:", error);
        return false;
    }
}

export async function getSyncList() {
    try {
        const motos = await getCatalogoMotos();
        // Filter items that have external_url
        return motos
            .filter(m => m.external_url)
            .map(m => ({
                id: m.id,
                referencia: m.referencia,
                external_url: m.external_url
            }));
    } catch (error) {
        console.error("Error getting sync list:", error);
        return [];
    }
}

export async function triggerManualScraping(targetUrl?: string) {
    if (!(await isAdminSession())) {
        return { success: false, message: "No autorizado" };
    }

    const CRON_SECRET_TOKEN = process.env.CRON_SECRET_TOKEN;
    const FUNCTION_URL = process.env.NEXT_PUBLIC_SCRAPING_FUNCTION_URL || "https://us-central1-tiendalasmotos.cloudfunctions.net/manualSyncBot";

    if (!CRON_SECRET_TOKEN || !FUNCTION_URL) {
        return { success: false, message: "Server configuration missing (Token or URL)." };
    }

    try {
        const response = await fetch(FUNCTION_URL, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${CRON_SECRET_TOKEN}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ targetUrl }) // Send targetUrl if present
        });

        if (!response.ok) {
            const text = await response.text();
            return { success: false, message: `Error: ${response.status} - ${text}` };
        }

        const data = await response.json();
        return { success: true, data };
    } catch (error: any) {
        return { success: false, message: error.message };
    }
}
