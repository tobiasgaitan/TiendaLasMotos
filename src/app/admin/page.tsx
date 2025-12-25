export default function AdminDashboard() {
    return (
        <div>
            <h1 className="text-3xl font-bold mb-6 text-gray-800 dark:text-white">Dashboard</h1>
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                <h2 className="text-xl font-semibold mb-4 text-gray-700 dark:text-gray-200">Bienvenido al Panel Administrativo</h2>
                <p className="text-gray-600 dark:text-gray-400">
                    Seleccione una opción del menú lateral para comenzar.
                    <br /><br />
                    <strong>Novedades:</strong> Ahora puede gestionar los prospectos en la sección &quot;Prospectos&quot;.
                </p>
            </div>
        </div>
    );
}
