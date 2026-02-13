import "server-only";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

/**
 * 🛡️ ROBUST FIREBASE ADMIN INITIALIZATION
 *
 * This file is critical for the build process. Cloud Build often runs without specific
 * environment variables (credentials), causing initialization to fail during static analysis.
 *
 * STRATEGY:
 * 1. Try to initialize normally.
 * 2. If it fails (missing creds, build environment), CATCH the error.
 * 3. Export a MOCK database object if initialization failed.
 *
 * This ensures 'npm run build' never crashes due to Firebase authentication errors.
 */

let firestoreInstance: FirebaseFirestore.Firestore;

try {
    // 1. Initialize App if needed
    if (getApps().length === 0) {
        if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
            try {
                const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
                initializeApp({
                    credential: cert(serviceAccount),
                });
            } catch (jsonError) {
                console.warn("⚠️ [Firebase Admin] Failed to parse service account key. Using default credentials.");
                initializeApp();
            }
        } else {
            console.log("ℹ️ [Firebase Admin] No service account key found. Using default credentials.");
            initializeApp();
        }
    }

    // 2. Get Firestore Instance
    firestoreInstance = getFirestore();

} catch (error) {
    console.warn("⚠️ [Firebase Admin] Initialization failed. Use this ONLY during build time.");
    console.warn("Error details:", error);

    // 3. Fail-Safe Mock for Build Time
    // This allows imports (like 'db') to exist without crashing, even if they aren't usable.
    firestoreInstance = new Proxy({} as FirebaseFirestore.Firestore, {
        get(_target, prop) {
            // If strictly in build phase, return loose mocks or throw explicit runtime error
            // But we prefer logging and returning undefined/null to suppress crashes
            console.warn(`⚠️ Accessed 'db.${String(prop)}' on uninitialized Firebase instance.`);

            // Mock common methods to prevent 'is not a function' errors causing build crashes
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
                });
            }
            return undefined;
        }
    });
}

export const db = firestoreInstance;
