import { Type } from "@sinclair/typebox";
import type { Static } from "@sinclair/typebox";
import type { ToolDefinition, ExtensionContext, AgentToolUpdateCallback } from "@mariozechner/pi-coding-agent";
import type { AgentToolResult } from "@mariozechner/pi-agent-core";
import { formatFindOutput } from "./format-find.js";
import { trackFindResult } from "./query-tracker.js";
import { populateAnnotations } from "./populate-annotations.js";
import * as telemetry from "./telemetry.js";
import { runToolPipeline } from "./tool-pipeline.js";
import { renderFindCall, renderToolResult } from "./render.js";

const FindParams = Type.Object({
  pattern: Type.String({
    description: "Fuzzy search query. Supports path prefixes ('src/') and globs ('*.ts'). Keep short — 1-2 terms.",
  }),
  path: Type.Optional(
    Type.String({ description: "Directory constraint. Prepended to query." })
  ),
  limit: Type.Optional(
    Type.Number({ description: "Max results (default: 200)" })
  ),
});

type FindInput = Static<typeof FindParams>;

export const findTool: ToolDefinition<typeof FindParams> = {
  name: "find",
  label: "Find (FFF)",
  description:
    "Find files by name using FFF — frecency-ranked, git-aware, in-process C FFI. Replaces built-in find.",
  promptSnippet: "find - find files by name (frecency-ranked, git-aware)",
  promptGuidelines: [
    "Keep queries SHORT — 1-2 terms max.",
    "Multiple words narrow results (AND logic), not OR.",
    "Results marked (exact match!) should be read directly.",
    "Use this to find files by name. Use grep to search file contents.",
  ],
  parameters: FindParams,

  async execute(toolCallId: string, params: FindInput, signal: AbortSignal | undefined, _onUpdate: AgentToolUpdateCallback<unknown> | undefined, ctx: ExtensionContext): Promise<AgentToolResult<unknown>> {
    return runToolPipeline("incFind", signal, ctx, ({ finder }) => {
      const path = params.path?.replace(/^@/, "");
      const limit = params.limit ?? 200;

      let query = params.pattern;
      if (path) query = `${path} ${query}`;

      const result = finder.fileSearch(query, { pageSize: limit });
      if (!result.ok) throw new Error(`FFF find failed: ${result.error}`);

      if (result.value.items.length === 0) {
        telemetry.incZeroResult();
        return {
          text: [
            `0 files matching "${params.pattern}".`,
            "- Try a shorter query (1-2 terms)",
            "- Check spelling",
            "- Use grep to search file contents instead",
          ].join("\n"),
        };
      }

      const filePaths = new Set(result.value.items.map((i) => i.relativePath));
      const annotations = populateAnnotations(finder, filePaths);
      const output = formatFindOutput(result.value, { annotations, query: params.pattern });

      const tracked = trackFindResult(finder, params.pattern, result.value);
      if (tracked) telemetry.incQueryTrack();

      return { text: output };
    });
  },

  renderCall: renderFindCall,
  renderResult: renderToolResult,
};
