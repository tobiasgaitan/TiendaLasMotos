import { initializeApp, getApps, getApp, FirebaseApp } from "firebase/app";
import { getAuth, Auth } from "firebase/auth";
import {
    getFirestore,
    enableIndexedDbPersistence,
    clearIndexedDbPersistence,
    terminate,
    Firestore,
} from "firebase/firestore";
import { getStorage, FirebaseStorage } from "firebase/storage";
import { getFunctions, Functions } from "firebase/functions";

export const CLAVE_FLAG_ASESOR = 'tlm_offline_asesor';
export const CLAVE_RECARGA_OFFLINE = 'tlm_offline_reload_done';

let persistenciaOfflineLista: Promise<void> = Promise.resolve();
let persistenciaOfflineIntentada = false;

function leerFlagOffline(): boolean {
    if (typeof window === "undefined") return false;
    try {
        return window.localStorage.getItem(CLAVE_FLAG_ASESOR) === "1";
    } catch (error) {
        console.error("[firebase] No se pudo leer el flag offline:", error);
        return false;
    }
}

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

    // WEB-038: persistencia offline SOLO si el asesor ya fue detectado y
    // dejó el flag. La recarga única la coordina AuthContext.
    if (leerFlagOffline()) {
        persistenciaOfflineIntentada = true;
        try {
            persistenciaOfflineLista = enableIndexedDbPersistence(db).catch(
                (error) => {
                    console.error(
                        "[firebase] Persistencia offline no disponible:",
                        error
                    );
                }
            );
        } catch (error) {
            console.error(
                "[firebase] Persistencia offline no disponible:",
                error
            );
            persistenciaOfflineLista = Promise.resolve();
        }
    }
} catch (error) {
    console.error(
        "⚠️ [Firebase Client] Initialization failed. Using SOPHISTICATED MOCKS for build safety.",
        error
    );

    // Create a safe Mock App
    app = {
        name: '[DEFAULT-MOCK]',
        options: {},
        automaticDataCollectionEnabled: false,
    } as unknown as FirebaseApp;

    // 🎭 SOPHISTICATED PROXY MOCK FOR DB
    // This allows ANY property access (like .type, .app, .toJSON, ._delegate) to succeed.
    // It captures calls to collection() and returns another Proxy, recursively.

    const createRecursiveMock = (name: string): any => {
        return new Proxy(() => { }, {
            get(_target, prop) {
                if (prop === 'type') return 'firestore';
                if (prop === 'app') return app;
                if (prop === 'toJSON') return () => ({});
                // Return query snapshot mock for getDocs
                if (prop === 'docs') return [];
                if (prop === 'empty') return true;
                if (prop === 'size') return 0;
                if (prop === 'forEach') return () => { };
                if (prop === 'map') return () => [];

                // Recursively return more mocks
                return createRecursiveMock(`${name}.${String(prop)}`);
            },
            apply(_target, _thisArg, _argArray) {
                // If called as a function (e.g. collection(db, 'foo')), return a mock object
                return createRecursiveMock(`${name}()`);
            }
        });
    }

    db = createRecursiveMock('db') as unknown as Firestore;

    auth = {} as Auth;
    storage = {} as FirebaseStorage;
    functions = {} as Functions;
}

/**
 * WEB-038: purga de la persistencia offline al cerrar sesión.
 *
 * Si la persistencia nunca fue solicitada no se termina la instancia de
 * Firestore (evita romper la sesión de admin). En todos los casos se eliminan
 * el flag de asesor y el guard de recarga.
 */
export async function purgarPersistenciaOffline(): Promise<void> {
    if (persistenciaOfflineIntentada) {
        try {
            await terminate(db);
        } catch (error) {
            console.error(
                "[firebase] No se pudo terminar Firestore al cerrar sesión:",
                error
            );
        }

        try {
            await clearIndexedDbPersistence(db);
        } catch (error) {
            console.error(
                "[firebase] No se pudo purgar IndexedDB al cerrar sesión:",
                error
            );
        }
        persistenciaOfflineIntentada = false;
    }

    if (typeof window !== "undefined") {
        try {
            window.localStorage.removeItem(CLAVE_FLAG_ASESOR);
            window.sessionStorage.removeItem(CLAVE_RECARGA_OFFLINE);
        } catch (error) {
            console.error(
                "[firebase] No se pudo limpiar el flag offline al cerrar sesión:",
                error
            );
        }
    }
}

export { auth, db, storage, functions, persistenciaOfflineLista };
