/**
 * WEB-836 Verification Script: Standalone Socrata Endpoint Test
 * 
 * Purpose: Validates the corrected Socrata query independently of Cloud Functions.
 * Usage: node test-usury-endpoint.mjs
 * 
 * Expected output: IBC rate, Usury rate (E.A.), and Monthly Vencido rate.
 */

const DATASET_URL = "https://www.datos.gov.co/resource/pare-7x5i.json";

async function testUsuryEndpoint() {
    console.log("=== WEB-836: Usury Rate Endpoint Verification ===\n");

    try {
        const params = new URLSearchParams({
            "$limit": "1",
            "$order": "vigencia_desde DESC",
            "modalidad": "CONSUMO Y ORDINARIO"
        });

        const url = `${DATASET_URL}?${params.toString()}`;
        console.log(`[1] Fetching: ${url}\n`);

        const response = await fetch(url);

        if (!response.ok) {
            const errorBody = await response.text();
            throw new Error(`HTTP ${response.status}: ${errorBody}`);
        }

        const data = await response.json();

        if (!data || data.length === 0) {
            throw new Error("API returned no data for 'CONSUMO Y ORDINARIO'. Schema may have changed again.");
        }

        const record = data[0];
        console.log("[2] Raw API Response:");
        console.log(JSON.stringify(record, null, 2));
        console.log();

        // Parse IBC (strip % suffix)
        const rawIBCStr = record.interes_bancario_corriente.replace("%", "").trim();
        const ibcEA = parseFloat(rawIBCStr);

        if (isNaN(ibcEA)) {
            throw new Error(`Invalid IBC rate format: '${record.interes_bancario_corriente}'`);
        }

        // Calculate Usury Rate = IBC × 1.5
        const usuryEA = parseFloat((ibcEA * 1.5).toFixed(2));

        // Convert Usury E.A. to M.V.
        const eaDecimal = usuryEA / 100;
        const mvDecimal = Math.pow(1 + eaDecimal, 1 / 12) - 1;
        const mvPercent = parseFloat((mvDecimal * 100).toFixed(4));

        console.log("=== RESULTS ===");
        console.log(`[3] IBC (E.A.):         ${ibcEA}%`);
        console.log(`[4] Usury Rate (E.A.):  ${usuryEA}%  (IBC × 1.5)`);
        console.log(`[5] Usury Rate (M.V.):  ${mvPercent}%`);
        console.log(`[6] Resolución:         ${record.resolucion}`);
        console.log(`[7] Vigencia:           ${record.vigencia_desde} → ${record.vigencia_hasta}`);
        console.log(`\n✅ VERIFICATION PASSED — Endpoint is functional.\n`);

    } catch (error) {
        console.error(`\n❌ VERIFICATION FAILED:`, error.message);
        process.exit(1);
    }
}

testUsuryEndpoint();
