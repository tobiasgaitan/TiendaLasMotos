import { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Política de Privacidad | Tienda Las Motos',
    description: 'Política de Tratamiento de Datos Personales de Tienda Las Motos SAS.',
};

/**
 * Privacy Policy Page
 * 
 * Static page displaying the Data Treatment Policy (Habeas Data) as per Colombian Law 1581 of 2012.
 * Includes NIT and official contact email.
 */
export default function PrivacyPolicyPage() {
    return (
        <div className="bg-slate-50 min-h-screen py-20 px-4">
            <div className="container mx-auto max-w-3xl bg-white p-8 md:p-12 rounded-2xl shadow-sm border border-slate-100">
                <h1 className="text-3xl md:text-4xl font-bold text-slate-900 mb-8 border-b pb-6">
                    Política de Tratamiento de Datos Personales
                </h1>

                <div className="space-y-6 text-slate-700 leading-relaxed">
                    <p className="font-semibold text-lg">
                        Responsable: <span className="text-slate-900">LAS MOTOS SAS (Nit. 900581684)</span>
                    </p>

                    <h2 className="text-xl font-bold text-slate-900 mt-8 mb-4">Autorización y Finalidades</h2>
                    <p>
                        El usuario autoriza de manera expresa a <strong>LAS MOTOS SAS</strong> para el tratamiento de sus datos personales,
                        incluyendo nombres, identificación, ubicación, teléfonos y demás información recolectada.
                    </p>
                    <p>
                        La recolección y tratamiento de estos datos tiene las siguientes finalidades:
                    </p>
                    <ul className="list-disc pl-6 space-y-2">
                        <li>Atención eficiente de solicitudes y requerimientos.</li>
                        <li>Generación de estadísticas y estudios de mercado.</li>
                        <li>Envío de campañas comerciales, promociones y novedades.</li>
                        <li>Seguimiento y gestión de Peticiones, Quejas y Reclamos (PQR).</li>
                    </ul>

                    <h2 className="text-xl font-bold text-slate-900 mt-8 mb-4">Derechos del Titular</h2>
                    <p>
                        Como titular de los datos, usted tiene derecho a:
                    </p>
                    <ul className="list-disc pl-6 space-y-2">
                        <li>Conocer los datos personales sobre los cuales se realiza el tratamiento.</li>
                        <li>Actualizar y rectificar sus datos personales.</li>
                        <li>Solicitar la prueba de la autorización otorgada.</li>
                        <li>Solicitar la supresión de sus datos cuando considere que no se respetan los principios, derechos y garantías constitucionales y legales.</li>
                    </ul>

                    <h2 className="text-xl font-bold text-slate-900 mt-8 mb-4">Canal de Contacto</h2>
                    <p>
                        Para ejercer sus derechos de habeas data, puede contactarnos a través del correo electrónico legal habilitado:
                    </p>
                    <div className="mt-4 p-4 bg-blue-50 rounded-lg border border-blue-100 inline-block">
                        <a href="mailto:conexion@tiendalasmotos.com" className="text-blue-700 font-bold hover:underline">
                            conexion@tiendalasmotos.com
                        </a>
                    </div>
                </div>

                <div className="mt-12 pt-8 border-t border-slate-100 text-sm text-slate-500 text-center">
                    <p>
                        Esta política se rige por la Ley 1581 de 2012 y el Decreto 1377 de 2013 de la República de Colombia.
                    </p>
                </div>
            </div>
        </div>
    );
}
