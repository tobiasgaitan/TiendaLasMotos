"use server";

export async function triggerManualScraping() {
    const CRON_SECRET_TOKEN = "SYNC_MASTER_KEY_2025_SECURE_HARDCODED"; // process.env.CRON_SECRET_TOKEN;
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
