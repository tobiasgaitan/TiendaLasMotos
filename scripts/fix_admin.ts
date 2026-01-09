
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// Initialize Admin SDK
// Validates if apps are already initialized to avoid duplicate app errors
if (!getApps().length) {
    initializeApp(); // Uses ADC (Application Default Credentials)
}

const db = getFirestore();

async function run() {
    console.log("Starting Infrastructure Repair...");

    const INITIAL_ROWS = [
        {
            id: '0-99',
            label: '0 - 99 cc',
            minCC: 0,
            maxCC: 99,
            registrationCreditGeneral: 660000,
            registrationCreditSantaMarta: 760000,
            registrationCashEnvigado: 530000,
            registrationCashCienaga: 595000,
            registrationCashZonaBananera: 600000,
            registrationCashSantaMarta: 730000
        },
        {
            id: '100-124',
            label: '100 - 124 cc',
            minCC: 100,
            maxCC: 124,
            registrationCreditGeneral: 740000,
            registrationCreditSantaMarta: 840000,
            registrationCashEnvigado: 605000,
            registrationCashCienaga: 680000,
            registrationCashZonaBananera: 680000,
            registrationCashSantaMarta: 820000
        },
        {
            id: '125-200',
            label: '125 - 200 cc',
            minCC: 125,
            maxCC: 200,
            registrationCreditGeneral: 820000,
            registrationCreditSantaMarta: 920000,
            registrationCashEnvigado: 605000,
            registrationCashCienaga: 680000,
            registrationCashZonaBananera: 680000,
            registrationCashSantaMarta: 820000
        },
        {
            id: 'gt-200',
            label: 'Mayor a 200 cc',
            minCC: 201,
            maxCC: 99999,
            registrationCreditGeneral: 1020000,
            registrationCreditSantaMarta: 1120000,
            registrationCashEnvigado: 1040000,
            registrationCashCienaga: 1110000,
            registrationCashZonaBananera: 1100000,
            registrationCashSantaMarta: 1260000
        },
        {
            id: 'electrical',
            label: 'Eléctricas',
            category: 'ELECTRICA',
            registrationCreditGeneral: 440000,
            registrationCreditSantaMarta: 540000,
            registrationCashEnvigado: 400000,
            registrationCashCienaga: 470000,
            registrationCashZonaBananera: 470000,
            registrationCashSantaMarta: 605000
        },
        {
            id: 'motocarro',
            label: 'Motocarros',
            category: 'MOTOCARRO Y/O MOTOCARGUERO',
            minCC: 0,
            maxCC: 99999,
            registrationCreditGeneral: 850000,
            registrationCreditSantaMarta: 950000,
            registrationCashEnvigado: 650000,
            registrationCashCienaga: 720000,
            registrationCashZonaBananera: 720000,
            registrationCashSantaMarta: 870000
        }
    ];

    try {
        // 1. Matriz
        console.log("Writing Financial Parameters...");
        await db.collection('config').doc('financial_parameters').set({
            rows: INITIAL_ROWS,
            lastUpdated: new Date().toISOString()
        });
        console.log("✅ Financial Parameters Written.");

        // 2. Usuario
        console.log("Writing User Profile...");
        await db.collection('usuarios').doc('t05KiQCGQgUWFARvczn3nuXp9Qz2').set({
            email: 'tobiasgaitan@gmail.com',
            name: 'Tobias',
            active: true,
            role: 'admin',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        });
        console.log("✅ User Profile Written.");

    } catch (e) {
        console.error("❌ Error executing repair:", e);
        process.exit(1);
    }
}

run();
