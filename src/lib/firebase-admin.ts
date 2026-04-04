import * as admin from 'firebase-admin';
import "server-only";

/**
 * 🛡️ FIREBASE ADMIN INITIALIZATION (LAZY & PROTECTED)
 * Se movió a un patrón de inicialización perezosa para evitar el "Top-Level Crash"
 * que ocurre cuando Next.js importa el módulo en entornos de producción con ADC.
 */

/**
 * 🚀 LAZY GETTER: getDb (ADC PURO)
 * Inicia Firebase Admin utilizando Application Default Credentials (ADC).
 * Eliminado el parseo de FIREBASE_SERVICE_ACCOUNT_KEY que causaba 500s en runtime.
 */
export const getDb = () => {
    if (!admin.apps.length) {
        try {
            admin.initializeApp({
                projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'tiendalasmotos'
            });
        } catch (error) {
            console.error('⚠️ [Firebase Admin] Init Error:', error);
        }
    }
    return admin.firestore();
};
