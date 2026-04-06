import type { FileFinder } from "@ff-labs/fff-node";
import type { FallbackResult } from "./types.js";

interface FallbackOptions {
  readonly mode?: string;
  readonly ignoreCase?: boolean;
  readonly limit?: number;
  readonly path?: string;
}

/**
 * Runs 4 fallback stages in order, stops at first success.
 * Sync — all FFF calls are in-process C FFI.
 */
export function runFallback(
  finder: FileFinder,
  originalQuery: string,
  options: FallbackOptions
): FallbackResult {
  const broadened = tryBroaden(originalQuery);
  if (broadened) {
    const result = finder.grep(broadened, {
      mode: options.mode === "regex" ? "regex" : "plain",
      ignoreCase: options.ignoreCase,
      pageSize: options.limit ?? 100,
    });
    if (result.ok && result.value.items.length > 0) {
      return {
        items: result.value.items,
        stage: "broaden",
        prefix: `0 exact matches for "${originalQuery}". Broadened to "${broadened}":\n`,
      };
    }
  }

  {
    const result = finder.grep(originalQuery, {
      mode: "fuzzy",
      ignoreCase: options.ignoreCase,
      pageSize: 3,
    });
    if (result.ok && result.value.items.length > 0) {
      return {
        items: result.value.items.slice(0, 3),
        stage: "fuzzy",
        prefix: `0 exact matches for "${originalQuery}". ${result.value.items.length} approximate:\n`,
      };
    }
  }

  // Only try file path fallback when the query looks like a path
  if (originalQuery.includes("/")) {
    const result = finder.fileSearch(originalQuery, { pageSize: 1 });
    if (result.ok && result.value.items.length > 0) {
      const score = result.value.scores?.[0];
      // Heuristic: score must exceed query length × 10 to avoid false positives
      if (score && score.total > originalQuery.length * 10) {
        return {
          items: [],
          stage: "filepath",
          prefix: `0 content matches for "${originalQuery}". Relevant file:\n→ Read ${result.value.items[0].relativePath}`,
          fileSearchPath: result.value.items[0].relativePath,
        };
      }
    }
  }

  return {
    items: [],
    stage: "error",
    prefix: [
      `0 matches for "${originalQuery}".`,
      "- Try a shorter identifier",
      "- No fuzzy matches found — check spelling",
      "- Use find to locate files by name first",
    ].join("\n"),
  };
}

/** Drops the first non-constraint token. Constraints start with `!`, `*`, or end with `/`. */
function tryBroaden(query: string): string | null {
  const tokens = query.split(/\s+/).filter(Boolean);
  if (tokens.length < 2) return null;

  const idx = tokens.findIndex(
    (t) => !t.startsWith("!") && !t.startsWith("*") && !t.endsWith("/")
  );
  if (idx === -1) return null;

  const remaining = tokens.filter((_, i) => i !== idx);
  return remaining.length > 0 ? remaining.join(" ") : null;
}
