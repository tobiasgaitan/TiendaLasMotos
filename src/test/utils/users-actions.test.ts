import { deleteField } from "firebase/firestore";
import { createUser, updateUser, deleteUser } from "@/app/admin/users/actions";
import {
    userCreateSchema,
    userPatchSchema,
    esAutoBorrado,
    construirPayloadUsuario,
} from "@/lib/actions/users-schemas";

/**
 * Path de validación del CRUD de sys_admin_users (WEB-029).
 *
 * Cubre con las funciones REALES las ramas alcanzables sin credenciales Firebase:
 *  1. Actor con shape inválido → rechazo puro (sin tocar red ni SDK).
 *  2. Rol fuera del enum ROLES → rechazo por el zod schema real (pre-auth).
 *  3. Email inválido → rechazo por el zod schema real (pre-auth).
 *  4. Anti-suicidio → helper puro esAutoBorrado (misma función que usa deleteUser).
 *  5. Payload de update → incluye sentinel deleteField() sobre 'role' legacy.
 *  6. Token malformado → requireActor rechaza (anti-spoofing).
 *
 * NOTA DE COBERTURA: las ramas detrás de requireActor + Firestore (duplicados,
 * requirePermiso, appendAuditoria) corresponden a runtime en Beta. Este archivo
 * NO usa mocks.
 */

// Custom lightweight test runner (repo convention — see reverseCalculator.test.ts)
function describe(name: string, fn: () => void) {
    console.log(`\nSuite: ${name}`);
    fn();
}

function test(name: string, fn: () => void | Promise<void>) {
    Promise.resolve()
        .then(() => fn())
        .then(() => console.log(`  ✓ ${name} - PASSED`))
        .catch((error) => {
            console.error(`  ✗ ${name} - FAILED`);
            console.error(error);
            process.exitCode = 1;
        });
}

const ACTOR_MALFORMADO = { uid: "uid-falso", idToken: "NO-ES-UN-TOKEN" };

describe("users-actions — path de validación", () => {
    test("actor con shape inválido se rechaza sin tocar Firebase (create)", async () => {
        const res = await createUser(
            { name: "X", email: "x@y.com", rol: "admin", active: true },
            { uid: "" } // idToken ausente → validarActor falla
        );
        if (res.success !== false) throw new Error("debió fallar");
        if (res.message !== "No autorizado. Sesión inválida.") {
            throw new Error(`mensaje inesperado: ${res.message}`);
        }
    });

    test("actor con shape inválido se rechaza sin tocar Firebase (update/delete)", async () => {
        const r1 = await updateUser("x@y.com", { active: false }, { uid: "" });
        const r2 = await deleteUser("x@y.com", { uid: "" });
        if (r1.success !== false || r2.success !== false) throw new Error("debieron fallar");
        if (r1.message !== "No autorizado. Sesión inválida.") {
            throw new Error(`mensaje inesperado update: ${r1.message}`);
        }
        if (r2.message !== "No autorizado. Sesión inválida.") {
            throw new Error(`mensaje inesperado delete: ${r2.message}`);
        }
    });

    test("rol fuera del enum ROLES se rechaza por el schema real (pre-auth)", async () => {
        const parsed = userCreateSchema.safeParse({
            name: "X",
            email: "x@y.com",
            rol: "superroot",
            active: true,
        });
        if (parsed.success) throw new Error("el schema debió rechazar el rol");
        const res = await createUser(
            { name: "X", email: "x@y.com", rol: "superroot", active: true },
            ACTOR_MALFORMADO // shape válido: pasa validarActor, falla el schema
        );
        if (res.success !== false) throw new Error("debió fallar");
        if (res.message !== "Datos del usuario inválidos. Revisa los campos.") {
            throw new Error(`mensaje inesperado: ${res.message}`);
        }
    });

    test("rol legacy 'vendedor' se rechaza (ya no es canónico)", async () => {
        const parsed = userCreateSchema.safeParse({
            name: "X",
            email: "x@y.com",
            rol: "vendedor",
            active: true,
        });
        if (parsed.success) throw new Error("el schema debió rechazar 'vendedor'");
    });

    test("email inválido se rechaza por el schema real (pre-auth)", async () => {
        const res = await createUser(
            { name: "X", email: "no-es-email", rol: "admin", active: true },
            ACTOR_MALFORMADO
        );
        if (res.success !== false) throw new Error("debió fallar");
        if (res.message !== "Datos del usuario inválidos. Revisa los campos.") {
            throw new Error(`mensaje inesperado: ${res.message}`);
        }
        const res2 = await updateUser("no-es-email", { active: false }, ACTOR_MALFORMADO);
        if (res2.success !== false) throw new Error("debió fallar");
        if (res2.message !== "Correo inválido.") {
            throw new Error(`mensaje inesperado update: ${res2.message}`);
        }
    });

    test("patch inválido se rechaza por el schema real (pre-auth)", async () => {
        const parsed = userPatchSchema.safeParse({ rol: "dios", active: "si" });
        if (parsed.success) throw new Error("el schema debió rechazar el patch");
    });

    test("anti-suicidio: mismo email (case-insensitive) → true", async () => {
        if (!esAutoBorrado("Admin@X.com", "admin@x.com")) {
            throw new Error("debió detectar auto-borrado");
        }
        if (esAutoBorrado("otro@x.com", "admin@x.com")) {
            throw new Error("no debió detectar auto-borrado");
        }
        if (esAutoBorrado("", "admin@x.com")) {
            throw new Error("email vacío no es auto-borrado");
        }
        if (esAutoBorrado("admin@x.com", null)) {
            throw new Error("actor sin email no es auto-borrado");
        }
    });

    test("payload de update incluye deleteField() sobre 'role' legacy", async () => {
        const payload = construirPayloadUsuario({ rol: "cobrador", active: true });
        if (!("role" in payload)) throw new Error("falta la clave 'role' en el payload");
        const sentinel = deleteField();
        if (JSON.stringify(payload.role) !== JSON.stringify(sentinel)) {
            throw new Error("la clave 'role' no es el sentinel deleteField()");
        }
        if (payload.rol !== "cobrador") throw new Error("falta rol canónico");
        if (payload.active !== true) throw new Error("falta active");
        if (!payload.updated_at) throw new Error("falta updated_at");
    });

    test("token malformado se rechaza en requireActor (anti-spoofing)", async () => {
        const res = await createUser(
            { name: "X", email: "x@y.com", rol: "admin", active: true },
            ACTOR_MALFORMADO // input válido: llega hasta verifyIdToken y falla
        );
        if (res.success !== false) throw new Error("debió fallar");
        if (!res.message || !res.message.includes("No autorizado")) {
            throw new Error(`mensaje inesperado: ${res.message}`);
        }
    });
});
