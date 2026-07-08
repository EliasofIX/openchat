#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// update.mjs — pull the latest code and refresh dependencies.
//
//   node update.mjs              pull current branch from origin + npm install
//   node update.mjs --upstream   also merge upstream/main (for forks)
//   node update.mjs --rebase     rebase onto the remote branch instead of merge
// ─────────────────────────────────────────────────────────────────────────────

import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const UPSTREAM_URL = "https://github.com/eliasofix/openchat.git";
const UPSTREAM_REMOTE = "upstream";
const UPSTREAM_BRANCH = "main";

const args = new Set(process.argv.slice(2));
const useUpstream = args.has("--upstream");
const useRebase = args.has("--rebase");
const force = args.has("--force");

function run(command, runArgs, { allowFail = false } = {}) {
  const result = spawnSync(command, runArgs, {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }

  if (!allowFail && result.status !== 0) {
    process.exit(result.status ?? 1);
  }

  return result.status ?? 0;
}

function runCapture(command, runArgs) {
  const result = spawnSync(command, runArgs, {
    cwd: root,
    encoding: "utf8",
    shell: process.platform === "win32",
  });

  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }

  return (result.stdout ?? "").trim();
}

function ensureGitRepo() {
  if (!existsSync(join(root, ".git"))) {
    console.error("Not a git repository — clone Open Chat first, then run update.");
    process.exit(1);
  }
}

function ensureCleanTree() {
  const dirty = runCapture("git", ["status", "--porcelain"]);
  if (dirty && !force) {
    console.error(
      "Working tree has uncommitted changes. Commit or stash them first, or pass --force.",
    );
    process.exit(1);
  }
}

function currentBranch() {
  const branch = runCapture("git", ["branch", "--show-current"]);
  if (!branch) {
    console.error("Detached HEAD — checkout a branch before updating.");
    process.exit(1);
  }
  return branch;
}

function remoteBranchExists(remote, branch) {
  const ref = runCapture("git", ["ls-remote", "--heads", remote, branch]);
  return ref.length > 0;
}

function ensureUpstreamRemote() {
  const remotes = runCapture("git", ["remote"]);
  if (remotes.split("\n").includes(UPSTREAM_REMOTE)) return;

  console.log(`Adding ${UPSTREAM_REMOTE} → ${UPSTREAM_URL}\n`);
  run("git", ["remote", "add", UPSTREAM_REMOTE, UPSTREAM_URL]);
}

function pullRemote(remote, branch) {
  const mode = useRebase ? "rebase" : "merge";
  console.log(`Pulling ${remote}/${branch} (${mode})...\n`);
  run("git", ["pull", `--${mode}`, remote, branch]);
}

if (!existsSync(join(root, "package.json"))) {
  console.error("package.json not found — run this from the repo root.");
  process.exit(1);
}

ensureGitRepo();
ensureCleanTree();

const branch = currentBranch();

console.log(`Fetching remotes...\n`);
run("git", ["fetch", "--prune", "origin"]);

if (useUpstream) {
  ensureUpstreamRemote();
  run("git", ["fetch", "--prune", UPSTREAM_REMOTE]);

  if (!remoteBranchExists(UPSTREAM_REMOTE, UPSTREAM_BRANCH)) {
    console.error(`Remote branch ${UPSTREAM_REMOTE}/${UPSTREAM_BRANCH} not found.`);
    process.exit(1);
  }

  pullRemote(UPSTREAM_REMOTE, UPSTREAM_BRANCH);
} else if (remoteBranchExists("origin", branch)) {
  pullRemote("origin", branch);
} else {
  console.log(
    `No origin/${branch} on the remote — fetching only. Pass --upstream to merge ${UPSTREAM_REMOTE}/${UPSTREAM_BRANCH}.\n`,
  );
}

console.log("\nInstalling dependencies...\n");
run("npm", ["install"]);

console.log("\nDone. Repo is up to date.\n");
