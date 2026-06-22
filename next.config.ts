import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Minimal server bundle for the Electron desktop build.
  output: "standalone",
};

export default nextConfig;
