import 'server-only';

import { initializeApp, getApps, getApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { getAuth, type Auth } from 'firebase-admin/auth';

/**
 * Firebase Admin SDK — singleton estricto (QUICK-023).
 *
 * - Cero `eval` / `require` dinámico: imports ES6 estáticos para que Node.js
 *   respete su caché de módulos nativo.
 * - `server-only`: el build falla si este módulo se bundela en el cliente.
 * - `initializeApp` se ejecuta exactamente una vez por instancia (Cloud Run).
 */

type GlobalWithAdminApp = typeof globalThis & {
    __firebaseAdminApp?: App;
};

/**
 * Única función privada de inicialización. `getDb` y `getAdminAuth`
 * se limitan a consumirla (Regla del Cirujano).
 */
function getAdminApp(): App {
    const g = globalThis as GlobalWithAdminApp;

    if (g.__firebaseAdminApp) {
        return g.__firebaseAdminApp;
    }

    if (getApps().length > 0) {
        g.__firebaseAdminApp = getApp();
        return g.__firebaseAdminApp;
    }

    try {
        g.__firebaseAdminApp = initializeApp({
            projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'tiendalasmotos',
        });
        console.log('✅ [Firebase Admin] Nueva instancia inicializada vía ADC');
    } catch (error) {
        console.error('⚠️ [Firebase Admin] Error crítico de inicio:', error);
        throw error;
    }

    return g.__firebaseAdminApp;
}

export const getDb = (): Firestore => {
    return getFirestore(getAdminApp());
};

export const getAdminAuth = (): Auth => {
    return getAuth(getAdminApp());
};
