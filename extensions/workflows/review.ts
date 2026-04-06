/**
 * Workflow: Create a ringi review session and open it in cmux.
 *
 * /review                     — review staged changes (default)
 * /review --branch main       — review branch divergence from main
 * /review --commits a1b2,c3d4 — review specific commits
 * /review --pr <url>          — review a GitHub pull request
 *
 * Ringi is the single source of truth for review state.
 * cmux is the presentation layer (browser pane with ringi web UI).
 * Pi is only the workflow glue and ergonomic entrypoint.
 *
 * Prerequisites: ringi CLI, git repo, cmux running.
 * For mutations (review create): ringi serve must be running.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import * as cmux from "../cmux.js";
import { shellEscape } from "../shell.js";
import { debug } from "../debug.js";

const MODULE = "review";
const RINGI_TIMEOUT_MS = 15_000;
const RINGI_SERVE_PORT = 3000;

// ── Types ──────────────────────────────────────────────

type ReviewSource = "staged" | "branch" | "commits" | "pr";

interface ReviewRequest {
  source: ReviewSource;
  branch?: string;
  commits?: string;
  prUrl?: string;
}

// ── Parsing ────────────────────────────────────────────

const USAGE = [
  "Usage:",
  "  /review                        — staged changes (default)",
  "  /review --branch <name>        — branch divergence",
  "  /review --commits <sha,sha>    — specific commits",
  "  /review --pr <github-pr-url>   — GitHub pull request",
].join("\n");

function isGitHubPrUrl(value: string): boolean {
  return /^https:\/\/github\.com\/[^/]+\/[^/]+\/pull\/\d+/.test(value.trim());
}

function parseReviewArgs(args: string): { ok: true; request: ReviewRequest } | { ok: false; error: string } {
  const trimmed = args.trim();

  if (!trimmed) {
    return { ok: true, request: { source: "staged" } };
  }

  // Bare PR URL without flag
  if (isGitHubPrUrl(trimmed)) {
    return { ok: true, request: { source: "pr", prUrl: trimmed } };
  }

  const tokens = trimmed.split(/\s+/).filter(Boolean);
  let i = 0;

  while (i < tokens.length) {
    const flag = tokens[i];

    if (flag === "--branch" || flag === "-b") {
      const branch = tokens[i + 1];
      if (!branch) return { ok: false, error: `--branch requires a branch name.\n${USAGE}` };
      return { ok: true, request: { source: "branch", branch } };
    }

    if (flag === "--commits" || flag === "-c") {
      const commits = tokens[i + 1];
      if (!commits) return { ok: false, error: `--commits requires SHA(s).\n${USAGE}` };
      return { ok: true, request: { source: "commits", commits } };
    }

    if (flag === "--pr") {
      const url = tokens[i + 1];
      if (!url || !isGitHubPrUrl(url)) return { ok: false, error: `--pr requires a GitHub PR URL.\n${USAGE}` };
      return { ok: true, request: { source: "pr", prUrl: url } };
    }

    if (flag === "--staged" || flag === "-s") {
      return { ok: true, request: { source: "staged" } };
    }

    return { ok: false, error: `Unknown argument: ${flag}\n${USAGE}` };
  }

  return { ok: true, request: { source: "staged" } };
}

// ── Prerequisite checks ────────────────────────────────

async function isRingiAvailable(pi: ExtensionAPI): Promise<boolean> {
  const result = await pi.exec("ringi", ["--help"], { timeout: 5_000 });
  return !result.killed && result.code === 0;
}

async function isInGitRepo(pi: ExtensionAPI, cwd: string): Promise<boolean> {
  const result = await pi.exec("git", ["rev-parse", "--is-inside-work-tree"], { timeout: 5_000, cwd });
  return !result.killed && result.code === 0;
}

async function hasStagedChanges(pi: ExtensionAPI, cwd: string): Promise<boolean> {
  const result = await pi.exec("git", ["diff", "--cached", "--quiet"], { timeout: 5_000, cwd });
  // exit 1 means there ARE staged changes (diff is non-empty)
  return !result.killed && result.code === 1;
}

async function isRingiServing(pi: ExtensionAPI): Promise<{ ok: boolean; port: number }> {
  // Try to reach ringi server on default port
  const result = await pi.exec("curl", ["-sf", "-o", "/dev/null", `http://127.0.0.1:${RINGI_SERVE_PORT}/health`], { timeout: 3_000 });
  return { ok: !result.killed && result.code === 0, port: RINGI_SERVE_PORT };
}

// ── Ringi operations ───────────────────────────────────

interface RingiCreateResult {
  ok: boolean;
  reviewId?: string;
  error?: string;
}

async function ringiCreateReview(
  pi: ExtensionAPI,
  cwd: string,
  request: ReviewRequest,
): Promise<RingiCreateResult> {
  const args = ["review", "create", "--json"];

  switch (request.source) {
    case "staged":
      // Default — no extra args
      break;
    case "branch":
      args.push("--source", "branch", "--branch", request.branch!);
      break;
    case "commits":
      args.push("--source", "commits", "--commits", request.commits!);
      break;
    case "pr":
      // PR reviews are handled separately — ringi doesn't do PR fetching directly
      // We delegate to the ringi web UI which can handle PR URLs
      return { ok: false, error: "PR review: open the ringi web UI and create a branch-based review after fetching the PR" };
  }

  const result = await pi.exec("ringi", args, { timeout: RINGI_TIMEOUT_MS, cwd });

  if (result.killed) {
    return { ok: false, error: "ringi review create timed out" };
  }
  if (result.code !== 0) {
    const stderr = result.stderr.trim();
    const stdout = result.stdout.trim();
    // Try to extract a useful message
    if (stderr.includes("No staged changes") || stdout.includes("No staged changes")) {
      return { ok: false, error: "No staged changes. Stage files first: git add <files>" };
    }
    if (stderr.includes(".ringi") || stdout.includes(".ringi")) {
      return { ok: false, error: "Ringi not initialized. Run: ringi serve" };
    }
    return { ok: false, error: stderr || stdout || `ringi exited with code ${result.code}` };
  }

  // Parse JSON response for review ID
  try {
    const envelope = JSON.parse(result.stdout);
    if (envelope.ok && envelope.result?.id) {
      return { ok: true, reviewId: envelope.result.id };
    }
    if (envelope.ok && envelope.result?.review?.id) {
      return { ok: true, reviewId: envelope.result.review.id };
    }
    // Fallback: try to find any review ID in the output
    const match = result.stdout.match(/rvw_[A-Za-z0-9]+/);
    if (match) {
      return { ok: true, reviewId: match[0] };
    }
    return { ok: true };
  } catch {
    // Non-JSON output — still succeeded
    const match = result.stdout.match(/rvw_[A-Za-z0-9]+/);
    return { ok: true, reviewId: match?.[0] };
  }
}

// ── Open ringi UI in cmux browser ──────────────────────

async function openRingiInBrowser(
  pi: ExtensionAPI,
  port: number,
  reviewId?: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const url = reviewId
    ? `http://127.0.0.1:${port}/reviews/${reviewId}`
    : `http://127.0.0.1:${port}`;

  const callerResult = await cmux.getCallerInfo(pi);
  if (!callerResult.ok) return callerResult;

  const { workspace_ref: wsRef } = callerResult.caller;

  // Open browser pane in cmux
  const result = await cmux.exec(pi, [
    "new-pane",
    "--type", "browser",
    "--direction", "right",
    "--workspace", wsRef,
    "--url", url,
  ]);

  if (!result.ok) {
    return { ok: false, error: result.error || "Failed to open browser pane" };
  }

  return { ok: true };
}

// ── Start ringi serve if needed ────────────────────────

async function ensureRingiServing(
  pi: ExtensionAPI,
  cwd: string,
): Promise<{ ok: true; port: number } | { ok: false; error: string }> {
  const status = await isRingiServing(pi);
  if (status.ok) {
    return { ok: true, port: status.port };
  }

  debug(MODULE, "ringi serve not running, starting it");

  // Start ringi serve in background via a new split
  const callerResult = await cmux.getCallerInfo(pi);
  if (!callerResult.ok) return callerResult;

  const { workspace_ref: wsRef, surface_ref: surfRef } = callerResult.caller;

  const beforePanes = await cmux.listPanes(pi, wsRef);
  if (!beforePanes.ok) return beforePanes;

  // Create a small split below for ringi serve
  const splitResult = await cmux.exec(pi, [
    "new-split", "down",
    "--workspace", wsRef,
    "--surface", surfRef,
  ]);
  if (!splitResult.ok) {
    return { ok: false, error: "Failed to create split for ringi serve. Start it manually: ringi serve --no-open" };
  }

  // Wait for the new surface
  await new Promise((r) => setTimeout(r, 500));

  // Find the new surface and send the serve command
  const afterPanes = await cmux.listPanes(pi, wsRef);
  if (!afterPanes.ok) return afterPanes;

  const beforeRefs = new Set<string>();
  for (const p of beforePanes.panes) {
    for (const r of p.surface_refs ?? []) beforeRefs.add(r);
    if (p.selected_surface_ref) beforeRefs.add(p.selected_surface_ref);
  }

  let newSurfRef: string | undefined;
  for (const p of afterPanes.panes) {
    for (const r of p.surface_refs ?? []) {
      if (!beforeRefs.has(r)) { newSurfRef = r; break; }
    }
    if (newSurfRef) break;
  }

  if (newSurfRef) {
    await new Promise((r) => setTimeout(r, 300));
    await cmux.exec(pi, [
      "send",
      "--workspace", wsRef,
      "--surface", newSurfRef,
      `cd ${shellEscape(cwd)} && ringi serve --no-open\\n`,
    ]);

    // Wait for server to come up
    for (let attempt = 0; attempt < 15; attempt++) {
      await new Promise((r) => setTimeout(r, 1_000));
      const check = await isRingiServing(pi);
      if (check.ok) {
        return { ok: true, port: check.port };
      }
    }
  }

  return { ok: false, error: "Could not start ringi serve. Start it manually: ringi serve --no-open" };
}

// ── Registration ───────────────────────────────────────

export default function reviewWorkflow(pi: ExtensionAPI): void {
  pi.registerCommand("review", {
    description: "Create a ringi review session and open it in a cmux browser pane",
    handler: async (args, ctx) => {
      // Parse args
      const parsed = parseReviewArgs(args);
      if (!parsed.ok) {
        ctx.ui.notify(parsed.error, "warning");
        return;
      }

      // Check prerequisites
      const [ringiOk, gitOk] = await Promise.all([
        isRingiAvailable(pi),
        isInGitRepo(pi, ctx.cwd),
      ]);

      if (!ringiOk) {
        ctx.ui.notify("ringi not found. Install: pnpm install -g ringi", "error");
        return;
      }

      if (!gitOk) {
        ctx.ui.notify("Not inside a git repository", "error");
        return;
      }

      // For staged source, check there are actually staged changes
      if (parsed.request.source === "staged") {
        const staged = await hasStagedChanges(pi, ctx.cwd);
        if (!staged) {
          ctx.ui.notify("No staged changes. Stage files first: git add <files>", "warning");
          return;
        }
      }

      debug(MODULE, "starting review", { source: parsed.request.source });

      // Ensure ringi serve is running
      const serveResult = await ensureRingiServing(pi, ctx.cwd);
      if (!serveResult.ok) {
        ctx.ui.notify(serveResult.error, "error");
        return;
      }

      // Create review session
      const createResult = await ringiCreateReview(pi, ctx.cwd, parsed.request);
      if (!createResult.ok) {
        ctx.ui.notify(`Review creation failed: ${createResult.error}`, "error");
        return;
      }

      debug(MODULE, "review created", { reviewId: createResult.reviewId });

      // Open ringi web UI in cmux browser pane
      const browserResult = await openRingiInBrowser(pi, serveResult.port, createResult.reviewId);
      if (!browserResult.ok) {
        // Fallback: tell user where to go
        const url = createResult.reviewId
          ? `http://127.0.0.1:${serveResult.port}/reviews/${createResult.reviewId}`
          : `http://127.0.0.1:${serveResult.port}`;
        ctx.ui.notify(`Review created but browser pane failed. Open: ${url}`, "warning");
        return;
      }

      const msg = createResult.reviewId
        ? `Review ${createResult.reviewId} opened in browser`
        : "Review opened in browser";
      ctx.ui.notify(msg, "info");
    },
  });
}
