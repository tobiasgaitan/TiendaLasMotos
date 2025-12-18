import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore, collection, getDocs, QueryDocumentSnapshot } from "firebase/firestore";

const firebaseConfig = {
    projectId: "tiendalasmotos",
    // Optional: Add other config values if needed (apiKey, authDomain, etc.)
    // For public read access on some collections, projectId might be sufficient depending on rules, 
    // but typically apiKey is needed. Assuming standard public credentials for now or environment setup.
};

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
const db = getFirestore(app);

export interface Moto {
    id: string;
    referencia: string;
    precio: number;
    marca: string;
    imagen: string;
    frenosABS: boolean;
}

export async function getCatalogoMotos(): Promise<Moto[]> {
    try {
        // Path: collection(db, 'pagina', 'catalogo', 'items')
        const itemsCollectionRef = collection(db, 'pagina', 'catalogo', 'items');
        const snapshot = await getDocs(itemsCollectionRef);

        const motos: Moto[] = snapshot.docs.map((doc: QueryDocumentSnapshot) => {
            const data = doc.data();

            // Mapping logic as requested
            return {
                id: doc.id,
                // Mapping logic based on requirements

                // Actually, let's look at the mapping again in the prompt:
                // referencia: string;         // Título (Ej: "Boxer CT 100") -> Just a comment describing it.
                // precio: number;             // Ej: 5000000
                // marca: string;              // Mapear desde: data["Marca-de-la-moto"] (OJO: tiene guiones)
                // imagen: string;             // Mapear desde: data.imagenUrl.url
                // frenosABS: boolean;         // Lógica: data.frenosABS === "Si"

                referencia: data["referencia"] || "Sin referencia",
                precio: Number(data["precio"]) || 0,
                marca: data["Marca-de-la-moto"] || "Genérico",
                imagen: data["imagenUrl"]?.url || "",
                frenosABS: data["frenosABS"] === "Si"
            };
        });

        return motos;
    } catch (error) {
        console.error("Error fetching motos:", error);
        return [];
    }
}
