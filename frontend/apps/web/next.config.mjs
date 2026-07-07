/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'firebasestorage.googleapis.com'
      },
      {
        protocol: 'https',
        hostname: 'storage.googleapis.com'
      }
    ]
  },
  onDemandEntries: {
    // Mantén compilaciones en memoria para evitar que Next dev borre los chunks y
    // el navegador termine pidiendo /_next/static/* que ya no existen, provocando 404.
    maxInactiveAge: 60 * 60 * 1000, // 1 hora
    pagesBufferLength: 50
  },

  // Disable static optimization to avoid styled-jsx context issues
  trailingSlash: false,
  webpack: (config) => {
    config.resolve.alias.canvas = false;
    return config;
  }
};




export default nextConfig;
