
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { db } from '../src/lib/firebase'; // Using the fixed relative path

import { collection, query, where, getDocs } from "firebase/firestore";

async function checkMRX() {
    try {
        console.log("Querying MRX 125 S TRAKKU...");
        // Path from firestore.ts: collection(db, 'pagina', 'catalogo', 'items')
        const q = query(
            collection(db, 'pagina', 'catalogo', 'items'),
            where("referencia", "==", "MRX 125 S TRAKKU")
        );

        const snaps = await getDocs(q);

        if (snaps.empty) {
            console.log("No exact match for 'MRX 125 S TRAKKU'. Searching loosely...");
            const q2 = query(collection(db, 'pagina', 'catalogo', 'items'));
            const all = await getDocs(q2);
            all.docs.forEach(d => {
                if (d.data().referencia?.toUpperCase().includes("MRX")) {
                    console.log("Found:", d.data().referencia);
                    console.log("Displacement (raw):", d.data().displacement, d.data().cilindraje, d.data().cc);
                    console.log("Categories:", d.data().categories, d.data().categoria);
                    console.log("ID:", d.id);
                }
            });

        } else {
            snaps.forEach(doc => {
                const data = doc.data();
                console.log("Found Match!");
                console.log("Ref:", data.referencia);
                console.log("ID:", doc.id);
                console.log("Displacement Field Values:");
                console.log(" - displacement:", data.displacement);
                console.log(" - cilindraje:", data.cilindraje);
                console.log(" - cc:", data.cc);
                console.log("Category Field Values:");
                console.log(" - category:", data.category);
                console.log(" - categories:", data.categories);
            });
        }
    } catch (e) {
        console.error("Error", e);
    }
    process.exit(0);
}

checkMRX();
