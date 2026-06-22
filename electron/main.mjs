// ─────────────────────────────────────────────────────────────────────────────
// Electron main process — spawns the Next.js standalone server and opens a window.
// In dev (ELECTRON_DEV=1) the Next dev server is started separately.
// ─────────────────────────────────────────────────────────────────────────────

import { app, BrowserWindow, dialog, powerMonitor, shell } from "electron";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const isDev = process.env.ELECTRON_DEV === "1";

let serverProcess = null;
let mainWindow = null;
let creatingWindow = false;
let quitting = false;
let serverExitReported = false;
let lastLowPower = null; // Last power-mode value sent; skip re-sending an unchanged one.
let displayIdle = false; // Screen locked or system suspended — low-power even on AC.

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
  serverExitReported = false; // A fresh server is allowed to report its own death.
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

  child.on("error", (err) => {
    // A spawn failure (missing standalone dir, bad cwd) emits "error" but never
    // "exit", so record it for waitForServer to fast-fail on — otherwise it polls
    // the full timeout before reporting a boot that never had a chance.
    child.spawnError = err;
    console.error("[next] failed to launch standalone server:", err);
  });
  child.on("exit", (code, signal) => {
    // stopServer() nulls serverProcess *before* killing, so a still-matching ref
    // here means the server died on its own. Surface that — the window is now
    // pointed at a dead localhost — instead of failing silently.
    const unexpected = child === serverProcess;
    if (unexpected) serverProcess = null;
    if (unexpected) {
      console.error(`[next] standalone server exited unexpectedly (code=${code}, signal=${signal}).`);
      // The window is now pointed at a dead localhost. Tell the user once (a crash
      // loop must not spam dialogs) rather than leaving a silently frozen page.
      if (!quitting && !serverExitReported && mainWindow && !mainWindow.isDestroyed()) {
        serverExitReported = true;
        dialog.showErrorBox("Open Chat lost its server", "The local server stopped unexpectedly. Please restart Open Chat.");
      }
    } else if (process.env.ELECTRON_DEBUG) {
      console.error(`[next] standalone server stopped (code=${code}, signal=${signal}).`);
    }
  });

  return child;
}

async function waitForServer(url, child, timeoutMs = 60_000) {
  const start = Date.now();
  const deadline = start + timeoutMs;
  let attempt = 0;
  let delay = 100; // Probe fast at first, then back off so a slow start never spins the CPU.

  while (Date.now() < deadline) {
    if (child && (child.spawnError || child.exitCode !== null || child.signalCode !== null)) {
      throw new Error(
        child.spawnError
          ? `Server process failed to start: ${child.spawnError.message}`
          : `Server process exited before ${url} became reachable`,
      );
    }
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(2_000) });
      if (res.ok || res.status < 500) {
        if (process.env.ELECTRON_DEBUG) {
          console.log(`[electron] ${url} ready in ${Date.now() - start}ms (${attempt + 1} attempts)`);
        }
        return;
      }
    } catch {
      // Server not ready yet.
    }
    attempt += 1;
    if (process.env.ELECTRON_DEBUG) {
      console.log(`[electron] waiting for ${url} (attempt ${attempt}, ${Date.now() - start}ms)`);
    }
    await new Promise((r) => setTimeout(r, delay));
    delay = Math.min(delay * 2, 1_000);
  }

  throw new Error(`Timed out waiting for ${url} after ${timeoutMs}ms`);
}

