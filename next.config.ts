import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // output: 'export', // Disabled to support Server Actions
  images: {
    // unoptimized: true, // Re-enable optimization if supported by hosting, or keep true if no image optimization service.
    // For Firebase Hosting with Frameworks, optimization is supported via Functions.
    // But to be safe and avoid "Image Optimization using Next.js default loader is not compatible with `next export`" (which we are moving away from), 
    // we can strictly try to use standard optimization.
    // However, if they don't have the image optimizer set up, it might break images. 
    // SAFEST Path for now: Keep unoptimized: true but comment out output: export.
    unoptimized: true,
    remotePatterns: [
      { protocol: 'https', hostname: 'firebasestorage.googleapis.com', port: '', pathname: '/**' },
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' }
    ]
  }
};

export default nextConfig;
