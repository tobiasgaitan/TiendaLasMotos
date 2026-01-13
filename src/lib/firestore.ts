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

            /**
             * 2. NORMALIZACIÓN DE IMÁGENES
             * Estrategia de Migración (Enero 2026):
             * Se ha estandarizado todo el inventario para usar 'imagen_url' como única fuente de verdad.
             * El script de migración eliminó 'imagenUrl', 'imageUrl', 'image', 'foto'.
             * 
             * @see src/scripts/migrate-images.ts
             */
            const finalImage = data["imagen_url"] || "";

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

            // 4. SPECS MAPPING (Critical for Financial Matrix)
            // Displacement: Try 'cilindraje' (string/number), 'cc', 'displacement'
            let finalDisplacement = 0;
            const rawDisplacement = data["cilindraje"] || data["cc"] || data["displacement"];
            if (rawDisplacement) {
                // [FIX] Improved Parsing Logic for Decimals (e.g. "124.8 cm3")
                // 1. Convert to string and lower case
                let clean = String(rawDisplacement).toLowerCase();
                // 2. Remove common units FIRST to avoid keeping digits like '3' from 'cm3'
                clean = clean.replace(/cc|cm3|cm|c\.c\.|l/g, '');
                // 3. Replace comma with dot for consistency
                clean = clean.replace(/,/g, '.');
                // 4. Remove everything that is NOT a digit or a dot
                clean = clean.replace(/[^0-9.]/g, '');
                // 5. Parse float
                finalDisplacement = parseFloat(clean) || 0;
            }

            // Categories: Try 'categories' array, or 'categoria' string, or 'category'
            let finalCategories: string[] = [];
            if (Array.isArray(data["categories"])) {
                finalCategories = data["categories"];
            } else if (data["categoria"] || data["category"]) {
                finalCategories = [data["categoria"] || data["category"]];
            } else if (data["clase"]) { // Fallback legacy
                finalCategories = [data["clase"]];
            }

            return {
                id: doc.id,
                referencia: finalReferencia,
                precio: Number(data["precio"]) || 0,
                marca: data["Marca-de-la-moto"] || data["marca"] || "Genérico",
                imagen_url: finalImage,
                frenosABS: data["frenosABS"] === "Si",
                bono: finalBono,
                displacement: finalDisplacement, // Critical for Matrix
                categories: finalCategories,     // Critical for Matrix
                category: finalCategories[0],     // Compatibility
                exemptRegistration: data["exemptRegistration"] === true || data["exentoMatricula"] === true // Support both naming conventions
            };
        });

        return motos;
    } catch (error) {
        console.error("Error fetching motos:", error);
        return [];
    }
}
