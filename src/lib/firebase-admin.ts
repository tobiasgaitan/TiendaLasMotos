import * as admin from 'firebase-admin';
import "server-only";

if (!admin.apps.length) {
    try {
        if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
            // Fallback para desarrollo local si la llave existe
            const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount)
            });
        } else {
            // Entorno Producción (Cloud Run / Firebase): Uso automático de credenciales nativas (ADC)
            admin.initializeApp();
        }
    } catch (error) {
        console.error('⚠️ [Firebase Admin] Error de Inicialización:', error);
    }
}

// Mantener el nombre de export 'db' para compatibilidad con actions.ts
const db = admin.firestore();
export { db };
