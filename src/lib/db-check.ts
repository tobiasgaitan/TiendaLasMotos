import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

async function checkDatabaseConnection() {
    console.log('🔍 Checking Firestore connection...');

    try {
        if (!process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
            throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY is missing in environment variables.');
        }

        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);

        if (getApps().length === 0) {
            initializeApp({
                credential: cert(serviceAccount),
            });
        }

        const db = getFirestore();
        const startTime = Date.now();

        // Try to list collections or read a test document to verify connection
        await db.listCollections();

        const duration = Date.now() - startTime;
        console.log(`✅ Firestore connection successful! (${duration}ms)`);
        process.exit(0);
    } catch (error) {
        console.error('❌ Firestore connection failed:', error);
        process.exit(1);
    }
}

checkDatabaseConnection();
