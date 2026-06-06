import * as nodemailer from 'nodemailer';
import { defineString } from 'firebase-functions/params';

const smtpEmail = defineString('SMTP_EMAIL');
const smtpPassword = defineString('SMTP_PASSWORD');
const adminAlertEmails = defineString('ADMIN_ALERT_EMAILS');

// Configure Transporter
// Requires Firebase params: SMTP_EMAIL, SMTP_PASSWORD
const transporter = nodemailer.createTransport({
    service: 'gmail', // Can be customized or use host/port
    auth: {
        user: smtpEmail.value() || "conexion@tiendalasmotos.com",
        pass: smtpPassword.value() || "placeholder_pass"
    }
});

export interface SendErrorEmailOptions {
    subject?: string;
    title?: string;
    actionLink?: string;
}

/**
 * Sends a fail-safe email alert using Nodemailer.
 * 
 * Uses SMTP credentials from Cloud Functions params (SMTP_EMAIL, SMTP_PASSWORD).
 * If config is missing, logs a warning but does not crash.
 * 
 * @param error - The error object caught in the try-catch block.
 * @param contextInfo - A string describing where the error occurred (e.g. "Fetching API").
 * @param options - Optional overrides for subject, title, and actionLink.
 */
export const sendErrorEmail = async (error: any, contextInfo: string, options: SendErrorEmailOptions = {}) => {
    const errorCode = error.code || error.message || "Unknown Error";

    const subject = options.subject || 'Fallo Crítico en Sistema (Fail-Safe Alert)';
    const title = options.title || 'Alerta de Error Automática';
    
    let actionHtml = '';
    if (options.actionLink) {
        actionHtml = `
            <br/>
            <p>Por favor, revise la situación o realice la actualización manual inmediatamente:</p>
            <a href="${options.actionLink}" style="background-color: #CE1126; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Ir a la Acción Requerida</a>
            <br/><br/>
        `;
    }

    const mailOptions = {
        from: '"Antigravity Bot" <conexion@tiendalasmotos.com>',
        to: adminAlertEmails.value() || 'conexion@tiendalasmotos.com',
        subject: subject,
        html: `
            <h2>${title}</h2>
            <p>Se ha detectado un error al intentar ejecutar una operación del sistema.</p>
            <p><strong>Contexto:</strong> ${contextInfo}</p>
            <p><strong>Error:</strong> ${errorCode}</p>
            ${actionHtml}
            <small>Este es un mensaje automático del sistema de Fail-Safe.</small>
        `
    };

    try {
        if (!smtpEmail.value()) {
            console.warn("SMTP config missing. Email not sent, but logged.");
            return;
        }
        await transporter.sendMail(mailOptions);
        console.log("Fail-Safe Email sent successfully.");
    } catch (mailError) {
        console.error("Critical: Failed to send Fail-Safe Email.", mailError);
    }
};