async function createWindow() {
  // Guard against overlapping creation: `activate` (dock click) can fire while
  // the first window is still awaiting the server, which would spawn a second
  // standalone server and orphan one. One creation in flight at a time.
  if (mainWindow || creatingWindow) return;
  creatingWindow = true;
  try {
    const port = isDev ? 3000 : await getFreePort();
    const url = `http://127.0.0.1:${port}`;

    if (!isDev) {
      serverProcess = startStandaloneServer(port);
      await waitForServer(url, serverProcess);
    } else {
      await waitForServer(url, null);
    }

    mainWindow = new BrowserWindow({
      width: 1200,
      height: 800,
      minWidth: 480,
      minHeight: 360,
      title: "Open Chat",
      show: false,
      webPreferences: {
        preload: join(__dirname, "preload.js"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        backgroundThrottling: true,
      },
    });

    mainWindow.loadURL(url).catch((err) => {
      if (process.env.ELECTRON_DEBUG) console.error("[electron] loadURL failed:", err);
    });
    mainWindow.once("ready-to-show", () => mainWindow?.show());

    mainWindow.webContents.setWindowOpenHandler(({ url: target }) => {
      if (target.startsWith("http://") || target.startsWith("https://")) {
        shell.openExternal(target);
      }
      return { action: "deny" };
    });

    // setWindowOpenHandler only covers `target=_blank`/window.open. A plain link
    // in a reply navigates *this* window, which would replace the whole app with
    // an external page and lose the session. Keep same-origin navigations; send
    // everything else to the user's browser. (SPA route changes use the history
    // API and never fire `will-navigate`, so internal routing is unaffected.)
    const appOrigin = new URL(url).origin;
    mainWindow.webContents.on("will-navigate", (event, target) => {
      let origin = null;
      try {
        origin = new URL(target).origin;
      } catch {
        // Opaque target (about:, data:, …) — fall through and block it.
      }
      if (origin === appOrigin) return;
      event.preventDefault();
      if (target.startsWith("http://") || target.startsWith("https://")) {
        shell.openExternal(target);
      }
    });

    // Renderer crash recovery: reload once, but rate-limit it. An unconditional
    // reload-on-crash becomes a CPU/battery-draining loop if the page keeps dying,
    // so a second crash within 10s shows an error instead of reloading again.
    let lastReloadAt = 0;
    mainWindow.webContents.on("render-process-gone", (_event, details) => {
      if (!mainWindow || mainWindow.isDestroyed()) return;
      if (details.reason === "clean-exit" || details.reason === "killed") return;
      console.error("[electron] renderer process gone:", details.reason);
      const now = Date.now();
      if (now - lastReloadAt < 10_000) {
        dialog.showErrorBox("Open Chat stopped responding", `The view crashed (${details.reason}).`);
        return;
      }
      lastReloadAt = now;
      mainWindow.reload();
    });

    // Page-load self-heal: a failed document load (a transient server blip after
    // the readiness probe passed, or a slow start under load) would otherwise
    // leave a blank window with no recovery. Reload once, sharing the crash
    // rate-limit above so the two paths can't thrash together. Ignore subframe
    // failures and ERR_ABORTED (-3) — the normal code for a navigation we
    // cancelled ourselves in will-navigate (external links).
    mainWindow.webContents.on("did-fail-load", (_event, errorCode, _desc, _url, isMainFrame) => {
      if (!isMainFrame || errorCode === -3) return;
      if (!mainWindow || mainWindow.isDestroyed()) return;
      const now = Date.now();
      if (now - lastReloadAt < 10_000) return;
      lastReloadAt = now;
      if (process.env.ELECTRON_DEBUG) console.error(`[electron] did-fail-load (${errorCode}); reloading.`);
      mainWindow.loadURL(url).catch(() => {});
    });

    // Battery: mirror power source, visibility, and focus into the renderer, which
    // drops GPU-heavy effects while in low-power mode (see electron/preload.js).
    // `blur`/`focus` cover the common case — a backgrounded window the user isn't
    // watching should not keep compositing glass blur.
    for (const event of ["minimize", "restore", "hide", "show", "blur", "focus"]) {
      mainWindow.on(event, refreshPowerMode);
    }
    // `on` (not `once`) re-syncs low-power state after any renderer reload. A
    // fresh document has no `.low-power` class, so clear the cache to force a
    // send even when the value matches what the previous page already had.
    mainWindow.webContents.on("did-finish-load", () => {
      lastLowPower = null;
      refreshPowerMode();
    });

    mainWindow.on("closed", () => {
      mainWindow = null;
    });
  } finally {
    creatingWindow = false;
  }
}

function stopServer() {
  const child = serverProcess;
  serverProcess = null;
  if (!child || child.exitCode !== null || child.signalCode !== null) return;

  child.kill("SIGTERM");
  const force = setTimeout(() => {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
  }, 2_000);
  force.unref?.();
}

function refreshPowerMode() {
  // powerMonitor fires app-wide, including while the window is tearing down, so
  // verify the webContents is still alive before sending — otherwise send() throws.
  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed()) return;
  let onBattery = false;
  try {
    onBattery = powerMonitor.isOnBatteryPower();
  } catch {
    // Power source unknown on this platform; treat as AC.
  }
  const lowPower =
    onBattery ||
    displayIdle ||
    mainWindow.isMinimized() ||
    !mainWindow.isVisible() ||
    !mainWindow.isFocused();
  // blur→focus churn and powerMonitor events that don't flip the state would
  // otherwise re-send the same value and force a needless renderer style recalc.
  if (lowPower === lastLowPower) return;
  lastLowPower = lowPower;
  mainWindow.webContents.send("power-mode", lowPower);
}

