
import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import axios from "axios";
import * as cheerio from "cheerio";

admin.initializeApp();

const db = admin.firestore();

// --- Shared Logic ---

interface ProductMetadata {
    price: number | null;
    specs: Record<string, string>;
    warranty: string | null;
}

async function fetchProductDetails(url: string): Promise<ProductMetadata> {
    try {
        const { data } = await axios.get(url, {
            headers: {
                "User-Agent":
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
            },
        });
        const $ = cheerio.load(data);

        let price: number | null = null;
        const specs: Record<string, string> = {};
        let warranty: string | null = null;

        // --- 1. Price Extraction ---
        const metaPrice = $('meta[property="product:price:amount"]').attr("content");
        if (metaPrice) {
            price = parseFloat(metaPrice);
        }

        if (!price || isNaN(price)) {
            const vtexPrice = $(".vtex-product-price-1-x-currencyContainer").first().text();
            if (vtexPrice) {
                const cleanString = vtexPrice.replace(/[^\d]/g, "");
                price = parseFloat(cleanString);
            }
        }

        if (!price || isNaN(price)) {
            const genericPrice = $(".price").first().text();
            if (genericPrice) {
                const cleanString = genericPrice.replace(/[^\d]/g, "");
                price = parseFloat(cleanString);
            }
        }

        // --- 2. Technical Specs Extraction ---
        // Generic approach: look for tables or lists commonly used for specs
        // This attempts to capture key-value pairs from common layout structures

        // Strategy A: Look for standard tables
        $("table tr").each((_, el) => {
            const tds = $(el).find("td, th");
            if (tds.length >= 2) {
                const key = $(tds[0]).text().trim().replace(/:$/, "");
                const value = $(tds[1]).text().trim();
                if (key && value && key.length < 50 && value.length < 200) { // Safety checks
                    specs[key] = value;
                }
            }
        });

        // Strategy B: Definition lists (dl, dt, dd)
        $("dl").each((_, el) => {
            const dts = $(el).find("dt");
            const dds = $(el).find("dd");
            if (dts.length === dds.length) {
                dts.each((i, dt) => {
                    const key = $(dt).text().trim().replace(/:$/, "");
                    const value = $(dds[i]).text().trim();
                    if (key && value) {
                        specs[key] = value;
                    }
                });
            }
        });

        // --- 3. Warranty Extraction ---
        // Look for sections/tabs containing "Garantía" or "Warranty"
        // This is heuristic-based and might need refinement for specific sites

        // Strategy A: Check for headings or tabs with "Garantía"
        let warrantyText = "";
        const warrantyHeader = $("h2, h3, h4, .tab-title, .accordion-title").filter((_, el) => {
            return $(el).text().toLowerCase().includes("garantía");
        }).first();

        if (warrantyHeader.length > 0) {
            // Get content immediately following the header
            const nextElem = warrantyHeader.next();
            if (nextElem.length > 0) {
                warrantyText = nextElem.text().trim();
            } else {
                // Or parent's sibling or similar structure depending on standard layouts
                warrantyText = warrantyHeader.parent().text().replace(warrantyHeader.text(), "").trim();
            }
        }

        if (warrantyText) {
            warranty = warrantyText.substring(0, 500); // Limit length
        }


        return {
            price: (price && !isNaN(price)) ? price : null,
            specs,
            warranty
        };

    } catch (error) {
        console.error(`Error fetching ${url}:`, error);
        return { price: null, specs: {}, warranty: null };
    }
}

async function runPriceSync() {
    const itemsRef = db.collection("pagina").doc("catalogo").collection("items");
    const snapshot = await itemsRef.where("external_url", "!=", null).get();

    if (snapshot.empty) {
        console.log("No items with external_url found.");
        return { success: true, message: "No items to sync." };
    }

    let updatedCount = 0;
    let errorCount = 0;
    const updates: Promise<any>[] = [];

    for (const doc of snapshot.docs) {
        const moto = doc.data();
        const url = moto.external_url;

        if (!url) continue;

        updates.push(
            (async () => {
                try {
                    const metadata = await fetchProductDetails(url);

                    if (metadata.price !== null || Object.keys(metadata.specs).length > 0) {

                        const updateData: any = {
                            last_checked: admin.firestore.FieldValue.serverTimestamp()
                        };

                        // Update Price if changed
                        if (metadata.price !== null && metadata.price !== moto.precio) {
                            console.log(`Updating price for ${moto.referencia}: ${moto.precio} -> ${metadata.price}`);
                            updateData.precio = metadata.price;
                        }

                        // Update Specs if found (merge or overwrite?) - Using overwrite for simplicity/freshness
                        if (Object.keys(metadata.specs).length > 0) {
                            updateData.fichatecnica = metadata.specs;
                        }

                        // Update Warranty if found
                        if (metadata.warranty) {
                            updateData.garantia = metadata.warranty;
                        }

                        await doc.ref.set(updateData, { merge: true });
                        updatedCount++;
                    } else {
                        console.warn(`Could not extract useful data for ${moto.referencia} (${url})`);
                        errorCount++;
                    }
                } catch (err) {
                    console.error(`Failed during processing ${moto.referencia}:`, err);
                    errorCount++;
                }
            })()
        );
    }

    await Promise.all(updates);
    return { success: true, updated: updatedCount, errors: errorCount, scanned: snapshot.size };
}

// --- Cloud Functions Exports ---

// 1. Scheduled Function (Monthly: Day 1 at 3:00 AM)
// Timezone: America/Bogota ideally, but standard crontab is UTC usually in Firebase unless specified.
// Configuring for 'America/Bogota'
export const scheduledSync = functions.runWith({ memory: "1GB", timeoutSeconds: 300 }).pubsub
    .schedule("0 3 1 * *")
    .timeZone("America/Bogota")
    .onRun(async (context) => {
        console.log("Starting scheduled price sync...");
        const result = await runPriceSync();
        console.log("Scheduled sync finished:", result);
        return null;
    });

// 2. Manual HTTP Trigger
export const manualSyncBot = functions.runWith({ memory: "1GB", timeoutSeconds: 300 }).https.onRequest(async (req, res) => {
    // Security: Check for Secret Token
    // Security: Check for Secret Token
    // Hardcoded token for immediate fix
    const validationToken = "SYNC_MASTER_KEY_2025_SECURE_HARDCODED"; // process.env.CRON_SECRET_TOKEN;
    if (!validationToken) {
        console.error("CRON_SECRET_TOKEN is not defined.");
        res.status(500).send("Server Config Error");
        return;
    }

    let requestToken = (req.query.token as string) || (req.headers["x-sync-token"] as string);

    if (!requestToken && req.headers.authorization) {
        const parts = req.headers.authorization.split(" ");
        if (parts.length === 2 && parts[0] === "Bearer") {
            requestToken = parts[1];
        }
    }

    // Trim clean
    if (requestToken) requestToken = requestToken.trim();

    if (requestToken !== validationToken) {
        console.warn(`Unauthorized sync attempt. Received token length: ${requestToken?.length}, Expected token length: ${validationToken?.length}`);
        res.status(403).send("Unauthorized: Invalid Token");
        return;
    }

    if (req.method !== "POST") {
        res.status(405).send("Method Not Allowed");
        return;
    }

    console.log("Starting manual price sync via HTTP (Authorized)...");
    try {
        const result = await runPriceSync();
        res.status(200).json(result);
    } catch (error) {
        console.error("Manual sync failed:", error);
        res.status(500).send("Internal Server Error");
    }
});
