import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Proxy REST calls to FastAPI — avoids CORS in dev
  async rewrites() {
    return [
      { source: '/api/models', destination: 'http://localhost:8000/models' },
      { source: '/api/types',  destination: 'http://localhost:8000/types'  },
    ];
  },
  // Allow WebSocket connections to localhost:8000 in dev
  experimental: {},
};

export default nextConfig;
