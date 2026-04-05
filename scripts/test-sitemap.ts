import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// Inicialización básica
if (!getApps().length) {
  initializeApp({ projectId: 'tiendalasmotos' }); 
}

const db = getFirestore();

async function testSitemapQuery() {
    console.log("🔍 MODO EXPLORADOR: Conectando a 'tiendalasmotos'...");
    
    try {
        // Traemos 1 documento cualquiera
        const snapshot = await db.collection('pagina/catalogo/items')
            .limit(1)
            .get();
        
        console.log(`📊 ESTADO: ${snapshot.empty ? 'Vacío ⚪' : 'Con Datos 🟢'} (Docs: ${snapshot.size})`);
        
        if (!snapshot.empty) {
            const data = snapshot.docs[0].data();
            console.log("✅ ESTRUCTURA ENCONTRADA:");
            console.log(JSON.stringify(data, null, 2));
        } else {
            console.log("⚠️ La colección existe pero no tiene documentos.");
        }
    } catch (error) {
        console.error('❌ ERROR FATAL:', error);
    }
}

testSitemapQuery();
