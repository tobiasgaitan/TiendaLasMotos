import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // output: 'export', // Disabled to support Server Actions
  images: {
    // SAFEST Path for now: Keep unoptimized: true but comment out output: export.
    unoptimized: true,
    remotePatterns: [
      { protocol: 'https', hostname: 'firebasestorage.googleapis.com', port: '', pathname: '/**' },
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
      { protocol: 'https', hostname: 'auteco.com.co' },
      { protocol: 'https', hostname: 'images.unsplash.com' }
    ]
  }
};

export default nextConfig;
