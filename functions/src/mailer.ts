import * as nodemailer from 'nodemailer';
import * as functions from 'firebase-functions';

// Configure Transporter
// Requires Firebase config: functions:config:set smtp.email="user@gmail.com" smtp.password="app-password"
const transporter = nodemailer.createTransport({
    service: 'gmail', // Can be customized or use host/port
    auth: {
        user: functions.config().smtp?.email || "conexion@tiendalasmotos.com",
        pass: functions.config().smtp?.password || "placeholder_pass"
    }
});

/**
 * Sends a fail-safe email alert using Nodemailer.
 * 
 * Uses SMTP credentials from Cloud Functions config (smtp.email, smtp.password).
 * If config is missing, logs a warning but does not crash.
 * 
 * @param error - The error object caught in the try-catch block.
 * @param contextInfo - A string describing where the error occurred (e.g. "Fetching API").
 */
export const sendErrorEmail = async (error: any, contextInfo: string) => {
    const errorCode = error.code || error.message || "Unknown Error";

    const mailOptions = {
        from: '"Antigravity Bot" <conexion@tiendalasmotos.com>',
        to: 'conexion@tiendalasmotos.com',
        subject: 'problema para actualizar tasa de interes en calculadora financiera las motos',
        html: `
            <h2>Fallo en Actualización Automática de Tasas</h2>
            <p>Se ha detectado un error al intentar actualizar la Tasa de Usura.</p>
            <p><strong>Contexto:</strong> ${contextInfo}</p>
            <p><strong>Error:</strong> ${errorCode}</p>
            <br/>
            <p>Por favor, realice la actualización manual inmediatamente:</p>
            <a href="https://tiendalasmotos-beta.web.app/admin/financial-parameters" style="background-color: #CE1126; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Ir al Panel Administrativo</a>
            <br/><br/>
            <small>Este es un mensaje automático del sistema de Fail-Safe.</small>
        `
    };

    try {
        if (!functions.config().smtp?.email) {
            console.warn("SMTP config missing. Email not sent, but logged.");
            return;
        }
        await transporter.sendMail(mailOptions);
        console.log("Fail-Safe Email sent successfully.");
    } catch (mailError) {
        console.error("Critical: Failed to send Fail-Safe Email.", mailError);
    }
};
