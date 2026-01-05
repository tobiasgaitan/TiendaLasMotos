import FinancialParametersManager from "@/components/admin/FinancialParametersManager";

export default function FinancialParametersPage() {
    return (
        <div className="p-8">
            <h1 className="text-3xl font-bold mb-8 text-white">Configuración Financiera</h1>
            <FinancialParametersManager />
        </div>
    );
}
