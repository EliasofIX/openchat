import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Minimal server bundle for the Electron desktop build.
  output: "standalone",
  // Electron loads http://127.0.0.1:PORT while `next dev` defaults to localhost.
  // Without this, dev HMR is blocked and the client never hydrates — clicks do nothing.
  allowedDevOrigins: ["127.0.0.1"],
  experimental: {
    optimizePackageImports: ["katex", "react-markdown"],
  },
};

export default nextConfig;
