"use client";

import { usePathname } from "next/navigation";
import TopBar from "./TopBar";
import Navbar from "./Navbar";

/**
 * NavigationWrapper Component
 * 
 * Conditionally renders the global navigation (TopBar and Navbar).
 * Hides navigation on admin routes to keep the dashboard clean.
 * 
 * @returns {JSX.Element | null} Navigation components or null if on admin route
 */
export default function NavigationWrapper() {
    const pathname = usePathname();
    const isAdmin = pathname?.startsWith("/admin");

    if (isAdmin) {
        return null;
    }

    return (
        <>
            <TopBar />
            <Navbar />
        </>
    );
}
