import type { FileFinder } from "@ff-labs/fff-node";
import type { GrepMatchItem } from "./types.js";

export interface EnrichmentOptions {
  query: string;
  mode?: string;
  ignoreCase?: boolean;
  limit?: number;
}

const ENRICHMENT_CONTEXT: ReadonlyArray<readonly [maxFiles: number, contextLines: number]> = [
  [1, 15],
  [3, 8],
];

export function getEnrichmentContext(uniqueFiles: number): number {
  return ENRICHMENT_CONTEXT.find(([max]) => uniqueFiles <= max)?.[1] ?? 0;
}

/**
 * Re-issues grep with widened context to prevent follow-up `read` calls.
 * Falls back to original items if the enriched query fails.
 */
export function enrichGrepResults(
  finder: FileFinder,
  originalItems: GrepMatchItem[],
  options: EnrichmentOptions
): GrepMatchItem[] {
  const uniqueFiles = new Set(originalItems.map((i) => i.relativePath)).size;
  const afterContext = getEnrichmentContext(uniqueFiles);
  if (afterContext === 0) return originalItems;

  const result = finder.grep(options.query, {
    mode: (options.mode === "regex" ? "regex" : "plain") as "plain" | "regex",
    ignoreCase: options.ignoreCase,
    pageSize: options.limit ?? 100,
    afterContext,
  });

  if (result.ok && result.value.items.length > 0) {
    return result.value.items;
  }

  return originalItems;
}
