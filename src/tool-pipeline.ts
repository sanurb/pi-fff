import { truncateHead } from "@mariozechner/pi-coding-agent";
import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import type { AgentToolResult } from "@mariozechner/pi-agent-core";
import type { FileFinder } from "@ff-labs/fff-node";
import { getFinder } from "./finder.js";
import * as telemetry from "./telemetry.js";

export interface ToolOutput {
  text: string;
}

export interface PipelineContext {
  readonly finder: FileFinder;
  readonly signal: AbortSignal | undefined;
  readonly ctx: ExtensionContext;
}

type TelemetryCounter = "incGrep" | "incFind" | "incMultiGrep";

/**
 * Shared envelope: abort check → telemetry → finder → execute → truncate → wrap.
 * Tools provide only the domain-specific logic via the execute callback.
 */
export async function runToolPipeline(
  counter: TelemetryCounter,
  signal: AbortSignal | undefined,
  ctx: ExtensionContext,
  execute: (pc: PipelineContext) => ToolOutput
): Promise<AgentToolResult<unknown>> {
  if (signal?.aborted) throw new Error("Aborted");

  telemetry[counter]();

  const finder = getFinder();
  if (!finder) {
    throw new Error(
      "FFF not initialized. The extension may still be scanning. Try again in a moment."
    );
  }

  const output = execute({ finder, signal, ctx });
  const truncated = truncateHead(output.text);
  telemetry.addOutputChars(truncated.content.length);

  return {
    content: [{ type: "text", text: truncated.content }],
    details: {},
  };
}
