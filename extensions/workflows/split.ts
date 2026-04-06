/**
 * Workflow: Open a new split with a fresh Pi session.
 *
 * /split [prompt]     — vertical (right) split
 * /splitv [prompt]    — vertical (right) split (alias)
 * /splith [prompt]    — horizontal (down) split
 *
 * Opens a new cmux split in the current workspace and starts Pi there.
 * Optionally passes an initial prompt to the new session.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { openInSplit, type SplitDirection } from "../cmux.js";
import { buildPiCommand } from "../shell.js";
import { debug } from "../debug.js";

const MODULE = "split";

async function openPiSplit(
  pi: ExtensionAPI,
  cwd: string,
  direction: SplitDirection,
  prompt?: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  debug(MODULE, "opening split", { direction, hasPrompt: Boolean(prompt) });
  return openInSplit(pi, direction, buildPiCommand(cwd, { prompt }));
}

function registerSplitCommand(
  pi: ExtensionAPI,
  name: string,
  direction: SplitDirection,
  description: string,
): void {
  pi.registerCommand(name, {
    description,
    handler: async (args, ctx) => {
      const prompt = args.trim() || undefined;
      const result = await openPiSplit(pi, ctx.cwd, direction, prompt);

      if (result.ok) {
        ctx.ui.notify(`Opened ${direction === "right" ? "vertical" : "horizontal"} split`, "info");
      } else {
        ctx.ui.notify(`Split failed: ${result.error}`, "error");
      }
    },
  });
}

export default function splitWorkflow(pi: ExtensionAPI): void {
  registerSplitCommand(pi, "split", "right", "Open a new vertical split with Pi");
  registerSplitCommand(pi, "splitv", "right", "Open a new vertical split with Pi (alias)");
  registerSplitCommand(pi, "splith", "down", "Open a new horizontal split with Pi");
}
