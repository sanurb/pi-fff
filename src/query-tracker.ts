import type { FileFinder } from "@ff-labs/fff-node";
import type { GrepMatchItem, FileSearchResult } from "./types.js";

const tracked = new Map<string, Set<string>>();

export function resetTracking(): void {
  tracked.clear();
}

/** Tracks when all grep matches land in a single file. */
export function trackGrepResult(
  finder: FileFinder,
  query: string,
  items: GrepMatchItem[]
): boolean {
  if (items.length === 0) return false;

  const paths = new Set(items.map((i) => i.relativePath));
  if (paths.size !== 1) return false;

  return doTrack(finder, query, items[0].relativePath);
}

/** Tracks on exact match or when top result dominates (score > 2× runner-up). */
export function trackFindResult(
  finder: FileFinder,
  query: string,
  result: FileSearchResult
): boolean {
  if (result.items.length === 0 || result.scores.length === 0) return false;

  const firstPath = result.items[0].relativePath;

  if (result.scores[0].exactMatch) {
    return doTrack(finder, query, firstPath);
  }

  if (
    result.scores.length >= 2 &&
    result.scores[0].total > result.scores[1].total * 2
  ) {
    return doTrack(finder, query, firstPath);
  }

  return false;
}

function doTrack(finder: FileFinder, query: string, path: string): boolean {
  const existing = tracked.get(query);
  if (existing?.has(path)) return false;

  try {
    if (typeof finder.trackQuery === "function") {
      finder.trackQuery(query, path);
    }
  } catch {
    return false;
  }

  if (!existing) {
    tracked.set(query, new Set([path]));
  } else {
    existing.add(path);
  }

  return true;
}
