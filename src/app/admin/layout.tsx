import SideNav from "@/app/ui/admin-sidenav";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className="flex h-screen flex-col md:flex-row md:overflow-hidden bg-black">
            <div className="w-full flex-none md:w-64">
                <SideNav />
            </div>
            {/* Main Content Area */}
            <div className="flex-grow p-6 md:overflow-y-auto md:p-12 text-gray-200">
                {children}
            </div>
        </div>
    );
}
