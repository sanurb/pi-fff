/**
 * Minimal git helpers for workflow context extraction.
 *
 * Only the subset needed by workflows — not a full git client.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

const GIT_TIMEOUT_MS = 10_000;
const MAX_STATUS_LINES = 20;

export interface GitRepoInfo {
  repoRoot: string;
  branch?: string;
  statusLines: string[];
}

export interface GitStatusSummary {
  modifiedFiles: string[];
  newFiles: string[];
}

async function execGit(
  pi: ExtensionAPI,
  cwd: string,
  args: string[],
): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  const result = await pi.exec("git", args, { timeout: GIT_TIMEOUT_MS, cwd });
  return {
    ok: !result.killed && result.code === 0,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

/** Get basic repo info: root, branch, short status. */
export async function getRepoInfo(pi: ExtensionAPI, cwd: string): Promise<GitRepoInfo | undefined> {
  const root = await execGit(pi, cwd, ["rev-parse", "--show-toplevel"]);
  if (!root.ok) return undefined;

  const repoRoot = root.stdout.trim();
  if (!repoRoot) return undefined;

  const branch = await execGit(pi, cwd, ["branch", "--show-current"]);
  const status = await execGit(pi, cwd, ["status", "--short", "--untracked-files=all"]);

  return {
    repoRoot,
    branch: branch.ok ? branch.stdout.trim() || undefined : undefined,
    statusLines: status.ok
      ? status.stdout
          .split("\n")
          .map((l) => l.trimEnd())
          .filter((l) => l.trim().length > 0)
          .slice(0, MAX_STATUS_LINES)
      : [],
  };
}

const IGNORED_PATHS = new Set([".agents", ".pi", "node_modules"]);

/** Summarize git status into modified and new file lists, filtering noise. */
export function summarizeStatus(statusLines: readonly string[]): GitStatusSummary {
  const modifiedFiles: string[] = [];
  const newFiles: string[] = [];

  for (const line of statusLines) {
    const code = line.slice(0, 2);
    const file = line.slice(3).trim();
    if (!file) continue;

    const topDir = file.split("/")[0];
    if (IGNORED_PATHS.has(topDir)) continue;

    if (code === "??") {
      newFiles.push(file);
    } else if (/[MADRC]/.test(code)) {
      modifiedFiles.push(file);
    }
  }

  return { modifiedFiles, newFiles };
}
