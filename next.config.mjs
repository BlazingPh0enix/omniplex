/** @type {import('next').NextConfig} */

const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**",
      },
    ],
  },
  compiler: {
    removeConsole: process.env.NODE_ENV === "production",
  },
  transpilePackages: ['@firebase/auth'],
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      'undici': false,  // Disable undici
    };
    return config;
  },
};

export default nextConfig;
