"use server";

import { db } from "@/lib/firebase-admin";

/**
 * Normalizes all inventory items in the `pagina/catalogo/items` collection.
 * 
 * Operations:
 * 1. Uppercases `marca` and `referencia` (and `model` if present).
 * 2. Parses `cilindraje` to a clean number, removing "cc", "cm3", etc.
 * 3. Ensures `imagen_url` is populated (copying from `imagenUrl` if necessary) and cleans up `imagenUrl` legacy field if you want, 
 *    but for safety we usually just ensure `imagen_url` is the primary.
 * 
 * @returns Object with counts of processed, updated, and error items.
 */
export async function normalizeInventory() {
    console.log("🚀 Starting Inventory Normalization (Master Order V23.0)...");

    try {
        const snapshot = await db.collection("pagina").doc("catalogo").collection("items").get();
        let totalProcessed = 0;
        let totalUpdated = 0;
        let errors = 0;

        const batchSize = 400; // Firebase limit is 500
        let batch = db.batch();
        let opsInBatch = 0;
        const batches = [];

        for (const doc of snapshot.docs) {
            const data = doc.data();
            const updates: any = {};
            let needsUpdate = false;

            // 1. Uppercase MARCA
            const currentMarca = data["marca"] || data["Marca-de-la-moto"] || "";
            if (typeof currentMarca === "string") {
                const upperMarca = currentMarca.toUpperCase().trim();
                if (currentMarca !== upperMarca) {
                    updates["marca"] = upperMarca;
                    needsUpdate = true;
                }
            }

            // 2. Uppercase REFERENCIA / MODEL
            const currentRef = data["referencia"] || data["model"] || "";
            if (typeof currentRef === "string") {
                const upperRef = currentRef.toUpperCase().trim();
                if (currentRef !== upperRef) {
                    updates["referencia"] = upperRef;
                    needsUpdate = true;
                }
            }

            // 3. Clean CILINDRAJE (Displacement)
            const currentCil = data["cilindraje"] || data["displacement"] || data["cc"];
            if (currentCil) {
                // If it's already a number, great. If string, clean it.
                // We want to store it as a NUMBER in Firestore for sorting/filtering.
                let cleanCil = 0;

                if (typeof currentCil === "number") {
                    cleanCil = currentCil;
                    // If it's already a number, we might check if 'cilindraje' field itself needs to be set if it was 'displacement'
                    if (data["cilindraje"] !== cleanCil) {
                        updates["cilindraje"] = cleanCil;
                        needsUpdate = true;
                    }
                } else {
                    const str = String(currentCil).toLowerCase();
                    const cleanStr = str.replace(/cc|cm3|cm|c\.c\.|l/g, '').replace(/,/g, '.').replace(/[^0-9.]/g, '');
                    cleanCil = parseFloat(cleanStr) || 0;

                    if (cleanCil !== currentCil) {
                        updates["cilindraje"] = cleanCil; // Store as number
                        needsUpdate = true;
                    }
                }
            }

            // 4. Consolidate IMAGE (Enforce imagen_url)
            const imgUrl = data["imagen_url"];
            const legacyImg = data["imagenUrl"];

            if (!imgUrl && legacyImg) {
                updates["imagen_url"] = legacyImg;
                needsUpdate = true;
            }

            // If we have updates, add to batch
            if (needsUpdate) {
                // Also add 'lastUpdated' timestamp
                updates["lastUpdated"] = new Date().toISOString();
                updates["_normalizationV23"] = true; // Flag to know it ran

                batch.update(doc.ref, updates);
                opsInBatch++;
                totalUpdated++;
            }

            totalProcessed++;

            // Commit batch if full
            if (opsInBatch >= batchSize) {
                batches.push(batch.commit());
                batch = db.batch(); // Reset
                opsInBatch = 0;
            }
        }

        // Commit final batch
        if (opsInBatch > 0) {
            batches.push(batch.commit());
        }

        await Promise.all(batches);

        console.log(`✅ Normalization Complete. Scanned: ${totalProcessed}. Updated: ${totalUpdated}.`);
        return { success: true, processed: totalProcessed, updated: totalUpdated };

    } catch (error) {
        console.error("🔥 Error normalizing inventory:", error);
        return { success: false, error: String(error) };
    }
}
