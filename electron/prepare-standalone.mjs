// Copies Next.js static assets into the standalone bundle before electron-builder runs.

import { cpSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const standalone = join(root, ".next", "standalone");

if (!existsSync(join(standalone, "server.js"))) {
  console.error("Missing .next/standalone/server.js — run `npm run build` first.");
  process.exit(1);
}

cpSync(join(root, ".next", "static"), join(standalone, ".next", "static"), {
  recursive: true,
});
cpSync(join(root, "public"), join(standalone, "public"), { recursive: true });

console.log("Standalone bundle ready for Electron packaging.");
