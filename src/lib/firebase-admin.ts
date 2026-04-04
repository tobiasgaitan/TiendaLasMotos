import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

export const getDb = () => {
    if (!getApps().length) {
        try {
            initializeApp({
                projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'tiendalasmotos'
            });
        } catch (error) {
            console.error('⚠️ [Firebase Admin] Init Error:', error);
        }
    }
    return getFirestore();
};
