import "server-only";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

// Initialize Firebase Admin
if (getApps().length === 0) {
    if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
        try {
            const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
            initializeApp({
                credential: cert(serviceAccount),
            });
        } catch (error) {
            console.error("Failed to parse FIREBASE_SERVICE_ACCOUNT_KEY:", error);
            // Fallback to default credentials (e.g., Google Cloud environment)
            initializeApp();
        }
    } else {
        // Fallback to default credentials
        initializeApp();
    }
}

export const db = getFirestore();