function setupPowerMonitor() {
  // on-battery/on-ac flip isOnBatteryPower(), which refreshPowerMode reads
  // directly. But locking the screen or suspending on AC power does not blur the
  // window, so refreshPowerMode would keep compositing glass blur and streaming
  // at full rate for a display nobody is watching — track an idle flag for those.
  powerMonitor.on("on-battery", refreshPowerMode);
  powerMonitor.on("on-ac", refreshPowerMode);
  for (const event of ["lock-screen", "suspend"]) {
    powerMonitor.on(event, () => {
      displayIdle = true;
      refreshPowerMode();
    });
  }
  for (const event of ["unlock-screen", "resume"]) {
    powerMonitor.on(event, () => {
      displayIdle = false;
      refreshPowerMode();
    });
  }
}

// One running app = one standalone server. A second launch focuses the window.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app
    .whenReady()
    .then(() => {
      setupPowerMonitor();
      return createWindow();
    })
    .catch((err) => {
      console.error("Open Chat failed to start:", err);
      dialog.showErrorBox("Open Chat failed to start", String(err?.message ?? err));
      stopServer();
      app.quit();
    });

  app.on("window-all-closed", () => {
    // macOS keeps the app alive after the last window closes; free the idle server.
    // Elsewhere, quit and let `before-quit` run the coordinated (wait-for-exit)
    // shutdown — stopping the server here would null serverProcess and make
    // before-quit a no-op, risking an orphan if the server ignores SIGTERM (the
    // SIGKILL fallback is unref'd and can't fire once the loop exits).
    if (process.platform === "darwin") stopServer();
    else app.quit();
  });

  app.on("activate", () => {
    if (mainWindow === null) {
      createWindow().catch((err) => {
        console.error("Open Chat failed to reopen:", err);
        stopServer();
      });
    }
  });

  // Hold the quit until the standalone server is actually dead: stopServer()'s
  // SIGKILL fallback (a `setTimeout`) can never fire if the main process exits
  // first, which orphans a server that ignored SIGTERM. The child's own `exit`
  // resumes the quit (SIGKILL guarantees it arrives); a hard cap force-exits
  // regardless so a wedged child can never hang the quit. In dev `serverProcess`
  // is null (dev.mjs owns the server), so this is a no-op and quit is immediate.
  app.on("before-quit", (event) => {
    const child = serverProcess;
    if (quitting || !child) return;
    quitting = true;
    event.preventDefault();
    child.once("exit", () => app.quit());
    setTimeout(() => app.exit(0), 4_000).unref?.();
    stopServer();
  });
}

// Last-resort cleanup so a crash or kill never orphans the Node server.
process.on("exit", stopServer);
process.on("SIGINT", () => app.quit());
process.on("SIGTERM", () => app.quit());
process.on("uncaughtException", (err) => {
  console.error("Uncaught exception in main process:", err);
  stopServer();
  app.exit(1);
});
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled rejection in main process:", reason);
});
