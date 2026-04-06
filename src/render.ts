import { Text } from "@mariozechner/pi-tui";
import type { Component } from "@mariozechner/pi-tui";
import type { Theme, ToolRenderResultOptions } from "@mariozechner/pi-coding-agent";
import type { AgentToolResult } from "@mariozechner/pi-agent-core";

const COLLAPSED_MAX_LINES = 15;

function getOrCreateText(lastComponent: Component | undefined): Text {
  return (lastComponent as Text | undefined) ?? new Text("", 0, 0);
}

function extractText(result: AgentToolResult<unknown>): string {
  return result.content?.find((c) => c.type === "text")?.text?.trim() ?? "";
}

export function renderToolResult(
  result: AgentToolResult<unknown>,
  options: ToolRenderResultOptions,
  theme: Theme,
  context: { lastComponent: Component | undefined }
): Component {
  const text = getOrCreateText(context.lastComponent);
  const output = extractText(result);

  if (!output) {
    text.setText(theme.fg("muted", "No output"));
    return text;
  }

  const lines = output.split("\n");
  const maxLines = options.expanded ? lines.length : COLLAPSED_MAX_LINES;
  const displayLines = lines.slice(0, maxLines);
  const remaining = lines.length - maxLines;

  let content = `\n${displayLines.map((l) => theme.fg("toolOutput", l)).join("\n")}`;
  if (remaining > 0) {
    content += theme.fg("muted", `\n... (${remaining} more lines)`);
  }
  text.setText(content);
  return text;
}

export function renderGrepCall(
  args: { pattern?: string; path?: string; output_mode?: string; cursor?: string },
  theme: Theme,
  context: { lastComponent: Component | undefined }
): Component {
  const text = getOrCreateText(context.lastComponent);
  const pattern = args?.pattern ?? "";
  const path = args?.path ?? ".";

  let content =
    theme.fg("toolTitle", theme.bold("grep")) +
    " " +
    theme.fg("accent", `/${pattern}/`) +
    theme.fg("toolOutput", ` in ${path}`);

  if (args?.output_mode && args.output_mode !== "content") {
    content += theme.fg("muted", ` (${args.output_mode})`);
  }
  if (args?.cursor) {
    content += theme.fg("muted", ` (page)`);
  }

  text.setText(content);
  return text;
}

export function renderFindCall(
  args: { pattern?: string; path?: string },
  theme: Theme,
  context: { lastComponent: Component | undefined }
): Component {
  const text = getOrCreateText(context.lastComponent);
  text.setText(
    theme.fg("toolTitle", theme.bold("find")) +
    " " +
    theme.fg("accent", args?.pattern ?? "") +
    theme.fg("toolOutput", ` in ${args?.path ?? "."}`)
  );
  return text;
}

export function renderMultiGrepCall(
  args: { patterns?: string[]; constraints?: string; output_mode?: string; cursor?: string },
  theme: Theme,
  context: { lastComponent: Component | undefined }
): Component {
  const text = getOrCreateText(context.lastComponent);
  const patterns = args?.patterns ?? [];
  const constraints = args?.constraints ?? "";

  let content =
    theme.fg("toolTitle", theme.bold("multi_grep")) +
    " " +
    theme.fg("accent", patterns.map((p) => `/${p}/`).join(" | "));

  if (constraints) {
    content += theme.fg("toolOutput", ` in ${constraints}`);
  }
  if (args?.output_mode && args.output_mode !== "content") {
    content += theme.fg("muted", ` (${args.output_mode})`);
  }
  if (args?.cursor) {
    content += theme.fg("muted", ` (page)`);
  }

  text.setText(content);
  return text;
}
