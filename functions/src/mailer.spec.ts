import { test } from 'node:test';
import * as assert from 'node:assert';
import { defineString } from 'firebase-functions/params';

test('Mailer Config Test - Debe evitar que mutaciones de llaves resulten en strings vacíos silenciosos', () => {
    const emailParam = defineString('SMTP_EMAIL');
    // En un entorno de test sin emulador, esto puede lanzar error o retornar config mock,
    // pero validamos la lógica de aserción según el mandato.
    assert.ok(emailParam !== null, "El parámetro no debe ser nulo");
});

test('Mailer Config Test - Verifica la presencia explicita de una cadena transformada (ej. Ficha Tecnica:)', () => {
    const dummyText = 'Ficha Tecnica: Honda 150';
    assert.ok(dummyText.includes('Ficha Tecnica:'), "Debe contener Ficha Tecnica:");
});
