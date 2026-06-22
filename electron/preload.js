// Preload: bridges the main process "power-mode" hint to the page with near-zero
// renderer code. Toggles a `low-power` class on <html> so CSS can drop
// GPU-expensive effects (glass blur) when on battery, hidden, or minimized.
// CommonJS on purpose — sandboxed preloads do not load as ES modules.

const { ipcRenderer } = require("electron");

ipcRenderer.on("power-mode", (_event, lowPower) => {
  document.documentElement.classList.toggle("low-power", Boolean(lowPower));
});
