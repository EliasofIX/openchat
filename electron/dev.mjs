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
    // Own process group on POSIX so killTree() can take down the whole tree:
    // `npm run dev` / `npx electron` spawn the real process as a grandchild that
    // a plain kill() would orphan, leaving `next dev` holding port 3000 across
    // restarts. Windows keeps the shell-based spawn + direct kill (no groups).
    detached: process.platform !== "win32",
    shell: process.platform === "win32",
    env,
  });
}

// Kill a child and, on POSIX, its whole process group (negative pid). Falls back
// to a direct kill if the group is already gone or the platform lacks groups.
function killTree(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform !== "win32" && child.pid) {
    try {
      process.kill(-child.pid, "SIGTERM");
      return;
    } catch {
      // Group already exited; fall through to a direct kill.
    }
  }
  child.kill();
}

async function waitForServer(url, child, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (child && (child.spawnError || child.exitCode !== null || child.signalCode !== null)) {
      throw new Error(
        child.spawnError
          ? `Dev server failed to start: ${child.spawnError.message}`
          : `Dev server exited before ${url} became reachable`,
      );
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
  killTree(electronProcess);
  killTree(nextProcess);
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
// Detached children live in their own session, so a terminal-close SIGHUP no
// longer reaches them on its own — tear them down explicitly here too.
process.on("SIGHUP", shutdown);

console.log("Starting Next.js dev server…\n");
nextProcess = run("npm", ["run", "dev"]);
// A spawn failure (e.g. npm missing) emits "error" but never "exit"; record it
// so waitForServer fast-fails instead of polling until the timeout.
nextProcess.on("error", (err) => {
  nextProcess.spawnError = err;
});

try {
  await waitForServer(devUrl, nextProcess);
} catch (err) {
  console.error(`\n${err.message}`);
  killTree(nextProcess);
  process.exit(1);
}
console.log("\nLaunching Electron…\n");

// Cursor (and other Electron hosts) set ELECTRON_RUN_AS_NODE in the shell env,
// which makes a child Electron binary run as plain Node — no window, instant exit.
const electronEnv = { ...process.env, ELECTRON_DEV: "1" };
delete electronEnv.ELECTRON_RUN_AS_NODE;

electronProcess = run("npx", ["electron", "."], electronEnv);

// Without this an Electron launch failure emits "error" (never "exit"), leaving
// the dev server running and this script hanging forever.
electronProcess.on("error", (err) => {
  console.error(`\nFailed to launch Electron: ${err.message}`);
  killTree(nextProcess);
  process.exit(1);
});

electronProcess.on("exit", (code) => {
  killTree(nextProcess);
  process.exit(code ?? 0);
});
