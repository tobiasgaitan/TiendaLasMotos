
import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import axios from "axios";
import * as cheerio from "cheerio";

admin.initializeApp();

const db = admin.firestore();

// --- Shared Logic ---

async function fetchPrice(url: string): Promise<number | null> {
    try {
        const { data } = await axios.get(url, {
            headers: {
                "User-Agent":
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
            },
        });
        const $ = cheerio.load(data);
        let price: number | null = null;

        // 1. Try Meta Tag (Most reliable for VTEX/SEO)
        const metaPrice = $('meta[property="product:price:amount"]').attr("content");
        if (metaPrice) {
            price = parseFloat(metaPrice);
        }

        // 2. Try VTEX specific class if meta fails
        if (!price || isNaN(price)) {
            const vtexPrice = $(".vtex-product-price-1-x-currencyContainer").first().text();
            if (vtexPrice) {
                // Remove non-numeric chars except format (assuming COP, might have points)
                // Usually comes as "$ 15.990.000" -> "15990000"
                const cleanString = vtexPrice.replace(/[^\d]/g, "");
                price = parseFloat(cleanString);
            }
        }

        // 3. Fallback generic class
        if (!price || isNaN(price)) {
            // Fallback for some auteco landing pages that might differ
            const genericPrice = $(".price").first().text();
            if (genericPrice) {
                const cleanString = genericPrice.replace(/[^\d]/g, "");
                price = parseFloat(cleanString);
            }
        }

        return (price && !isNaN(price)) ? price : null;
    } catch (error) {
        console.error(`Error fetching ${url}:`, error);
        return null;
    }
}

async function runPriceSync() {
    const itemsRef = db.collection("pagina").doc("catalogo").collection("items");
    // Only query items that have an external_url
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
                    const newPrice = await fetchPrice(url);

                    if (newPrice !== null) {
                        const currentPrice = moto.precio;

                        // Compare (ignoring small float diffs if any, though usually integers in COP)
                        if (currentPrice !== newPrice) {
                            console.log(`Updating price for ${moto.referencia}: ${currentPrice} -> ${newPrice}`);
                            await doc.ref.update({
                                precio: newPrice,
                                last_checked: admin.firestore.FieldValue.serverTimestamp()
                            });
                            updatedCount++;
                        } else {
                            // Just update timestamp to show we checked
                            await doc.ref.update({
                                last_checked: admin.firestore.FieldValue.serverTimestamp()
                            });
                        }
                    } else {
                        console.warn(`Could not extract price for ${moto.referencia} (${url})`);
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
export const manualSyncBot = functions.runWith({ memory: "1GB", timeoutSeconds: 300, secrets: ["CRON_SECRET_TOKEN"] }).https.onRequest(async (req, res) => {
    // Security: Check for Secret Token
    // Security: Check for Secret Token
    const validationToken = process.env.CRON_SECRET_TOKEN;
    if (!validationToken) {
        console.error("CRON_SECRET_TOKEN is not defined in the environment.");
        // Fail closed
        res.status(500).send("Internal Server Configuration Error");
        return;
    }

    const requestToken = req.query.token || req.headers["x-sync-token"];

    if (requestToken !== validationToken) {
        console.warn("Unauthorized sync attempt.");
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
