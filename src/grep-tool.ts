import { Type } from "@sinclair/typebox";
import type { Static } from "@sinclair/typebox";
import { StringEnum } from "@mariozechner/pi-ai";
import type { ToolDefinition, ExtensionContext, AgentToolUpdateCallback } from "@mariozechner/pi-coding-agent";
import type { AgentToolResult } from "@mariozechner/pi-agent-core";
import type { GrepOptions } from "@ff-labs/fff-node";
import { formatGrepOutput } from "./format-grep.js";
import { runFallback } from "./fallback.js";
import { enrichGrepResults, getEnrichmentContext } from "./enrichment.js";
import { trackGrepResult } from "./query-tracker.js";
import { getCursor, createCursor } from "./cursor-store.js";
import { populateAnnotations, uniquePaths } from "./populate-annotations.js";
import * as telemetry from "./telemetry.js";
import { runToolPipeline } from "./tool-pipeline.js";
import { renderGrepCall, renderToolResult } from "./render.js";
import type { OutputMode } from "./types.js";

const GrepParams = Type.Object({
  pattern: Type.String({ description: "Search text or regex" }),
  path: Type.Optional(
    Type.String({
      description: "Directory or file constraint (e.g. 'src/', '*.ts'). Prepended to the query.",
    })
  ),
  ignoreCase: Type.Optional(
    Type.Boolean({
      description: "Force case-insensitive (default: smart case — lowercase query is insensitive)",
    })
  ),
  literal: Type.Optional(
    Type.Boolean({
      description: "Treat as literal text, not regex (default: true)",
    })
  ),
  context: Type.Optional(
    Type.Number({
      description: "Context lines before and after each match (default: 0, auto-enriched for small result sets)",
    })
  ),
  limit: Type.Optional(
    Type.Number({ description: "Max matches (default: 100)" })
  ),
  output_mode: Type.Optional(
    StringEnum(["content", "files_with_matches", "count"] as const, {
      description: "'content' (default), 'files_with_matches' (paths only), or 'count' (per-file counts)",
    })
  ),
  cursor: Type.Optional(
    Type.String({ description: "Pagination cursor from a previous result" })
  ),
});

type GrepInput = Static<typeof GrepParams>;

export const grepTool: ToolDefinition<typeof GrepParams> = {
  name: "grep",
  label: "Grep (FFF)",
  description:
    "Search file contents using FFF — frecency-ranked, git-aware, in-process C FFI. Replaces built-in grep.",
  promptSnippet: "grep - search file contents (frecency-ranked, git-aware)",
  promptGuidelines: [
    "Search for BARE IDENTIFIERS (e.g. 'InProgressQuote'), not code syntax or multi-token regex.",
    "Plain text is faster and more reliable than regex. Prefer it.",
    "After 2 grep calls, READ the top result file instead of searching again.",
    "Results marked [def] are definition sites — prefer reading those.",
    "Results marked 'hot' or 'warm' are frequently accessed — trust the ranking.",
    "Use multi_grep for naming variants: ['processRequest', 'process_request', 'ProcessRequest'].",
    "Use output_mode='files_with_matches' for broad scans before deep content search.",
  ],
  parameters: GrepParams,

  async execute(toolCallId: string, params: GrepInput, signal: AbortSignal | undefined, _onUpdate: AgentToolUpdateCallback<unknown> | undefined, ctx: ExtensionContext): Promise<AgentToolResult<unknown>> {
    return runToolPipeline("incGrep", signal, ctx, ({ finder }) => {
      // Models sometimes prepend @ to paths
      const path = params.path?.replace(/^@/, "");
      const outputMode: OutputMode = (params.output_mode as OutputMode) ?? "content";
      const isPaginating = !!params.cursor;
      const limit = params.limit ?? 100;

      let query = params.pattern;
      if (path) query = `${path} ${query}`;

      const mode: GrepOptions["mode"] = params.literal !== false ? "plain" : "regex";

      let offset = 0;
      if (params.cursor) {
        const cursor = getCursor(params.cursor);
        if (cursor) {
          offset = cursor.offset;
          query = cursor.query;
        }
      }

      const grepOpts: GrepOptions = {
        mode,
        ignoreCase: params.ignoreCase,
        pageSize: limit,
        offset,
        ...(params.context != null && {
          afterContext: params.context,
          beforeContext: params.context,
        }),
      };

      const result = finder.grep(query, grepOpts);
      if (!result.ok) throw new Error(`FFF grep failed: ${result.error}`);

      let items = result.value.items;
      const notices: string[] = [];

      if (result.value.regexFallbackError) {
        notices.push(`Note: regex error, fell back to literal: ${result.value.regexFallbackError}`);
      }

      if (items.length === 0 && !isPaginating) {
        telemetry.incZeroResult();
        telemetry.incFallbackTriggered();

        const fallback = runFallback(finder, params.pattern, {
          mode, ignoreCase: params.ignoreCase, limit, path,
        });

        if (fallback.items.length > 0) {
          telemetry.incFallbackSuccess();
          items = fallback.items;
          notices.unshift(fallback.prefix);
        } else {
          return { text: fallback.prefix };
        }
      }

      if (
        items.length > 0 &&
        !isPaginating &&
        params.context == null &&
        outputMode === "content"
      ) {
        const uniqueFiles = new Set(items.map((i) => i.relativePath)).size;
        if (getEnrichmentContext(uniqueFiles) > 0) {
          telemetry.incAutoEnrichment();
          items = enrichGrepResults(finder, items, {
            query, mode, ignoreCase: params.ignoreCase, limit,
          });
        }
      }

      const annotations = populateAnnotations(finder, uniquePaths(items));
      let output = formatGrepOutput(
        { items, totalMatches: result.value.items.length },
        { outputMode, annotations, query: params.pattern }
      );

      if (items.length > 0) {
        const tracked = trackGrepResult(finder, params.pattern, items);
        if (tracked) telemetry.incQueryTrack();
      }

      if (items.length >= limit) {
        const cursorId = createCursor(query, offset + limit, mode ?? "plain");
        notices.push(`More results available. Use cursor: "${cursorId}"`);
      }

      if (notices.length > 0) {
        output = output ? `${output}\n${notices.join("\n")}` : notices.join("\n");
      }

      return { text: output };
    });
  },

  renderCall: renderGrepCall,
  renderResult: renderToolResult,
};
