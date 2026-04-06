/**
 * cmux CLI wrapper — thin, typed layer over `cmux` commands.
 *
 * All cmux interactions go through this module.
 * No other module should call cmux directly.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

const CMUX_TIMEOUT_MS = 5_000;
const SPLIT_READY_ATTEMPTS = 20;
const SPLIT_READY_DELAY_MS = 150;
const SURFACE_BOOT_DELAY_MS = 300;

// ── Types ──────────────────────────────────────────────

interface CallerInfo {
  workspace_ref: string;
  surface_ref: string;
}

interface IdentifyResponse {
  caller?: {
    workspace_ref?: string;
    surface_ref?: string;
  };
}

interface PaneInfo {
  ref?: string;
  selected_surface_ref?: string;
  surface_refs?: string[];
}

interface ListPanesResponse {
  panes?: PaneInfo[];
}

export type SplitDirection = "right" | "down";

export interface ExecResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  error?: string;
}

// ── Helpers ────────────────────────────────────────────

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseJson<T>(text: string): T | undefined {
  try {
    return JSON.parse(text) as T;
  } catch {
    return undefined;
  }
}

// ── Core execution ─────────────────────────────────────

export async function exec(pi: ExtensionAPI, args: string[]): Promise<ExecResult> {
  const result = await pi.exec("cmux", args, { timeout: CMUX_TIMEOUT_MS });

  if (result.killed) {
    return { ok: false, stdout: result.stdout, stderr: result.stderr, error: "cmux command timed out" };
  }
  if (result.code !== 0) {
    const error = result.stderr.trim() || result.stdout.trim() || `cmux exited with code ${result.code}`;
    return { ok: false, stdout: result.stdout, stderr: result.stderr, error };
  }
  return { ok: true, stdout: result.stdout, stderr: result.stderr };
}

// ── Availability ───────────────────────────────────────

export async function isAvailable(pi: ExtensionAPI): Promise<boolean> {
  const result = await pi.exec("cmux", ["ping"], { timeout: 3_000 });
  return !result.killed && result.code === 0;
}

// ── Identify caller ────────────────────────────────────

export async function getCallerInfo(
  pi: ExtensionAPI,
): Promise<{ ok: true; caller: CallerInfo } | { ok: false; error: string }> {
  const result = await exec(pi, ["--json", "identify"]);
  if (!result.ok) {
    return { ok: false, error: result.error || "Failed to identify cmux caller" };
  }

  const parsed = parseJson<IdentifyResponse>(result.stdout);
  const workspaceRef = parsed?.caller?.workspace_ref;
  const surfaceRef = parsed?.caller?.surface_ref;

  if (!workspaceRef || !surfaceRef) {
    return { ok: false, error: "This command must be run from inside a cmux surface" };
  }

  return { ok: true, caller: { workspace_ref: workspaceRef, surface_ref: surfaceRef } };
}

// ── List panes ─────────────────────────────────────────

export async function listPanes(
  pi: ExtensionAPI,
  workspaceRef: string,
): Promise<{ ok: true; panes: PaneInfo[] } | { ok: false; error: string }> {
  const result = await exec(pi, ["--json", "list-panes", "--workspace", workspaceRef]);
  if (!result.ok) {
    return { ok: false, error: result.error || "Failed to list panes" };
  }

  const parsed = parseJson<ListPanesResponse>(result.stdout);
  return { ok: true, panes: parsed?.panes ?? [] };
}

// ── Wait for new surface after split ───────────────────

function collectSurfaceRefs(panes: PaneInfo[]): Set<string> {
  const refs = new Set<string>();
  for (const pane of panes) {
    if (pane.selected_surface_ref) refs.add(pane.selected_surface_ref);
    for (const ref of pane.surface_refs ?? []) refs.add(ref);
  }
  return refs;
}

async function waitForNewSurface(
  pi: ExtensionAPI,
  workspaceRef: string,
  previousPanes: PaneInfo[],
): Promise<string | undefined> {
  const previousPaneRefs = new Set(previousPanes.map((p) => p.ref).filter(Boolean) as string[]);
  const previousSurfaceRefs = collectSurfaceRefs(previousPanes);

  for (let attempt = 0; attempt < SPLIT_READY_ATTEMPTS; attempt++) {
    const panesResult = await listPanes(pi, workspaceRef);
    if (!panesResult.ok) return undefined;

    // Check for new pane first
    for (const pane of panesResult.panes) {
      if (pane.ref && !previousPaneRefs.has(pane.ref)) {
        if (pane.selected_surface_ref) return pane.selected_surface_ref;
        const newRef = pane.surface_refs?.find((ref) => !previousSurfaceRefs.has(ref));
        if (newRef) return newRef;
      }
    }

    // Check for new surface in existing panes
    for (const pane of panesResult.panes) {
      for (const ref of pane.surface_refs ?? []) {
        if (!previousSurfaceRefs.has(ref)) return ref;
      }
    }

    await delay(SPLIT_READY_DELAY_MS);
  }

  return undefined;
}

// ── Open command in new split (core primitive) ─────────

export async function openInSplit(
  pi: ExtensionAPI,
  direction: SplitDirection,
  command: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const callerResult = await getCallerInfo(pi);
  if (!callerResult.ok) return callerResult;

  const { workspace_ref: wsRef, surface_ref: surfRef } = callerResult.caller;

  const beforePanes = await listPanes(pi, wsRef);
  if (!beforePanes.ok) return beforePanes;

  const splitResult = await exec(pi, [
    "new-split", direction,
    "--workspace", wsRef,
    "--surface", surfRef,
  ]);
  if (!splitResult.ok) {
    return { ok: false, error: splitResult.error || "Failed to create split" };
  }

  const newSurfaceRef = await waitForNewSurface(pi, wsRef, beforePanes.panes);
  if (!newSurfaceRef) {
    return { ok: false, error: "Split created, but could not detect the new surface" };
  }

  await delay(SURFACE_BOOT_DELAY_MS);

  const sendResult = await exec(pi, [
    "send",
    "--workspace", wsRef,
    "--surface", newSurfaceRef,
    command + "\\n",
  ]);
  if (!sendResult.ok) {
    return { ok: false, error: sendResult.error || "Failed to send command to new split" };
  }

  return { ok: true };
}
