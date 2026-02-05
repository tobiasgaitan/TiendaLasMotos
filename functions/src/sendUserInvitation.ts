import * as functions from 'firebase-functions';
import * as nodemailer from 'nodemailer';

/**
 * Cloud Function to send invitation emails to new admin users.
 * 
 * This function is called from the frontend after a new user is added to the whitelist.
 * It sends a professional email with registration instructions and a direct link.
 * 
 * Security: Only callable from authenticated admin users.
 */

interface InvitationData {
    name: string;
    email: string;
    role: 'superadmin' | 'admin' | 'vendedor';
}

export const sendUserInvitation = functions.https.onCall(async (data: InvitationData, context) => {
    // Security: Verify the caller is authenticated
    if (!context.auth) {
        throw new functions.https.HttpsError(
            'unauthenticated',
            'Solo usuarios autenticados pueden enviar invitaciones.'
        );
    }

    // Validate input data
    if (!data.name || !data.email || !data.role) {
        throw new functions.https.HttpsError(
            'invalid-argument',
            'Datos incompletos: se requiere nombre, email y rol.'
        );
    }

    // Configure email transporter
    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: functions.config().smtp?.email || "conexion@tiendalasmotos.com",
            pass: functions.config().smtp?.password || "placeholder_pass"
        }
    });

    // Check if SMTP is configured
    if (!functions.config().smtp?.email || !functions.config().smtp?.password) {
        console.warn('SMTP credentials not configured. Email will not be sent.');
        throw new functions.https.HttpsError(
            'failed-precondition',
            'El servidor de correo no está configurado. Contacte al administrador del sistema.'
        );
    }

    // Role translation for Spanish
    const roleNames: Record<string, string> = {
        'superadmin': 'Super Administrador',
        'admin': 'Administrador',
        'vendedor': 'Vendedor'
    };

    const roleName = roleNames[data.role] || data.role;

    // Registration URL
    const registrationUrl = 'https://tiendalasmotos.com/admin/login';

    // Email template
    const mailOptions = {
        from: '"Tienda Las Motos" <conexion@tiendalasmotos.com>',
        to: data.email,
        subject: '🎉 Invitación al Panel Administrativo - Tienda Las Motos',
        html: `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <style>
                    body {
                        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
                        line-height: 1.6;
                        color: #333;
                        max-width: 600px;
                        margin: 0 auto;
                        padding: 20px;
                    }
                    .header {
                        background: linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%);
                        color: white;
                        padding: 30px;
                        border-radius: 10px 10px 0 0;
                        text-align: center;
                    }
                    .header h1 {
                        margin: 0;
                        font-size: 24px;
                    }
                    .content {
                        background: #ffffff;
                        padding: 30px;
                        border: 1px solid #e5e7eb;
                        border-top: none;
                    }
                    .welcome {
                        font-size: 18px;
                        color: #1e3a8a;
                        margin-bottom: 20px;
                    }
                    .role-badge {
                        display: inline-block;
                        background: #dbeafe;
                        color: #1e40af;
                        padding: 6px 12px;
                        border-radius: 20px;
                        font-weight: 600;
                        font-size: 14px;
                        margin: 10px 0;
                    }
                    .cta-button {
                        display: inline-block;
                        background: #1e3a8a;
                        color: white !important;
                        padding: 14px 32px;
                        text-decoration: none;
                        border-radius: 8px;
                        font-weight: 600;
                        margin: 20px 0;
                        text-align: center;
                    }
                    .cta-button:hover {
                        background: #1e40af;
                    }
                    .instructions {
                        background: #f9fafb;
                        border-left: 4px solid #3b82f6;
                        padding: 15px;
                        margin: 20px 0;
                    }
                    .instructions ol {
                        margin: 10px 0;
                        padding-left: 20px;
                    }
                    .instructions li {
                        margin: 8px 0;
                    }
                    .footer {
                        background: #f9fafb;
                        padding: 20px;
                        border-radius: 0 0 10px 10px;
                        text-align: center;
                        font-size: 12px;
                        color: #6b7280;
                        border: 1px solid #e5e7eb;
                        border-top: none;
                    }
                    .credential-box {
                        background: #fef3c7;
                        border: 1px solid #fbbf24;
                        padding: 15px;
                        border-radius: 8px;
                        margin: 15px 0;
                    }
                    .credential-box strong {
                        color: #92400e;
                    }
                </style>
            </head>
            <body>
                <div class="header">
                    <h1>🏍️ Tienda Las Motos</h1>
                    <p style="margin: 10px 0 0 0; opacity: 0.9;">Panel Administrativo</p>
                </div>
                
                <div class="content">
                    <p class="welcome">¡Hola, <strong>${data.name}</strong>!</p>
                    
                    <p>Has sido invitado a formar parte del equipo administrativo de <strong>Tienda Las Motos</strong>.</p>
                    
                    <p>Tu rol asignado es: <span class="role-badge">${roleName}</span></p>
                    
                    <div class="instructions">
                        <strong>📋 Instrucciones para activar tu cuenta:</strong>
                        <ol>
                            <li>Haz clic en el botón de abajo para ir a la página de registro</li>
                            <li>Regístrate usando <strong>este mismo correo electrónico</strong>: <code>${data.email}</code></li>
                            <li>Crea una contraseña segura</li>
                            <li>Una vez registrado, podrás acceder al panel administrativo</li>
                        </ol>
                    </div>
                    
                    <div class="credential-box">
                        <strong>⚠️ Importante:</strong> Debes usar exactamente este correo para registrarte: <strong>${data.email}</strong>
                    </div>
                    
                    <div style="text-align: center;">
                        <a href="${registrationUrl}" class="cta-button">
                            🚀 Activar mi Cuenta
                        </a>
                    </div>
                    
                    <p style="margin-top: 30px; font-size: 14px; color: #6b7280;">
                        Si el botón no funciona, copia y pega este enlace en tu navegador:<br>
                        <a href="${registrationUrl}" style="color: #3b82f6;">${registrationUrl}</a>
                    </p>
                </div>
                
                <div class="footer">
                    <p><strong>Tienda Las Motos</strong></p>
                    <p>Este es un mensaje automático del sistema. Por favor no respondas a este correo.</p>
                    <p style="margin-top: 10px;">
                        Si tienes problemas para acceder, contacta al administrador del sistema.
                    </p>
                </div>
            </body>
            </html>
        `
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log(`Invitation email sent successfully to ${data.email}`);

        return {
            success: true,
            message: `Invitación enviada exitosamente a ${data.email}`
        };
    } catch (error: any) {
        console.error('Error sending invitation email:', error);
        throw new functions.https.HttpsError(
            'internal',
            `Error al enviar el correo: ${error.message}`
        );
    }
});
