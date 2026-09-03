import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(__dirname),
  },
  serverExternalPackages: ['@prisma/client', 'prisma'],
  typescript: {
    ignoreBuildErrors: true,
  },
  // Proxy clona el body; default 10MB truncaba /api/sap/match con G985 grandes.
  experimental: {
    proxyClientMaxBodySize: '32mb',
  },
  // ZKTeco ADMS usa /iclock/* (hardcoded en firmware); la API vive en /api/iclock/*
  async rewrites() {
    return [
      {
        source: '/iclock/:path*',
        destination: '/api/iclock/:path*',
      },
    ];
  },
  // WASM / COOP para onnxruntime-web en kiosco biométrico
  async headers() {
    return [
      {
        source: '/onnx/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
      {
        source: '/models/insightface/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
    ];
  },
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      // Evita bundlear fs en cliente ORT
    };
    return config;
  },
};

export default nextConfig;
