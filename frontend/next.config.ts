import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Proxy REST calls to FastAPI — avoids CORS in dev
  async rewrites() {
    return [
      { source: '/api/models', destination: `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/models` },
      { source: '/api/types',  destination: `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/types`  },
    ];
  },
  // Allow WebSocket connections to localhost:8000 in dev
  experimental: {},
};

export default nextConfig;
