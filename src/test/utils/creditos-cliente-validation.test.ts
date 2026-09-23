import { createClienteCredito } from '@/app/admin/creditos/actions';

/**
 * Path de validación de createClienteCredito (Fase 9).
 *
 * Cubre con la función REAL las ramas alcanzables sin credenciales Firebase:
 *  1. Actor con shape inválido → rechazo puro (sin tocar red ni SDK).
 *  2. Input inválido → rechazo por el zod schema real (clienteSchema), pre-auth.
 *  3. Token malformado → requireActor rechaza (OVERRIDE QWEN #3: anti-spoofing).
 *
 * NOTA DE COBERTURA: las ramas de normalización de celular (legacy 10→12 dígitos)
 * y duplicado de cédula viven detrás de requireActor + Firestore, por lo que su
 * verificación con datos reales corresponde al E2E en Beta (R9-10), pendiente de
 * las instrucciones runtime del Auditor. Este archivo NO usa mocks.
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

const ACTOR_MALFORMADO = { uid: 'uid-falso', idToken: 'NO-ES-UN-TOKEN' };

describe('createClienteCredito — path de validación', () => {
    test('actor con shape inválido se rechaza sin tocar Firebase', async () => {
        const res = await createClienteCredito(
            { cedula: '123', nombres: 'X', celular: '3001234567', direccion: 'Y' },
            { uid: '' } // idToken ausente → validarActor falla
        );
        if (res.success !== false) throw new Error('debió fallar');
        if (res.message !== 'No autorizado. Sesión inválida.') {
            throw new Error(`mensaje inesperado: ${res.message}`);
        }
    });

    test('input inválido se rechaza por el schema real (pre-auth)', async () => {
        const res = await createClienteCredito(
            { cedula: '', nombres: '', celular: '', direccion: '' },
            ACTOR_MALFORMADO // shape válido: pasa validarActor, falla el schema
        );
        if (res.success !== false) throw new Error('debió fallar');
        if (res.message !== 'Datos del cliente inválidos. Revisa los campos.') {
            throw new Error(`mensaje inesperado: ${res.message}`);
        }
    });

    test('token malformado se rechaza en requireActor (anti-spoofing)', async () => {
        const res = await createClienteCredito(
            { cedula: '999888777', nombres: 'Prueba', celular: '3001234567', direccion: 'Calle 1' },
            ACTOR_MALFORMADO // input válido: llega hasta verifyIdToken y falla
        );
        if (res.success !== false) throw new Error('debió fallar');
        if (!res.message || !res.message.includes('No autorizado')) {
            throw new Error(`mensaje inesperado: ${res.message}`);
        }
    });
});
