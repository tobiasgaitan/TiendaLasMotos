// @ts-ignore
export const getDb = () => {
  const adminApp = eval("require('firebase-admin/app')");
  const adminFirestore = eval("require('firebase-admin/firestore')");

  // 🛡️ PERSISTENCIA GLOBAL: Evita que el App se pierda en el contexto de Cloud Run
  const globalAny: any = global;
  
  if (!globalAny._firebaseAdminApp) {
    const apps = adminApp.getApps();
    if (apps.length > 0) {
      globalAny._firebaseAdminApp = apps[0];
    } else {
      try {
        globalAny._firebaseAdminApp = adminApp.initializeApp({
          projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'tiendalasmotos'
        });
        console.log('✅ [Firebase Admin] Nueva instancia inicializada vía ADC');
      } catch (error) {
        console.error('⚠️ [Firebase Admin] Error crítico de inicio:', error);
        throw error;
      }
    }
  }

  // Pasamos la instancia global explícitamente para evitar el error de "Default app"
  return adminFirestore.getFirestore(globalAny._firebaseAdminApp);
};

export const getAdminAuth = () => {
  const adminApp = eval("require('firebase-admin/app')");
  const adminAuth = eval("require('firebase-admin/auth')");

  const globalAny: any = global;

  if (!globalAny._firebaseAdminApp) {
    const apps = adminApp.getApps();
    if (apps.length > 0) {
      globalAny._firebaseAdminApp = apps[0];
    } else {
      globalAny._firebaseAdminApp = adminApp.initializeApp({
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'tiendalasmotos'
      });
    }
  }

  return adminAuth.getAuth(globalAny._firebaseAdminApp);
};
