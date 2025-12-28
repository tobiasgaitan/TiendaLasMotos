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

            // 1. TÍTULO INTELIGENTE
            // Si existe 'referencia', úsala. Si no, usa 'model'. Fallback final: "Sin referencia".
            const finalReferencia = data["referencia"] || data["model"] || "Sin referencia";

            // 2. IMAGEN HÍBRIDA
            // Soporta string directo (nuevo) o objeto { url: string } (legacy)
            let finalImage = "";
            if (typeof data["imagenUrl"] === 'string') {
                finalImage = data["imagenUrl"];
            } else if (data["imagenUrl"] && typeof data["imagenUrl"] === 'object') {
                finalImage = data["imagenUrl"].url || "";
            }

            // 3. BONUS MAPPING (Legacy vs New Root Fields)
            let finalBono: Bono | undefined = undefined;

            // Prioridad 1: Objeto 'bono' legacy
            if (data.bono) {
                let fechaLimiteString = "";
                if (data.bono.fecha_limite instanceof Timestamp) {
                    fechaLimiteString = data.bono.fecha_limite.toDate().toISOString();
                } else if (typeof data.bono.fecha_limite === 'string') {
                    fechaLimiteString = data.bono.fecha_limite;
                }

                finalBono = {
                    titulo: data.bono.titulo || "Bono Especial",
                    monto: Number(data.bono.monto || data.bono.valor) || 0,
                    fecha_limite: fechaLimiteString,
                    activo: data.bono.activo === true,
                    tipo: data.bono.tipo || "descuento_directo"
                };
            }
            // Prioridad 2: Campos root 'bonusAmount'
            else if (data.bonusAmount && Number(data.bonusAmount) > 0) {
                finalBono = {
                    titulo: "Bono de Descuento",
                    monto: Number(data.bonusAmount),
                    activo: true, // Asumimos activo si tiene monto positivo
                    fecha_limite: data.bonusEndDate || new Date().toISOString(), // Fallback a hoy si no hay fecha
                    tipo: "descuento_directo"
                };
            }

            return {
                id: doc.id,
                referencia: finalReferencia,
                precio: Number(data["precio"]) || 0,
                marca: data["Marca-de-la-moto"] || data["marca"] || "Genérico",
                imagen: finalImage,
                frenosABS: data["frenosABS"] === "Si",
                bono: finalBono
            };
        });

        return motos;
    } catch (error) {
        console.error("Error fetching motos:", error);
        return [];
    }
}
