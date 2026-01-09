
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { db } from '../src/lib/firebase';
// Client SDK is safer given environment. Let's use the project's existing firebase structure if possible.
// Actually, `src/lib/firebase.ts` exports `db`. 

import { collection, query, where, getDocs } from "firebase/firestore";

async function checkRaider() {
    try {
        console.log("Querying Raider 125...");
        // Path from firestore.ts: collection(db, 'pagina', 'catalogo', 'items')
        const q = query(
            collection(db, 'pagina', 'catalogo', 'items'),
            where("referencia", "==", "Raider 125")
        );

        const snaps = await getDocs(q);

        if (snaps.empty) {
            console.log("No Raider 125 found.");

            // Try searching just by name match if exact fails
            const q2 = query(
                collection(db, 'pagina', 'catalogo', 'items')
            );
            const all = await getDocs(q2);
            const mach = all.docs.find(d => d.data().referencia?.includes("Raider"));
            if (mach) {
                console.log("Found similar:", mach.data().referencia);
                console.log("Displacement:", mach.data().cilindraje || mach.data().cc || mach.data().displacement);
            }

        } else {
            snaps.forEach(doc => {
                const data = doc.data();
                console.log("Found Raider 125!");
                console.log("ID:", doc.id);
                console.log("Raw CC keys available:", {
                    cilindraje: data.cilindraje,
                    cc: data.cc,
                    displacement: data.displacement
                });
            });
        }
    } catch (e) {
        console.error("Error", e);
    }
    process.exit(0);
}

checkRaider();
