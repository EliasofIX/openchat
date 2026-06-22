// Starts the Next dev server, then launches Electron once localhost:3000 is up.

import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const devUrl = "http://127.0.0.1:3000";

let nextProcess = null;
let electronProcess = null;

function run(command, args, env = process.env) {
  return spawn(command, args, {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32",
    env,
  });
}

async function waitForServer(url, child, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (child && (child.exitCode !== null || child.signalCode !== null)) {
      throw new Error(`Dev server exited before ${url} became reachable`);
    }
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(2_000) });
      if (res.ok || res.status < 500) return;
    } catch {
      // Not ready.
    }
    await new Promise((r) => setTimeout(r, 300));
  }

  throw new Error(`Timed out waiting for ${url}`);
}

function shutdown() {
  electronProcess?.kill();
  nextProcess?.kill();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

console.log("Starting Next.js dev server…\n");
nextProcess = run("npm", ["run", "dev"]);

try {
  await waitForServer(devUrl, nextProcess);
} catch (err) {
  console.error(`\n${err.message}`);
  nextProcess?.kill();
  process.exit(1);
}
console.log("\nLaunching Electron…\n");

electronProcess = run("npx", ["electron", "."], {
  ...process.env,
  ELECTRON_DEV: "1",
});

electronProcess.on("exit", (code) => {
  nextProcess?.kill();
  process.exit(code ?? 0);
});
