// @ts-ignore
export const getDb = () => {
  // 🛡️ ESCUDO DE TRANSPILACIÓN: 
  // Usamos eval('require') para que Next.js no intente ofuscar el módulo.
  const adminApp = eval("require('firebase-admin/app')");
  const adminFirestore = eval("require('firebase-admin/firestore')");

  if (!adminApp.getApps().length) {
    try {
      adminApp.initializeApp({
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'tiendalasmotos'
      });
    } catch (error) {
      console.error('⚠️ [Firebase Admin] Init Error:', error);
    }
  }
  return adminFirestore.getFirestore();
};
