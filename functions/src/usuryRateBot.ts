import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import axios from "axios";
import { sendErrorEmail } from "./mailer";

const db = admin.firestore();

// Socrata Endpoint for "Tasas de Interés Activas y Usura"
// We use a known dataset ID or a reliable query.
// '32sa-8pi3' is a common ID for "Tasas de Interés Normativa"
// But we will use a specific query to be safe.
const DATASET_URL = "https://www.datos.gov.co/resource/32sa-8pi3.json";

interface UsuryData {
    modalidad: string;
    tasa_efectiva_anual: string; // usually comes as string "24.36"
    vigencia_hasta: string;
    vigencia_desde: string;
}

/**
 * Cloud Function: updateUsuryRates
 * 
 * Trigger: Scheduled Cron Job (1st of every month at 3:00 AM Bogota time).
 * Purpose: Automatically fetches the latest "Consumo y Ordinario" usury rate from Datos Abiertos (SFC).
 * Logic:
 * 1. Fetches JSON data from Socrata API.
 * 2. Parses the 'tasa_efectiva_anual' (E.A.).
 * 3. Converts E.A. to Monthly Vencido (M.V.) using formula: (1 + i_ea)^(1/12) - 1.
 * 4. Updates all documents in 'financial_entities' collection EXCEPT those with `manualOverride: true`.
 * 
 * Fail-Safe:
 * - Wraps logic in try-catch.
 * - On error, sends an alert email to 'conexion@tiendalasmotos.com' via `sendErrorEmail`.
 * 
 * @returns Promise<void>
 */
export const updateUsuryRates = functions.runWith({ memory: "512MB" }).pubsub
    .schedule("0 3 1 * *") // Run at 3:00 AM on the 1st of every month
    .timeZone("America/Bogota")
    .onRun(async (context) => {
        console.log("Starting Scheduled Usury Rate Update...");

        try {
            // 1. Fetch Data from SFC (Datos Abiertos)
            // Query: Consumo y Ordinario, Latest by 'vigencia_desde'
            const response = await axios.get(DATASET_URL, {
                params: {
                    "$limit": 1,
                    "$order": "vigencia_desde DESC",
                    "modalidad": "Consumo y Ordinario"
                },
                timeout: 10000 // 10s timeout
            });

            const data: UsuryData[] = response.data;

            if (!data || data.length === 0) {
                throw new Error("API returned no data for 'Consumo y Ordinario'. Schema might have changed.");
            }

            const latestRate = data[0];
            const rawRateEA = parseFloat(latestRate.tasa_efectiva_anual);

            if (isNaN(rawRateEA)) {
                throw new Error(`Invalid rate format received: ${latestRate.tasa_efectiva_anual}`);
            }

            console.log(`Fetched Rate (E.A.): ${rawRateEA}% from ${latestRate.vigencia_desde} to ${latestRate.vigencia_hasta}`);

            // 2. Convert E.A. to M.V.
            // Formula: i_mv = (1 + i_ea)^(1/12) - 1
            // Rate is in percentage (e.g. 25.00), so divide by 100 first
            const eaDecimal = rawRateEA / 100;
            const mvDecimal = Math.pow(1 + eaDecimal, 1 / 12) - 1;
            const mvPercent = parseFloat((mvDecimal * 100).toFixed(4)); // Keep 4 decimals for precision

            console.log(`Converted Rate (M.V.): ${mvPercent}%`);

            // 3. Update Financial Entities
            const snapshot = await db.collection("financial_entities").get();
            const batch = db.batch();
            let updatedCount = 0;

            snapshot.docs.forEach((doc) => {
                const entity = doc.data();

                // CHECK MANUAL OVERRIDE
                if (entity.manualOverride === true) {
                    console.log(`Skipping ${entity.name} (Manual Override active)`);
                    return;
                }

                // Update 'interestRate'
                // Note: Only updating the interest rate.
                batch.update(doc.ref, {
                    interestRate: mvPercent,
                    lastAutoUpdate: admin.firestore.FieldValue.serverTimestamp(),
                    autoUpdateSource: "SFC_DATOS_GOV"
                });
                updatedCount++;
            });

            if (updatedCount > 0) {
                await batch.commit();
                console.log(`Successfully updated ${updatedCount} entities to ${mvPercent}% M.V.`);
            } else {
                console.log("No entities required update (all overriden or empty).");
            }

        } catch (error: any) {
            console.error("Critical Error in UsuryRateBot:", error);
            // FAIL-SAFE TRIGGER
            await sendErrorEmail(error, "Cloud Function: updateUsuryRates (Monthly Cron)");
            // Re-throw to ensure Cloud Functions logs it as a failure
            throw error;
        }

        return null;
    });
