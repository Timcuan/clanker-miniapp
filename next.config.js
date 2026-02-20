// Setup for Cloudflare Pages
const { setupDevPlatform } = require('@cloudflare/next-on-pages/next-dev');

if (process.env.NODE_ENV === 'development') {
  setupDevPlatform();
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: {
    // Ignore ESLint errors during build (we check separately)
    ignoreDuringBuilds: true,
  },
  typescript: {
    // Ignore TypeScript errors during build (we check separately)
    ignoreBuildErrors: false,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'ipfs.io',
      },
      {
        protocol: 'https',
        hostname: 'gateway.pinata.cloud',
      },
      {
        protocol: 'https',
        hostname: 'cloudflare-ipfs.com',
      },
    ],
  },
  // Webpack configuration for Telegram WebApp SDK
  webpack: (config) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      net: false,
      tls: false,
    };
    return config;
  },
  // Headers for Telegram MiniApp
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          // Allow embedding in Telegram and Farcaster with permissive connect-src
          {
            key: 'Content-Security-Policy',
            value: "frame-ancestors 'self' https://*.telegram.org https://web.telegram.org https://warpcast.com https://*.warpcast.com https://*.farcaster.xyz https://farcaster.xyz; connect-src *; img-src * data: blob:; script-src 'self' 'unsafe-inline' 'unsafe-eval' https:; style-src 'self' 'unsafe-inline' https:;",
          },
          // Remove X-Frame-Options to allow iframe embedding
          {
            key: 'X-Frame-Options',
            value: 'ALLOWALL',
          },
        ],
      },
      // Specific headers for /frame routes - more permissive
      {
        source: '/frame/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: "frame-ancestors *; connect-src *; img-src * data: blob:; script-src 'self' 'unsafe-inline' 'unsafe-eval' https:; style-src 'self' 'unsafe-inline' https:;",
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
