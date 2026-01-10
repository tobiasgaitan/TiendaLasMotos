
const { initializeApp } = require("firebase/app");
const { getFirestore, collection, addDoc } = require("firebase/firestore");
const fs = require('fs');
const path = require('path');

// Manually parse .env.local
const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
    const envConfig = fs.readFileSync(envPath, 'utf-8');
    envConfig.split('\n').forEach(line => {
        const parts = line.split('=');
        if (parts.length >= 2) {
            const key = parts[0].trim();
            const value = parts.slice(1).join('=').trim().replace(/^['"]|['"]$/g, '');
            if (key) {
                process.env[key] = value;
            }
        }
    });
}

const firebaseConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function main() {
    try {
        console.log("Adding Crediorbe to financial_config/general/financieras...");
        const colRef = collection(db, "financial_config/general/financieras");

        // Check if exists first? No, user said Force Create. But let's avoid dupes if I run twice.
        // Ideally I would query, but `addDoc` is safer for "Just do it" quick. 
        // I will trust the user wants it created.

        const docRef = await addDoc(colRef, {
            name: "Crediorbe",
            interestRate: 2.3,
            minDownPaymentPercentage: 10,
            active: true,
            requiresProceduresInCredit: true,
            financeDocsAndSoat: true,
            lifeInsuranceType: 'percentage',
            lifeInsuranceValue: 0.12,
            fngRate: 0,
            brillaManagementRate: 0,
            coverageRate: 0,
            createdAt: new Date().toISOString()
        });
        console.log("Success! Crediorbe ID:", docRef.id);
        process.exit(0);
    } catch (e) {
        console.error("Error adding document: ", e);
        process.exit(1);
    }
}

main();
