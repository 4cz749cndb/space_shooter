import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  turbopack: {
    resolveAlias: {
      three: "./src/lib/three.ts"
    }
  },
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      "three$": path.resolve(process.cwd(), "src/lib/three.ts")
    };

    return config;
  }
};

export default nextConfig;
