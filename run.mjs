#!/usr/bin/env node

import { copyFileSync, existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

if (!existsSync(join(root, "node_modules"))) {
  console.log("Installing dependencies...\n");
  run("npm", ["install"]);
}

const envLocal = join(root, ".env.local");
const envExample = join(root, ".env.example");

if (!existsSync(envLocal) && existsSync(envExample)) {
  copyFileSync(envExample, envLocal);
  console.log(
    "Created .env.local from .env.example — add your OPENROUTER_API_KEY before chatting.\n",
  );
} else if (existsSync(envLocal)) {
  // Soft check: empty OPENROUTER_API_KEY is the usual cause of OpenRouter 401s.
  try {
    const envText = readFileSync(envLocal, "utf8");
    const match = envText.match(/^OPENROUTER_API_KEY=(.*)$/m);
    const value = match?.[1]?.trim().replace(/^["']|["']$/g, "") ?? "";
    if (!value) {
      console.log(
        "Warning: OPENROUTER_API_KEY is empty in .env.local — set it (or a key in Settings) before using OpenRouter.\n",
      );
    }
  } catch {
    // Ignore — env is optional when using Ollama / BYOK settings.
  }
}

console.log("Starting dev server at http://localhost:3000\n");
run("npm", ["run", "dev"]);
