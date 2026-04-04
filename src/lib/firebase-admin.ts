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

// Nota: Acceder a admin.firestore() fuera de un bloque controlado puede causar 500 
// si la inicialización falló. La persistencia debe manejarse con try/catch en el llamado.
const db = admin.firestore();
export { db };
