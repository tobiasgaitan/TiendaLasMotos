import * as admin from 'firebase-admin';
import "server-only";

/**
 * 🛡️ FIREBASE ADMIN INITIALIZATION (LAZY & PROTECTED)
 * Se movió a un patrón de inicialización perezosa para evitar el "Top-Level Crash"
 * que ocurre cuando Next.js importa el módulo en entornos de producción con ADC.
 */

let isInitialized = false;

function initializeAdmin() {
    if (isInitialized || admin.apps.length > 0) {
        isInitialized = true;
        return;
    }

    try {
        if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
            const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount)
            });
        } else {
            // Entorno Producción (GCP ADC)
            admin.initializeApp({
                projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'tiendalasmotos'
            });
        }
        isInitialized = true;
    } catch (error) {
        console.error('⚠️ [Firebase Admin] Error Crítico de Inicialización:', error);
        throw error; // Re-lanzamos para que el try/catch de la Server Action lo capture.
    }
}

/**
 * 🚀 LAZY GETTER: getDb
 * Inicia Firebase solo cuando se solicita la base de datos por primera vez.
 * Esto garantiza que los errores sean capturados por el flujo de ejecución de la acción.
 */
export const getDb = () => {
    initializeAdmin();
    return admin.firestore();
};
