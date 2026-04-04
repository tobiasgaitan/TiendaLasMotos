import * as admin from 'firebase-admin';
import "server-only";

/**
 * 🛡️ FIREBASE ADMIN INITIALIZATION (ADC STABILIZED)
 * Para Cloud Run / App Engine: Se utiliza la identidad nativa (ADC).
 * Para Desarrollo Local: Se utiliza FIREBASE_SERVICE_ACCOUNT_KEY si existe.
 */

if (!admin.apps.length) {
    try {
        if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
            const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount)
            });
        } else {
            // Entorno Producción (GCP ADC) con Project ID Explícito
            admin.initializeApp({
                projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'tiendalasmotos'
            });
        }
    } catch (error) {
        console.error('⚠️ [Firebase Admin] Error Crítico de Inicialización:', error);
    }
}

/**
 * 🚀 LAZY GETTER: getDb
 * Evita el "Top-Level Crash" durante la importación del módulo.
 * La excepción real se lanzará dentro del try/catch de la Server Action.
 */
export const getDb = () => admin.firestore();
