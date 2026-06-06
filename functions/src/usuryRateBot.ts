import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import axios from "axios";
import { sendErrorEmail } from "./mailer";

const db = admin.firestore();

// Socrata Endpoint for "Tasa de Interés Bancario Corriente - TIBC"
// Dataset ID: pare-7x5i (SFC - Superintendencia Financiera de Colombia)
// WHY: The old ID '32sa-8pi3' was incorrectly pointing to TRM (Dollar Exchange Rate).
// The usury rate (tasa de usura) = IBC × 1.5 (Art. 305 C.P. Colombia).
const DATASET_URL = "https://www.datos.gov.co/resource/pare-7x5i.json";

interface UsuryData {
    modalidad: string;
    interes_bancario_corriente: string; // Comes as "19.19%" (with % suffix)
    vigencia_hasta: string;
    vigencia_desde: string;
    resolucion: string;
    fecha_resolucion: string;
}

/**
 * Cloud Function: updateUsuryRates
 * 
 * Trigger: Scheduled Cron Job (1st of every month at 3:00 AM Bogota time).
 * Purpose: Fetches the latest IBC (Interés Bancario Corriente) for "CONSUMO Y ORDINARIO"
 *          from Datos Abiertos (SFC) and calculates the usury rate ceiling (IBC × 1.5).
 * Logic:
 * 1. Fetches JSON data from Socrata API (dataset: pare-7x5i).
 * 2. Parses 'interes_bancario_corriente' (E.A., with % suffix).
 * 3. Calculates Usury Rate = IBC × 1.5 (Colombian law).
 * 4. Converts Usury E.A. to Monthly Vencido (M.V.) using formula: (1 + i_ea)^(1/12) - 1.
 * 5. Updates ONLY entities in 'financial_config/general/financieras' that have:
 *    - `syncedWithUsura === true` (opt-in flag from frontend)
 *    - AND `manualOverride !== true` (safety lock)
 * 
 * Fail-Safe:
 * - Wraps logic in try-catch.
 * - On error, sends an alert email to 'conexion@tiendalasmotos.com' via `sendErrorEmail`.
 * - Logs the raw API response body on HTTP errors for forensic debugging.
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
                    "modalidad": "CONSUMO Y ORDINARIO"
                },
                timeout: 15000 // 15s timeout (Socrata can be slow)
            });

            const data: UsuryData[] = response.data;

            if (!data || data.length === 0) {
                throw new Error("API returned no data for 'CONSUMO Y ORDINARIO' from dataset pare-7x5i. Schema might have changed.");
            }

            const latestRate = data[0];
            // WHY strip '%': The Socrata field returns "19.19%" as a string with % suffix
            const rawIBCStr = latestRate.interes_bancario_corriente.replace("%", "").trim();
            const ibcEA = parseFloat(rawIBCStr);

            if (isNaN(ibcEA)) {
                throw new Error(`Invalid IBC rate format received: '${latestRate.interes_bancario_corriente}' (raw: '${rawIBCStr}')`);
            }

            // 2. Calculate Usury Rate from IBC
            // WHY ×1.5: Colombian law (Art. 305 C.P.) defines usury as 1.5× IBC
            const usuryEA = parseFloat((ibcEA * 1.5).toFixed(2));
            console.log(`Fetched IBC (E.A.): ${ibcEA}% | Usury Ceiling (E.A.): ${usuryEA}% | Resolución: ${latestRate.resolucion} | Vigencia: ${latestRate.vigencia_desde} → ${latestRate.vigencia_hasta}`);

            // 3. Convert Usury E.A. to M.V.
            // Formula: i_mv = (1 + i_ea)^(1/12) - 1
            // Rate is in percentage (e.g. 28.79), so divide by 100 first
            const eaDecimal = usuryEA / 100;
            const mvDecimal = Math.pow(1 + eaDecimal, 1 / 12) - 1;
            const mvPercent = parseFloat((mvDecimal * 100).toFixed(4)); // Keep 4 decimals for precision

            console.log(`Converted Usury Rate (M.V.): ${mvPercent}%`);

            // 4. Update Financial Entities
            // Path: financial_config/general/financieras (matches Frontend ConfigModal.tsx)
            const snapshot = await db.collection("financial_config").doc("general").collection("financieras").get();
            const batch = db.batch();
            let updatedCount = 0;
            let skippedManual = 0;
            let skippedNotSynced = 0;

            snapshot.docs.forEach((doc) => {
                const entity = doc.data();

                // GUARD 1: syncedWithUsura must be explicitly true (opt-in from frontend)
                // WHY: The frontend ConfigModal.tsx has an "AUTO" checkbox that sets this flag.
                // Entities without this flag should NOT be auto-updated.
                if (entity.syncedWithUsura !== true) {
                    console.log(`Skipping ${entity.name || doc.id} (syncedWithUsura is not enabled)`);
                    skippedNotSynced++;
                    return;
                }

                // GUARD 2: Manual Override takes absolute priority (safety lock)
                if (entity.manualOverride === true) {
                    console.log(`Skipping ${entity.name || doc.id} (Manual Override active)`);
                    skippedManual++;
                    return;
                }

                // Update 'interestRate' with the calculated M.V. usury rate
                batch.update(doc.ref, {
                    interestRate: mvPercent,
                    lastAutoUpdate: admin.firestore.FieldValue.serverTimestamp(),
                    autoUpdateSource: "SFC_DATOS_GOV",
                    lastUsuryEA: usuryEA,
                    lastIBCEA: ibcEA
                });
                updatedCount++;
            });

            console.log(`Batch Summary: ${updatedCount} updated, ${skippedNotSynced} not synced, ${skippedManual} manual override`);

            if (updatedCount > 0) {
                await batch.commit();
                console.log(`Successfully updated ${updatedCount} entities to ${mvPercent}% M.V.`);
            } else {
                console.log("No entities required update (all overriden or empty).");
            }

        } catch (error: any) {
            console.error("Critical Error in UsuryRateBot:", error);
            // WHY log response body: Socrata API errors include details in the response text
            // that are essential for forensic debugging (Fase 8: Mandato Assume Nothing)
            if (error.response) {
                console.error("Socrata API Response Status:", error.response.status);
                console.error("Socrata API Response Body:", JSON.stringify(error.response.data));
            }
            // FAIL-SAFE TRIGGER
            await sendErrorEmail(error, "Cloud Function: updateUsuryRates (Monthly Cron)");
            // Re-throw to ensure Cloud Functions logs it as a failure
            throw error;
        }

        return null;
    });
