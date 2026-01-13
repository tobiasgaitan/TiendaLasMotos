
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import * as fs from 'fs';
import * as path from 'path';

// INTENT: Try to find service account or use default creds
// Since we don't know where the service account is, we will try to use default credentials first
// or look for a specific file often used in this project 'service-account.json'

async function migrate() {
    // Initialize App
    const serviceAccountPath = path.resolve(process.cwd(), 'service-account.json');

    // Conditionally initialize
    if (getApps().length === 0) {
        if (fs.existsSync(serviceAccountPath)) {
            console.log("🔑 Found service-account.json, using it.");
            const serviceAccount = require(serviceAccountPath);
            initializeApp({
                credential: cert(serviceAccount)
            });
        } else {
            console.log("⚠️ No service-account.json found. Attempting Application Default Credentials...");
            // This requires the user to have run 'gcloud auth application-default login'
            initializeApp();
        }
    }

    const db = getFirestore();
    const collectionRef = db.collection('pagina/catalogo/items');

    console.log("🚀 Starting Image Migration...");
    console.log("Target Collection: pagina/catalogo/items");

    const snapshot = await collectionRef.get();
    console.log(`📊 Found ${snapshot.size} documents.`);

    let updatedCount = 0;
    let batch = db.batch();
    let batchCount = 0;
    const BATCH_LIMIT = 400;

    for (const doc of snapshot.docs) {
        const data = doc.data();

        // 1. Identify Candidate
        let bestImage = "";

        // Priority List
        // 1. imagenUrl (can be string or object)
        if (typeof data.imagenUrl === 'string') {
            bestImage = data.imagenUrl;
        } else if (data.imagenUrl && typeof data.imagenUrl === 'object' && data.imagenUrl.url) {
            bestImage = data.imagenUrl.url;
        }

        // 2. imageUrl (Legacy English)
        if (!bestImage && typeof data.imageUrl === 'string') {
            bestImage = data.imageUrl;
        }

        // 3. image (Old Legacy)
        if (!bestImage && typeof data.image === 'string') {
            bestImage = data.image;
        }

        // 4. foto (Very Old Legacy)
        if (!bestImage && typeof data.foto === 'string') {
            bestImage = data.foto;
        }

        // 5. Existing 'imagen_url' (If partially migrated)
        if (!bestImage && typeof data.imagen_url === 'string') {
            bestImage = data.imagen_url;
        }

        // If we have a valid image, normalize it
        if (bestImage) {
            const updateData: any = {
                imagen_url: bestImage,
                // DELETE OLD KEYS
                imagenUrl: FieldValue.delete(),
                imageUrl: FieldValue.delete(),
                image: FieldValue.delete(),
                foto: FieldValue.delete(),
                url: FieldValue.delete(), // Sometimes used
            };

            batch.update(doc.ref, updateData);
            updatedCount++;
            batchCount++;

            // Commit batch if limit reached
            if (batchCount >= BATCH_LIMIT) {
                await batch.commit();
                console.log(`💾 Committed batch of ${batchCount} updates...`);
                batch = db.batch(); // Reset
                batchCount = 0;
            }
        } else {
            console.warn(`⚠️ No image found for doc: ${doc.id} (${data.model || 'Unknown'})`);
        }
    }

    // Final Commit
    if (batchCount > 0) {
        await batch.commit();
        console.log(`💾 Committed final batch of ${batchCount} updates.`);
    }

    console.log("✅ Migration Complete!");
    console.log(`Total Docs Processed: ${snapshot.size}`);
    console.log(`Total Docs Updated: ${updatedCount}`);
}

migrate().catch(console.error);
