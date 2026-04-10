import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ⚡ DOCKER SUPPORT: Required for lightweight container images
  output: 'standalone',

  // 🛡️ EXTERNAL PACKAGES: Prevents bundler from obfuscating firebase-admin (REDUNDANT BASE DEEP)
  serverExternalPackages: ['firebase-admin', 'firebase-admin/app', 'firebase-admin/firestore'],

  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'res.cloudinary.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'firebasestorage.googleapis.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'dismerca.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'motos-api.auteco.com.co',
        port: '',
        pathname: '/**',
      },
    ],
  },
  typescript: {
    // !! WARN !!
    // Dangerously allow production builds to successfully complete even if
    // your project has type errors.
    // !! WARN !!
    ignoreBuildErrors: true,
  },
  // Ensure we don't try to access FS for map files in prod if not needed
  productionBrowserSourceMaps: false,
};

export default nextConfig;
