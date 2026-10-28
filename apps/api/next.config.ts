import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Shared zod schemas are shipped as TypeScript source.
  transpilePackages: ["@ld/contracts"],
};

export default nextConfig;
