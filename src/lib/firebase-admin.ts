import "server-only";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

/**
 * 🛡️ ROBUST FIREBASE ADMIN INITIALIZATION - V2 (STRICT MOCK)
 *
 * This file is critical for the build process.
 * If credentials are missing, we MUST NOT attempt to initialize, as it throws hard errors.
 */

let firestoreInstance: FirebaseFirestore.Firestore;

function getMockDB() {
    return new Proxy({} as FirebaseFirestore.Firestore, {
        get(_target, prop) {
            console.warn(`⚠️ [Build Mock] Accessed 'db.${String(prop)}'. Returning safe fallback.`);
            if (prop === 'collection') {
                return () => ({
                    doc: () => ({
                        get: async () => ({ exists: false, data: () => ({}) }),
                        set: async () => { },
                        update: async () => { },
                    }),
                    get: async () => ({ empty: true, docs: [] }),
                    where: () => ({ get: async () => ({ empty: true, docs: [] }) }),
                    orderBy: () => ({ limit: () => ({ get: async () => ({ empty: true, docs: [] }) }) }),
                    limit: () => ({ get: async () => ({ empty: true, docs: [] }) }),
                    select: () => ({ get: async () => ({ empty: true, docs: [] }) }),
                });
            }
            return undefined;
        }
    });
}

try {
    // 1. STRICT CHECK: If no Service Account in Env, DO NOT TRY to Init.
    // Cloud Build environment usually lacks this variable.
    if (!process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
        console.warn("⚠️ [Firebase Admin] Missing 'FIREBASE_SERVICE_ACCOUNT_KEY'. Entering MOCK mode.");
        throw new Error("Missing Credentials");
    }

    // 2. Initialize App
    if (getApps().length === 0) {
        try {
            const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
            initializeApp({
                credential: cert(serviceAccount),
            });
        } catch (jsonError) {
            console.error("⚠️ [Firebase Admin] JSON Parse Error for Service Key.");
            throw jsonError;
        }
    }

    // 3. Get Instance
    firestoreInstance = getFirestore();

} catch (error) {
    // 4. Global Catch -> Return Mock
    console.warn("⚠️ [Firebase Admin] Using MOCK DB instance due to initialization failure/missing creds.");
    firestoreInstance = getMockDB();
}

export const db = firestoreInstance;
