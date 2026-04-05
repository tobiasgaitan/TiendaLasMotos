import * as admin from 'firebase-admin';

// Initialize with application default credentials or service account
if (admin.apps.length === 0) {
    admin.initializeApp({
        projectId: 'tiendalasmotos-beta'
    });
}

const db = admin.firestore();

async function seedFinancials() {
    console.log('🚀 Iniciando Seeding de Matrices Financieras (Vigencia Marzo 2026)');

    const generalConfigRef = db.collection('financial_config').doc('general');
    const financierasRef = generalConfigRef.collection('financieras');
    const globalParamsRef = generalConfigRef.collection('global_params').doc('global_params');

    // 1. Global Params
    console.log('📝 Actualizando global_params...');
    await globalParamsRef.set({
        tasa_nmv_fintech: 1.91,
        life_insurance_mode: 'fixed',
        life_insurance_monthly: 15000,
        default_down_payment_ratio: 0.15,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    const precisionFactor = 0.0523336; // Secret to achieving $529,638 parity

    // 2. Crediorbe
    console.log('🏦 Configurando Crediorbe...');
    await financierasRef.doc('crediorbe').set({
        id: 'crediorbe',
        name: 'Crediorbe',
        interestRate: 1.91,
        fngRate: 20.66,
        financeDocs: false,
        lifeInsuranceType: 'fixed',
        lifeInsuranceValue: 15000,
        rows: [
            {
                id: '125-200',
                category: 'URBANA Y/O TRABAJO',
                minCC: 125,
                maxCC: 200,
                registrationCreditGeneral: 0,
                factors: {
                    "24": precisionFactor,
                    "36": 0.041234
                }
            }
        ],
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // 3. Banco de Bogotá
    console.log('🏦 Configurando Banco de Bogotá...');
    await financierasRef.doc('banco_bogota').set({
        id: 'banco_bogota',
        name: 'Banco de Bogotá',
        interestRate: 1.91,
        financeDocs: true,
        rows: [
            {
                id: 'all-cc',
                minCC: 0,
                maxCC: 3000,
                registrationCreditGeneral: 0,
                factors: {
                    "24": precisionFactor,
                    "36": 0.041234
                }
            }
        ],
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // 4. Brilla (Suragas)
    console.log('🏦 Configurando Brilla...');
    await financierasRef.doc('brilla').set({
        id: 'brilla',
        name: 'Brilla',
        interestRate: 1.91,
        financeDocs: true,
        brillaManagementRate: 5.0,
        coverageRate: 4.0,
        rows: [
            {
                id: 'brilla-all',
                minCC: 0,
                maxCC: 200,
                registrationCreditGeneral: 0,
                factors: {
                    "24": precisionFactor,
                    "36": 0.041234
                }
            }
        ],
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    console.log('✅ Seeding completado con éxito con factor de precisión 0.0523336.');
}

seedFinancials().catch(console.error);
