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
};

export default nextConfig;
