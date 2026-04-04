export const getDb = () => {
    // Lazy Require para engañar al bundler
    const { getApps, initializeApp } = require('firebase-admin/app');
    const { getFirestore } = require('firebase-admin/firestore');

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
