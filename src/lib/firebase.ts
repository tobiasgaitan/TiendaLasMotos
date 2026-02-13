import { initializeApp, getApps, getApp, FirebaseApp } from "firebase/app";
import { getAuth, Auth } from "firebase/auth";
import { getFirestore, Firestore } from "firebase/firestore";
import { getStorage, FirebaseStorage } from "firebase/storage";
import { getFunctions, Functions } from "firebase/functions";

const firebaseConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

let app: FirebaseApp;
let auth: Auth;
let db: Firestore;
let storage: FirebaseStorage;
let functions: Functions;

/**
 * 🛡️ ROBUST CLIENT INITIALIZATION
 * Prevents build crashes when environment variables are missing (Cloud Build).
 */
try {
    // Check for critical keys to avoid "invalid config" errors
    if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
        throw new Error("Missing Firebase Client Configuration");
    }

    app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
    storage = getStorage(app);
    functions = getFunctions(app);

} catch (error) {
    console.warn("⚠️ [Firebase Client] Initialization failed. Using MOCKS for build safety.");

    // Create a safe Mock App to satisfy types
    app = {} as FirebaseApp;

    // Mock Services to prevent "cannot read property of undefined"
    const mockService = new Proxy({}, {
        get: () => () => { } // Return a void function for any property access
    });

    auth = mockService as unknown as Auth;
    db = mockService as unknown as Firestore;
    storage = mockService as unknown as FirebaseStorage;
    functions = mockService as unknown as Functions;
}

export { auth, db, storage, functions };
