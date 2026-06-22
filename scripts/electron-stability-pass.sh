#!/usr/bin/env bash
# scripts/electron-stability-pass.sh
#
# Run one full autonomous steering pass for Electron stability + battery efficiency
# using claude-opus-4.8 on max reasoning effort, then commit the results immediately.
#
# This ensures the loop produces frequent, meaningful commits.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

PROMPT_FILE="/tmp/electron-stability-prompt.txt"
if [[ ! -f "$PROMPT_FILE" ]]; then
  echo "ERROR: Missing prompt file at $PROMPT_FILE" >&2
  exit 1
fi

PASS_ID="$(date +%Y%m%d-%H%M%S)-$$"
LOG_FILE="/tmp/electron-stability-${PASS_ID}.log"

echo "=== [electron-stability] Starting pass ${PASS_ID} ===" | tee "$LOG_FILE"

# Run the steering (exact flags used by the loop for consistency)
cat "$PROMPT_FILE" | \
  claude -p \
    --model claude-opus-4-8 \
    --effort max \
    --safe-mode \
    --permission-mode bypassPermissions \
    --dangerously-skip-permissions \
    --allowed-tools "Bash,Edit,Read,Write,Grep,Glob,Task" \
    --no-session-persistence \
    --name "electron-stability-${PASS_ID}" \
  2>&1 | tee -a "$LOG_FILE"

CLAUDE_EXIT=${PIPESTATUS[0]}

echo "=== [electron-stability] Claude exited with code $CLAUDE_EXIT ===" | tee -a "$LOG_FILE"

# Commit very frequently: after every pass that produced edits
if ! git diff --quiet || ! git diff --cached --quiet; then
  # Stage the files the steering is allowed to touch
  git add AGENTS.md electron/ src/app/globals.css 2>/dev/null || true
  git add -u || true

  # Extract a short, useful subject from claude's own summary
  SUBJECT=$(awk '
    BEGIN { subject="" }
    /## What changed/ || /## Summary/ { capture=1; next }
    capture && /^[*-] / && subject=="" {
      sub(/^[*-] /, "", $0)
      subject = $0
      exit
    }
  ' "$LOG_FILE" | head -c 90 || true)

  if [[ -z "$SUBJECT" ]]; then
    SUBJECT="stability + battery improvements"
  fi

  COMMIT_MSG="Electron: ${SUBJECT} (opus-4.8, max effort)

Automated autonomous pass ${PASS_ID}.

Log: ${LOG_FILE}"

  git commit -m "$COMMIT_MSG" && echo "=== [electron-stability] Committed pass ${PASS_ID}" || echo "Commit skipped or failed (no staged changes?)"
else
  echo "=== [electron-stability] No changes to commit for pass ${PASS_ID}"
fi

exit "$CLAUDE_EXIT"
