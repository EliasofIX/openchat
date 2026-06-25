// Preload: bridges main-process hints to the page. macOS chrome insets are applied as
// inline CSS variables on <html> (with CSS fallbacks under html.electron-macos). Re-applied
// when Next.js hydration wipes class/style on <html>.
// CommonJS on purpose — sandboxed preloads do not load as ES modules.

const { contextBridge, ipcRenderer } = require("electron");

const SHELL_CLASSES = ["electron"];
if (process.platform === "darwin") SHELL_CLASSES.push("electron-macos");

function applyShellClasses() {
  const html = document.documentElement;
  for (const cls of SHELL_CLASSES) html.classList.add(cls);
}

/** Last macOS chrome inset from main (or defaults). Re-applied when hydration wipes inline styles. */
let macChrome =
  process.platform === "darwin" ? { safeLeft: 108, chromeHeight: 52 } : null;

function applyMacChrome({ safeLeft = 108, chromeHeight = 52 } = {}) {
  if (process.platform !== "darwin") return;
  macChrome = { safeLeft, chromeHeight };
  const style = document.documentElement.style;
  style.setProperty("--electron-safe-left", `${safeLeft}px`);
  style.setProperty("--electron-chrome-h", `${chromeHeight}px`);
  style.setProperty("--electron-header-padding", "0 0.75rem 0 0");
  style.setProperty("--electron-app-region", "drag");
  style.setProperty("--electron-no-drag-region", "no-drag");
}

function ensureMacChrome() {
  if (!macChrome) return;
  const style = document.documentElement.style;
  const left = style.getPropertyValue("--electron-safe-left").trim();
  if (!left || left === "0px") applyMacChrome(macChrome);
}

applyShellClasses();
if (process.platform === "darwin") applyMacChrome();

document.addEventListener("DOMContentLoaded", () => {
  applyShellClasses();
  if (process.platform === "darwin") applyMacChrome();
});

// Next.js replaces <html class> (and often inline style) on hydrate — re-apply shell markers.
new MutationObserver(() => {
  if (!document.documentElement.classList.contains("electron")) applyShellClasses();
  ensureMacChrome();
}).observe(document.documentElement, { attributes: true, attributeFilter: ["class", "style"] });

contextBridge.exposeInMainWorld("electronShell", { platform: process.platform });

ipcRenderer.on("shell-chrome", (_event, chrome) => {
  if (process.platform === "darwin") applyMacChrome(chrome);
});

ipcRenderer.on("power-mode", (_event, lowPower) => {
  document.documentElement.classList.toggle("low-power", Boolean(lowPower));
});
