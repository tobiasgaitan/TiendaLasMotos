---
task: 034
name: Resolver params SMTP en runtime dentro de mailer
description: Mover nodemailer.createTransport dentro de sendErrorEmail para eliminar .value() en module scope.
---

# Quick Task 034: Resolver params SMTP en runtime dentro de mailer

## Objective
Eliminar la resolución de `SMTP_EMAIL`/`SMTP_PASSWORD` durante la carga del
módulo `mailer.ts`, manteniendo intactos nombres, interfaz y fail-safe.

## Tasks

<task type="auto">
  <name>Mover transporter a runtime</name>
  <files>functions/src/mailer.ts</files>
  <action>
    Eliminar el transporter de module scope. Dentro de `sendErrorEmail`, leer
    `smtpEmail.value()` y `smtpPassword.value()` después de validar que el
    email existe, crear el transporter allí y conservar el fallback actual de
    password. No cambiar `smtpEmail`, `smtpPassword`, `adminAlertEmails`,
    `SendErrorEmailOptions` ni el comportamiento `console.warn` + retorno.
  </action>
  <verify>npm --prefix functions run build</verify>
  <done>Compilación EXIT 0 y cero `.value()` en module scope de mailer.ts.</done>
</task>

---
*Created: 2026-11-09*
