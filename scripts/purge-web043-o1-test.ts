import { getDb } from '../src/lib/firebase-admin';

async function purge() {
    const db = getDb();
    const referencia = 'TEST-WEB-043-O1';

    // 1. Eliminar el repuesto del catálogo
    await db.collection('inventario_repuestos').doc(referencia).delete();
    console.log(`✅ Eliminado: inventario_repuestos/${referencia}`);

    // 2. Eliminar el asiento del ledger asociado
    const ledgerSnapshot = await db.collection('historial_auditoria_inventario')
        .where('documento_id', '==', referencia)
        .where('operacion', '==', 'CREATE')
        .get();

    for (const doc of ledgerSnapshot.docs) {
        await doc.ref.delete();
    }
    console.log(`✅ Eliminados: ${ledgerSnapshot.size} asientos de ledger para ${referencia}`);
    
    process.exit(0);
}

purge().catch(console.error);
