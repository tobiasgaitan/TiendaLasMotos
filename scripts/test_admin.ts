
import * as admin from 'firebase-admin';

async function main() {
    try {
        console.log('Initializing Admin SDK...');
        // Try applicationDefault first
        try {
            admin.initializeApp({
                credential: admin.credential.applicationDefault(),
                projectId: 'tiendalasmotos'
            });
            console.log('✅ Admin SDK Initialized with ApplicationDefault');
        } catch (e) {
            console.log('⚠️ ApplicationDefault failed, trying no-credential (for emulators/GCP)...');
            if (!admin.apps.length) admin.initializeApp({ projectId: 'tiendalasmotos' });
        }

        const db = admin.firestore();
        const testRef = db.collection('pagina').doc('test_write');
        // Try a write?
        // await testRef.set({ test: true });
        // console.log('✅ Write success');

        // Just try a read for now to see if it crashes on auth
        const docs = await db.collection('pagina').limit(1).get();
        console.log('✅ Read success (Admin)');

    } catch (e) {
        console.error('❌ Admin Test Failed:', e);
    }
}

main();
