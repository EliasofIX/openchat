import { existsSync } from "node:fs";
import { dirname, extname, join, resolve as resolvePath } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolvePath(dirname(fileURLToPath(import.meta.url)), "..");

function resolveTsPath(specifier) {
  const base = join(root, "src", specifier.slice(2));
  if (extname(base)) return existsSync(base) ? base : null;
  for (const ext of [".ts", ".tsx", ".js", ".mjs"]) {
    const candidate = base + ext;
    if (existsSync(candidate)) return candidate;
  }
  const indexTs = join(base, "index.ts");
  if (existsSync(indexTs)) return indexTs;
  return null;
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    const file = resolveTsPath(specifier);
    if (!file) {
      return nextResolve(specifier, context);
    }
    return nextResolve(pathToFileURL(file).href, context);
  }
  return nextResolve(specifier, context);
}
