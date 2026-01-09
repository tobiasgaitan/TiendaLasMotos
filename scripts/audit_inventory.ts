import { db } from '../src/lib/firebase';
import { collection, getDocs } from 'firebase/firestore';

// Mock Parser logic to match what we just implemented in firestore.ts
const parseDisplacement = (raw: any) => {
    if (!raw) return 0;
    let clean = String(raw).toLowerCase();
    clean = clean.replace(/cc|cm3|cm|c\.c\.|l/g, ''); // Remove units FIRST
    clean = clean.replace(/,/g, '.'); // Replace comma
    clean = clean.replace(/[^0-9.]/g, ''); // Remove non-digits/dots
    return parseFloat(clean) || 0;
};

async function auditInventory() {
    console.log('Starting Inventory Audit...');
    try {
        const itemsRef = collection(db, 'pagina', 'catalogo', 'items');
        const snapshot = await getDocs(itemsRef);

        console.log(`Found ${snapshot.docs.length} items in inventory.`);

        const issues: any[] = [];
        const corrections: any[] = [];

        snapshot.docs.forEach(doc => {
            const data = doc.data();
            const raw = data.cilindraje || data.cc || data.displacement;
            const parsed = parseDisplacement(raw);

            // Check for potential issues
            const hasDecimal = String(raw).includes('.') || String(raw).includes(',');
            const isAnomaly = parsed > 10000 || parsed === 0;

            if (hasDecimal || isAnomaly) {
                issues.push({
                    id: doc.id,
                    name: data.referencia || data.model,
                    raw: raw,
                    parsed: parsed,
                    status: isAnomaly ? 'CRITICAL_ANOMALY' : 'DECIMAL_DETECTED_OK'
                });
            }
        });

        console.table(issues);
        console.log(`Audit Complete. Found ${issues.length} items with decimals or anomalies.`);

    } catch (error) {
        console.error('Audit failed:', error);
    }
}

// execute if running standalone
if (require.main === module) {
    auditInventory();
}
