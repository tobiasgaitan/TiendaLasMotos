import * as admin from 'firebase-admin';

if (!process.env.GOOGLE_APPLICATION_CREDENTIALS && !process.env.FIREBASE_SERVICE_ACCOUNT) {
    console.warn('⚠️ No credentials found. setup credentials to run this script safely.');
    // In a real scenario we might fail, but for now we warn if local
}

try {
    if (!admin.apps.length) {
        admin.initializeApp({
            credential: admin.credential.applicationDefault(),
        });
    }
} catch (e) {
    console.error("Failed to initialize admin", e);
    process.exit(1);
}

const db = admin.firestore();

async function checkHealth() {
    const collectionName = '_system_check_';
    const docName = 'health_check';

    console.log(`🏥 Starting Health Check on ${collectionName}...`);

    try {
        const ref = db.collection(collectionName).doc(docName);
        const payload = {
            status: 'ok',
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            v: '15.0.0'
        };

        // Write
        await ref.set(payload);
        console.log('✅ Write successful');

        // Read
        const doc = await ref.get();
        if (!doc.exists) {
            throw new Error('Document written but not found.');
        }
        console.log('✅ Read successful');

        console.log('💚 Health Check Passed!');
        process.exit(0);
    } catch (error) {
        console.error('❌ Health Check Failed:', error);
        process.exit(1);
    }
}

checkHealth();
