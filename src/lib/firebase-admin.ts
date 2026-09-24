// 🛡️ BLINDAJE DE EMPAQUETADO (Deuda P2 / WEB-QUICK-025): el require dinámico es
// estructuralmente necesario bajo firebase-frameworks + Turbopack. Los imports ES6
// estáticos de firebase-admin generan externals hasheados (firebase-admin más hash)
// inexistentes en el runtime de Cloud Run → ERR_MODULE_NOT_FOUND.
// Evidencia: QUICK-023 falló en rev ssrtiendalasmotosbeta-00548-men (revert b96f486).

function getAdminApp() {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore - Dynamic require for ESM compatibility
  const adminApp = eval("require('firebase-admin/app')");

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

  return globalAny._firebaseAdminApp;
}

export const getDb = () => {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore - Dynamic require for ESM compatibility
  const adminFirestore = eval("require('firebase-admin/firestore')");

  // Pasamos la instancia global explícitamente para evitar el error de "Default app"
  return adminFirestore.getFirestore(getAdminApp());
};

export const getAdminAuth = () => {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore - Dynamic require for ESM compatibility
  const adminAuth = eval("require('firebase-admin/auth')");

  return adminAuth.getAuth(getAdminApp());
};
