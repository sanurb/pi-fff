import { FileFinder } from "@ff-labs/fff-node";
import type { FileFinder as FileFinderType } from "@ff-labs/fff-node";
import { join } from "path";
import { mkdirSync } from "fs";
import { homedir } from "os";

let resolvedDbDir: string | null = null;

/**
 * Lazy resolution avoids top-level await.
 * Falls back to ~/.pi/agent if pi-coding-agent isn't loadable (e.g. standalone tests).
 */
function getDbDirSync(): string {
  if (resolvedDbDir) return resolvedDbDir;

  let agentDir: string;
  try {
    const piConfig = require("@mariozechner/pi-coding-agent");
    agentDir =
      typeof piConfig.getAgentDir === "function"
        ? piConfig.getAgentDir()
        : join(homedir(), ".pi", "agent");
  } catch {
    agentDir = join(homedir(), ".pi", "agent");
  }

  resolvedDbDir = join(agentDir, "fff");
  return resolvedDbDir;
}

/** Invariant: if instance is non-null, basePath is non-null and instance is not destroyed. */
interface FinderState {
  instance: FileFinderType;
  basePath: string;
  scanComplete: boolean;
}

let state: FinderState | null = null;

export async function ensureFinder(cwd: string): Promise<FileFinderType> {
  if (state && !state.instance.isDestroyed) return state.instance;

  const dbDir = getDbDirSync();
  mkdirSync(dbDir, { recursive: true });

  const result = FileFinder.create({
    basePath: cwd,
    frecencyDbPath: join(dbDir, "frecency.mdb"),
    historyDbPath: join(dbDir, "history.mdb"),
    aiMode: true,
  });

  if (!result.ok) {
    throw new Error(
      `FFF init failed: ${result.error}. Check ${dbDir} permissions and disk space.`
    );
  }

  // 15s timeout — partial index is usable, don't block the session
  const scan = await result.value.waitForScan(15_000);

  state = {
    instance: result.value,
    basePath: cwd,
    scanComplete: scan.ok ? scan.value : false,
  };

  return state.instance;
}

export function destroyFinder(): void {
  if (state && !state.instance.isDestroyed) {
    state.instance.destroy();
  }
  state = null;
}

export function getFinder(): FileFinderType | null {
  if (!state || state.instance.isDestroyed) return null;
  return state.instance;
}

export function isScanComplete(): boolean {
  return state?.scanComplete ?? false;
}

/** Destroys and recreates the finder to force a full re-index. */
export async function rescan(timeoutMs = 15_000): Promise<boolean> {
  const basePath = state?.basePath;
  if (!basePath) return false;
  destroyFinder();
  await ensureFinder(basePath);
  return state?.scanComplete ?? false;
}

export function getDbDir(): string {
  return getDbDirSync();
}
