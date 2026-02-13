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

    // Create a safe Mock App
    app = {
        name: '[DEFAULT-MOCK]',
        options: {},
        automaticDataCollectionEnabled: false,
    } as unknown as FirebaseApp;

    // Mock DB with stubbed methods to prevent crashes if 'collection()' is called
    db = {
        type: 'firestore',
        app: app,
        toJSON: () => ({}),
    } as unknown as Firestore;

    // IMPORTANT: In the modular SDK, methods like 'collection(db, ...)' might inspect 'db'.
    // We cannot easily mock the module exports themselves (getDocs, collection, etc.) from here.
    // BUT we can make 'db' look like a valid Firestore instance to pass basics checks.
    // The real protection is 'export const dynamic = "force-dynamic"' in the pages.

    auth = {} as Auth;
    storage = {} as FirebaseStorage;
    functions = {} as Functions;
}

export { auth, db, storage, functions };
