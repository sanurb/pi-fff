import { Type } from "@sinclair/typebox";
import type { Static } from "@sinclair/typebox";
import { StringEnum } from "@mariozechner/pi-ai";
import type { ToolDefinition, ExtensionContext, AgentToolUpdateCallback } from "@mariozechner/pi-coding-agent";
import type { AgentToolResult } from "@mariozechner/pi-agent-core";
import type { GrepOptions } from "@ff-labs/fff-node";
import { formatGrepOutput } from "./format-grep.js";
import { enrichGrepResults, getEnrichmentContext } from "./enrichment.js";
import { getCursor, createCursor } from "./cursor-store.js";
import { populateAnnotations, uniquePaths } from "./populate-annotations.js";
import * as telemetry from "./telemetry.js";
import { runToolPipeline } from "./tool-pipeline.js";
import { renderMultiGrepCall, renderToolResult } from "./render.js";
import type { OutputMode } from "./types.js";

const MultiGrepParams = Type.Object({
  patterns: Type.Array(Type.String(), {
    description: "Patterns (OR logic). Include all naming variants: snake_case, PascalCase, camelCase.",
  }),
  constraints: Type.Optional(
    Type.String({
      description: "File constraints: '*.{ts,tsx} !test/'. Separate from patterns.",
    })
  ),
  context: Type.Optional(
    Type.Number({ description: "Context lines (default: 0)" })
  ),
  limit: Type.Optional(
    Type.Number({ description: "Max matches (default: 100)" })
  ),
  output_mode: Type.Optional(
    StringEnum(["content", "files_with_matches", "count"] as const, {
      description: "'content' (default), 'files_with_matches', or 'count'",
    })
  ),
  cursor: Type.Optional(
    Type.String({ description: "Pagination cursor" })
  ),
});

type MultiGrepInput = Static<typeof MultiGrepParams>;

export const multiGrepTool: ToolDefinition<typeof MultiGrepParams> = {
  name: "multi_grep",
  label: "Multi Grep (FFF)",
  description:
    "Search file contents for multiple patterns with OR logic using FFF. One call replaces multiple sequential greps.",
  promptSnippet:
    "multi_grep - search for multiple patterns at once (OR logic, all naming variants)",
  promptGuidelines: [
    "Use for multiple identifiers at once: ['ActorAuth', 'actor_auth', 'PopulatedActorAuth'].",
    "Include ALL naming convention variants.",
    "Patterns are literal text. NEVER escape special characters.",
    "Use constraints for file filtering, not inside patterns.",
    "One multi_grep replaces 3 sequential greps.",
  ],
  parameters: MultiGrepParams,

  async execute(toolCallId: string, params: MultiGrepInput, signal: AbortSignal | undefined, _onUpdate: AgentToolUpdateCallback<unknown> | undefined, ctx: ExtensionContext): Promise<AgentToolResult<unknown>> {
    return runToolPipeline("incMultiGrep", signal, ctx, ({ finder }) => {
      const outputMode: OutputMode = (params.output_mode as OutputMode) ?? "content";
      const isPaginating = !!params.cursor;
      const limit = params.limit ?? 100;

      let offset = 0;
      const patterns: string[] = params.patterns;
      if (params.cursor) {
        const cursor = getCursor(params.cursor);
        if (cursor) offset = cursor.offset;
      }

      const grepPatterns = patterns.map((p) =>
        params.constraints ? `${params.constraints} ${p}` : p
      );

      const grepOpts: GrepOptions = {
        pageSize: limit,
        offset,
        ...(params.context != null && {
          afterContext: params.context,
          beforeContext: params.context,
        }),
      };

      const result = finder.multiGrep(grepPatterns, grepOpts);
      if (!result.ok) throw new Error(`FFF multi_grep failed: ${result.error}`);

      let items = result.value.items;
      const notices: string[] = [];

      if (items.length === 0 && !isPaginating) {
        telemetry.incZeroResult();
        return {
          text: [
            `0 matches for patterns: ${patterns.map((p) => `"${p}"`).join(", ")}.`,
            "- Check spelling and naming conventions",
            "- Try fewer patterns",
            "- Use grep for a single pattern with fallback support",
            "- Use find to locate files by name first",
          ].join("\n"),
        };
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
            query: grepPatterns[0], mode: "plain", limit,
          });
        }
      }

      const annotations = populateAnnotations(finder, uniquePaths(items));
      let output = formatGrepOutput(
        { items, totalMatches: result.value.items.length },
        { outputMode, annotations, query: patterns.join(" | ") }
      );

      if (items.length >= limit) {
        const cursorId = createCursor(
          patterns.join("|"), offset + limit, "multi", params.constraints
        );
        notices.push(`More results available. Use cursor: "${cursorId}"`);
      }

      if (notices.length > 0) {
        output = output ? `${output}\n${notices.join("\n")}` : notices.join("\n");
      }

      return { text: output };
    });
  },

  renderCall: renderMultiGrepCall,
  renderResult: renderToolResult,
};
