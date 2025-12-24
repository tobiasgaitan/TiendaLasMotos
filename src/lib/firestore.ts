import { collection, getDocs, QueryDocumentSnapshot, Timestamp } from "firebase/firestore";
import { db } from "./firebase";
import { Moto, Bono } from "../types";
export { db };

export async function getCatalogoMotos(): Promise<Moto[]> {
    try {
        // Path: collection(db, 'pagina', 'catalogo', 'items')
        const itemsCollectionRef = collection(db, 'pagina', 'catalogo', 'items');
        const snapshot = await getDocs(itemsCollectionRef);

        const motos: Moto[] = snapshot.docs.map((doc: QueryDocumentSnapshot) => {
            const data = doc.data();

            // Map Bono if it exists
            let bono: Bono | undefined = undefined;
            if (data.bono) {
                // Safe handling of fecha_limite
                let fechaLimiteString = "";

                if (data.bono.fecha_limite instanceof Timestamp) {
                    fechaLimiteString = data.bono.fecha_limite.toDate().toISOString();
                } else if (typeof data.bono.fecha_limite === 'string') {
                    fechaLimiteString = data.bono.fecha_limite;
                }

                bono = {
                    titulo: data.bono.titulo || "Bono Especial",
                    monto: Number(data.bono.monto || data.bono.valor) || 0,
                    fecha_limite: fechaLimiteString,
                    activo: data.bono.activo === true,
                    tipo: data.bono.tipo || "descuento_directo"
                };
            }

            return {
                id: doc.id,
                referencia: data["referencia"] || "Sin referencia",
                precio: Number(data["precio"]) || 0,
                marca: data["Marca-de-la-moto"] || "Genérico",
                imagen: data["imagenUrl"]?.url || "",
                frenosABS: data["frenosABS"] === "Si",
                bono: bono
            };
        });

        return motos;
    } catch (error) {
        console.error("Error fetching motos:", error);
        return [];
    }
}
