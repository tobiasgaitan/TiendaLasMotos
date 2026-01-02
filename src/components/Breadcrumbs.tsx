"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, Home } from "lucide-react";

export default function Breadcrumbs() {
    const pathname = usePathname();

    if (pathname === "/") return null;

    const pathSegments = pathname.split("/").filter((segment) => segment);

    return (
        <nav aria-label="Breadcrumb" className="py-4 px-4 container mx-auto">
            <ol className="flex items-center space-x-2 text-sm text-gray-500 overflow-x-auto whitespace-nowrap">
                <li>
                    <Link href="/" className="hover:text-blue-600 flex items-center transition-colors">
                        <Home className="w-4 h-4 mr-1" />
                        <span className="hidden sm:inline">Inicio</span>
                    </Link>
                </li>
                {pathSegments.map((segment, index) => {
                    const href = `/${pathSegments.slice(0, index + 1).join("/")}`;
                    const isLast = index === pathSegments.length - 1;
                    const label = decodeURIComponent(segment).replace(/-/g, " "); // Basic formatting

                    return (
                        <li key={href} className="flex items-center">
                            <ChevronRight className="w-4 h-4 mx-1" />
                            {isLast ? (
                                <span className="font-semibold text-gray-800 dark:text-gray-200 capitalize" aria-current="page">
                                    {label}
                                </span>
                            ) : (
                                <Link href={href} className="hover:text-blue-600 transition-colors capitalize">
                                    {label}
                                </Link>
                            )}
                        </li>
                    );
                })}
            </ol>
        </nav>
    );
}
