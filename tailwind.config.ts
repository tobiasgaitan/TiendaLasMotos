import type { Config } from "tailwindcss";

const config: Config = {
    content: [
        "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
        "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
        "./src/lib/**/*.{js,ts,jsx,tsx,mdx}", // Added lib just in case
        "./src/ui/**/*.{js,ts,jsx,tsx,mdx}",
        // Fallback for non-src structure (optional but safe)
        "./app/**/*.{js,ts,jsx,tsx,mdx}",
        "./components/**/*.{js,ts,jsx,tsx,mdx}",
        "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    ],
    theme: {
        extend: {
            backgroundImage: {
                "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
                "gradient-conic":
                    "conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))",
            },
        },
    },
    safelist: [
        'bg-blue-600',
        'hover:bg-blue-700',
        'text-white',
        'w-12',
        'h-12',
        'h-48',
        'w-full',
        'object-contain',
        'object-cover',
    ],
    plugins: [],
};
export default config;