// Read-only UAT auditor for T-03 / C5. Does not write anything.
import admin from 'firebase-admin';
import { createHash } from 'node:crypto';

const projectId = process.env.FIREBASE_PROJECT_ID || 'tiendalasmotos';
admin.initializeApp({
    projectId,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || 'tiendalasmotos.appspot.com',
    credential: admin.credential.applicationDefault(),
});
const db = admin.firestore();

async function count(col) {
    const snap = await db.collection(col).count().get();
    return snap.data().count;
}

async function docIds(col, limit = 0) {
    let q = db.collection(col);
    const snap = await q.get();
    const ids = snap.docs.map((d) => d.id).sort();
    return limit > 0 ? ids.slice(0, limit) : ids;
}

async function main() {
    const mode = process.argv[2] || 'baseline';
    const out = {
        mode,
        timestamp: new Date().toISOString(),
        projectId,
        counts: {},
        docIds: {},
    };

    const collections = [
        'conteos_pendientes_repuestos',
        'fotos_inventario',
        'historial_auditoria_inventario',
        'inventario_repuestos',
        'sys_admin_users',
    ];

    for (const col of collections) {
        out.counts[col] = await count(col);
    }

    out.docIds.conteos_pendientes_repuestos = await docIds('conteos_pendientes_repuestos');
    out.docIds.fotos_inventario = await docIds('fotos_inventario');
    out.docIds.sys_admin_users = await docIds('sys_admin_users');

    const ledgerSnap = await db
        .collection('historial_auditoria_inventario')
        .orderBy('creado_en', 'desc')
        .limit(3)
        .get();
    out.ledgerUltimos = ledgerSnap.docs.map((d) => ({
        id: d.id,
        creado_en: d.data().creado_en?.toDate?.()?.toISOString?.() ?? String(d.data().creado_en),
        operacion: d.data().operacion,
        coleccion_afectada: d.data().coleccion_afectada,
    }));

    const sampleRepuesto = await db.collection('inventario_repuestos').limit(1).get();
    out.repuestoMuestra = sampleRepuesto.empty
        ? null
        : { id: sampleRepuesto.docs[0].id, referencia: sampleRepuesto.docs[0].data().referencia };

    const admins = await db.collection('sys_admin_users').get();
    out.sysAdminUsers = admins.docs.map((d) => ({
        id: d.id,
        email: d.data().email ?? d.data().correo ?? null,
        rol: d.data().rol ?? d.data().role ?? null,
        activo: d.data().activo ?? d.data().active ?? null,
    }));

    // Auth users (read-only list, first page)
    const authUsers = [];
    let pageToken;
    do {
        const page = await admin.auth().listUsers(1000, pageToken);
        authUsers.push(...page.users.map((u) => ({ uid: u.uid, email: u.email })));
        pageToken = page.pageToken;
    } while (pageToken);
    out.authUsers = authUsers.sort((a, b) => String(a.email).localeCompare(String(b.email)));
    out.authUsersCount = authUsers.length;

    // Storage blobs under inventario_repuestos/
    const bucket = admin.storage().bucket();
    const [files] = await bucket.getFiles({ prefix: 'inventario_repuestos/', autoPaginate: false, maxResults: 1000 });
    out.storage = {
        prefix: 'inventario_repuestos/',
        blobCount: files.length,
        sample: files.slice(0, 3).map((f) => ({ name: f.name, size: f.metadata.size })),
        note: 'maxResults=1000; conteo puede truncarse si supera 1000',
    };

    const json = JSON.stringify(out, null, 2);
    const sha = createHash('sha256').update(json).digest('hex');
    console.log(json);
    console.error(`SHA256=${sha}`);
}

main().catch((error) => {
    console.error('AUDIT_FAILED', error);
    process.exit(1);
});
