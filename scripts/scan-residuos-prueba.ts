import { getDb } from '../src/lib/firebase-admin';

async function main() {
    const db = getDb();
    const colecciones = ['prospectos', 'creditos', 'clientes_credito', 'sys_admin_users'];
    
    for (const col of colecciones) {
        console.log(`\n=== Escaneando ${col} ===`);
        const snap = await db.collection(col).get();
        let residuos = 0;
        snap.forEach(doc => {
            const data = doc.data();
            const str = JSON.stringify(data).toLowerCase();
            if (str.includes('prueba') || str.includes('test_') || str.includes('simulacro') || str.includes('faker')) {
                console.log(`  [RESIDUO] ${doc.id}`);
                residuos++;
            }
        });
        console.log(`Total residuos en ${col}: ${residuos}`);
    }
}
main().catch(console.error);
