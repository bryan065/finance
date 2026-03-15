import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Produces a self-contained build in .next/standalone
  // so the Docker image only needs `node server.js` — no npm install at runtime.
  output: 'standalone',
};

export default nextConfig;
