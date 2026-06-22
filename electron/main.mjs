// ─────────────────────────────────────────────────────────────────────────────
// Electron main process — spawns the Next.js standalone server and opens a window.
// In dev (ELECTRON_DEV=1) the Next dev server is started separately.
// ─────────────────────────────────────────────────────────────────────────────

import { app, BrowserWindow, shell } from "electron";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const isDev = process.env.ELECTRON_DEV === "1";

let serverProcess = null;
let mainWindow = null;

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close((err) => (err ? reject(err) : resolve(port)));
    });
    server.on("error", reject);
  });
}

function startStandaloneServer(port) {
  const standaloneDir = join(process.resourcesPath, "standalone");
  const serverPath = join(standaloneDir, "server.js");

  const child = spawn(process.execPath, [serverPath], {
    cwd: standaloneDir,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      PORT: String(port),
      HOSTNAME: "127.0.0.1",
    },
    stdio: "pipe",
  });

  child.stdout?.on("data", (chunk) => {
    if (process.env.ELECTRON_DEBUG) console.log("[next]", chunk.toString());
  });
  child.stderr?.on("data", (chunk) => {
    if (process.env.ELECTRON_DEBUG) console.error("[next]", chunk.toString());
  });

  return child;
}

async function waitForServer(url, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(2_000) });
      if (res.ok || res.status < 500) return;
    } catch {
      // Server not ready yet.
    }
    await new Promise((r) => setTimeout(r, 250));
  }

  throw new Error(`Timed out waiting for ${url}`);
}

async function createWindow() {
  const port = isDev ? 3000 : await getFreePort();
  const url = `http://127.0.0.1:${port}`;

  if (!isDev) {
    serverProcess = startStandaloneServer(port);
    await waitForServer(url);
  } else {
    await waitForServer(url);
  }

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 480,
    minHeight: 360,
    title: "Open Chat",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.loadURL(url);

  mainWindow.webContents.setWindowOpenHandler(({ url: target }) => {
    if (target.startsWith("http://") || target.startsWith("https://")) {
      shell.openExternal(target);
    }
    return { action: "deny" };
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function stopServer() {
  if (serverProcess && !serverProcess.killed) {
    serverProcess.kill();
    serverProcess = null;
  }
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  stopServer();
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (mainWindow === null) createWindow();
});

app.on("before-quit", stopServer);
