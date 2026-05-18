# PLAN DE TRABAJO RÁPIDO: WEB-836 Simulator Price Fix

## Objetivo
Corregir el simulador de crédito en la interfaz administrativa para utilizar el valor base canónico (`m.price`) en lugar del valor comercial con descuento (`m.precio`) durante el ciclo de actualización de `handleMotoChange`, evitando la perversión del Capital Base y la Cuota Inicial.

## Archivos a Modificar
1. `src/types/index.ts` [MODIFY] - Añadir la propiedad `price?: number;` a la interfaz `Moto`.
2. `src/lib/firestore.ts` [MODIFY] - Mapear la propiedad `price` desde el documento Firestore en la función `getCatalogoMotos()`.
3. `src/app/admin/simulador/page.tsx` [MODIFY] - Reemplazar la asignación y cálculo de `m.precio` por `m.price` (específicamente en `setPrice(m.price)` y en el multiplicador de `calculatedDownPayment`).

---

## Cambios Propuestos

### 1. `src/types/index.ts`
Añadir `price?: number;` al contrato de datos de `Moto` para dar soporte a TypeScript.

```typescript
export interface Moto {
    id: string;
    referencia: string;
    precio: number;
    price?: number; // [NEW] Valor base canónico
    marca: string;
    ...
}
```

### 2. `src/lib/firestore.ts`
Mapear el campo `price` en `getCatalogoMotos` con un fallback robusto en caso de que algún registro no lo contenga.

```typescript
            return {
                id: doc.id,
                referencia: finalReferencia,
                precio: Number(data["precio"]) || 0,
                price: Number(data["price"]) || Number(data["precio"]) || 0, // [NEW] Mapeo de precio canónico
                marca: data["Marca-de-la-moto"] || data["marca"] || "Genérico",
                ...
            };
```

### 3. `src/app/admin/simulador/page.tsx`
Modificar el callback `handleMotoChange` quirúrgicamente para usar `m.price` (o fallback a `m.precio` si es nulo/cero) sin alterar las dependencias ni la estructura del `useCallback`.

```typescript
    const handleMotoChange = useCallback((motoId: string) => {
        setSelectedMotoId(motoId);
        
        // Imperative Sincronization: Update derived price data immediately in the same cycle
        const m = motos.find(mt => mt.id === motoId);
        if (m) {
            const basePrice = m.price || m.precio;
            setPrice(basePrice);
            
            const calculatedDownPayment = Math.floor(basePrice * (matrix?.default_down_payment_ratio || 0.10));
            setDownPayment(calculatedDownPayment);
            
            const isPatineta = m.category?.toUpperCase() === 'PATINETA'
                || m.referencia.toUpperCase().includes('PATINETA')
                || m.referencia.toUpperCase().includes('ECOMAD')
                || m.exemptRegistration === true;
            setIsExempt(isPatineta);
        }
    }, [motos, matrix?.default_down_payment_ratio]);
```

---

## Plan de Verificación E2E
1. **Compilación y Linteo Estático:** Ejecutar compilación de Next.js para asegurar que TypeScript compile sin errores.
2. **Validación Visual/Interactiva en Beta:** Desplegar y probar en el entorno Beta.
