/**
 * Workflow: Open Pi in another directory in a new split.
 *
 * /open <path>        — open Pi in a directory (supports ~, relative paths)
 * /open <query>       — resolve via zoxide, then open Pi there
 *
 * If the argument is a valid directory, it is used directly.
 * Otherwise, zoxide is used to resolve the best match.
 * Falls back to a clear error if neither works.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { execFileSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { resolve, isAbsolute, join } from "node:path";
import { homedir } from "node:os";
import { openInSplit } from "../cmux.js";
import { buildPiCommand } from "../shell.js";
import { debug } from "../debug.js";

const MODULE = "open-project";
const ZOXIDE_TIMEOUT_MS = 5_000;
const MAX_COMPLETIONS = 10;

// ── Path resolution ────────────────────────────────────

function expandHome(value: string): string {
  if (value === "~") return homedir();
  if (value.startsWith("~/")) return join(homedir(), value.slice(2));
  return value;
}

function resolveDirectory(value: string, baseDir: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  const expanded = expandHome(trimmed);
  const resolved = isAbsolute(expanded) ? expanded : resolve(baseDir, expanded);

  try {
    if (existsSync(resolved) && statSync(resolved).isDirectory()) {
      return resolved;
    }
  } catch {
    // stat failed — not a valid path
  }

  return undefined;
}

// ── Zoxide ─────────────────────────────────────────────

async function queryZoxide(
  pi: ExtensionAPI,
  query: string,
): Promise<{ ok: true; path: string } | { ok: false; error: string }> {
  const keywords = query.trim().split(/\s+/).filter(Boolean);
  if (keywords.length === 0) {
    return { ok: false, error: "Empty query" };
  }

  const result = await pi.exec("zoxide", ["query", ...keywords], { timeout: ZOXIDE_TIMEOUT_MS });

  if (result.killed) {
    return { ok: false, error: "zoxide query timed out" };
  }
  if (result.code !== 0) {
    const msg = result.stderr.trim() || result.stdout.trim() || "No zoxide match found";
    return { ok: false, error: msg };
  }

  const target = result.stdout.trim();
  if (!target) {
    return { ok: false, error: "No zoxide match found" };
  }

  return { ok: true, path: target };
}

function getZoxideCompletions(prefix: string): string[] {
  const query = prefix.trim();
  if (!query) return [];

  try {
    const output = execFileSync("zoxide", ["query", "-l", ...query.split(/\s+/)], {
      encoding: "utf8",
      timeout: ZOXIDE_TIMEOUT_MS,
    });

    return output
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0)
      .slice(0, MAX_COMPLETIONS);
  } catch {
    return [];
  }
}

// ── Registration ───────────────────────────────────────

export default function openProjectWorkflow(pi: ExtensionAPI): void {
  pi.registerCommand("open", {
    description: "Open Pi in another directory in a new vertical split (supports zoxide)",
    getArgumentCompletions: (prefix) => {
      const matches = getZoxideCompletions(prefix);
      return matches.length > 0 ? matches.map((m) => ({ value: m, label: m })) : null;
    },
    handler: async (args, ctx) => {
      const query = args.trim();
      if (!query) {
        ctx.ui.notify("Usage: /open <path-or-zoxide-query>", "warning");
        return;
      }

      // Try direct path first
      const directPath = resolveDirectory(query, ctx.cwd);
      if (directPath) {
        debug(MODULE, "direct path resolved", { path: directPath });
        const result = await openInSplit(pi, "right", buildPiCommand(directPath));
        if (result.ok) {
          ctx.ui.notify(`Opened Pi in ${directPath}`, "info");
        } else {
          ctx.ui.notify(`Open failed: ${result.error}`, "error");
        }
        return;
      }

      // Fall back to zoxide
      debug(MODULE, "trying zoxide", { query });
      const zoxideResult = await queryZoxide(pi, query);
      if (!zoxideResult.ok) {
        ctx.ui.notify(`Could not resolve "${query}": ${zoxideResult.error}`, "error");
        return;
      }

      debug(MODULE, "zoxide resolved", { path: zoxideResult.path });
      const result = await openInSplit(pi, "right", buildPiCommand(zoxideResult.path));

      if (result.ok) {
        ctx.ui.notify(`Opened Pi in ${zoxideResult.path}`, "info");
      } else {
        ctx.ui.notify(`Open failed: ${result.error}`, "error");
      }
    },
  });
}
