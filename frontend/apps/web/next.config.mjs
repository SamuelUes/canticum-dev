import { createRequire } from 'module';
const require = createRequire(import.meta.url);
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

// En webpack config:
webpack: (config) => {
  config.resolve.alias = {
    ...config.resolve.alias,
    react: path.dirname(require.resolve('react/package.json')),
    'react-dom': path.dirname(require.resolve('react-dom/package.json')),
  };
  return config;
},
  // Disable static optimization to avoid styled-jsx context issues
  trailingSlash: false
};




export default nextConfig;
