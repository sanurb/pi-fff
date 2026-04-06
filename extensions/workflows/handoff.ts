/**
 * Workflow: Handoff the current task into a new split.
 *
 * /handoff [note]     — create a handoff summary and continue in a new split
 *
 * Extracts context from the current session (task description, git status,
 * session name) and creates a new Pi session in a vertical split with that
 * context pre-loaded as the initial prompt.
 *
 * The handoff summary is concise — just enough for the new session to
 * understand what to continue doing.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { openInSplit } from "../cmux.js";
import { buildPiCommand } from "../shell.js";
import { getRepoInfo, summarizeStatus } from "../git.js";
import { findRecentTask, getSessionName } from "../session.js";
import { debug } from "../debug.js";

const MODULE = "handoff";

// ── Handoff summary building ───────────────────────────

interface HandoffContext {
  cwd: string;
  sessionName?: string;
  currentTask?: string;
  branch?: string;
  modifiedFiles: string[];
  newFiles: string[];
  note?: string;
}

function buildHandoffSummary(ctx: HandoffContext): string {
  const lines: string[] = ["Handoff context from another Pi pane:"];

  lines.push(`- Working directory: ${ctx.cwd}`);
  if (ctx.sessionName) lines.push(`- Session: ${ctx.sessionName}`);
  if (ctx.branch) lines.push(`- Branch: ${ctx.branch}`);
  if (ctx.currentTask) lines.push(`- Current task: ${ctx.currentTask}`);
  if (ctx.note) lines.push(`- Focus: ${ctx.note}`);

  if (ctx.modifiedFiles.length > 0) {
    lines.push("- Modified files:");
    for (const file of ctx.modifiedFiles.slice(0, 10)) {
      lines.push(`  ${file}`);
    }
    if (ctx.modifiedFiles.length > 10) {
      lines.push(`  … and ${ctx.modifiedFiles.length - 10} more`);
    }
  }

  if (ctx.newFiles.length > 0) {
    lines.push("- New files:");
    for (const file of ctx.newFiles.slice(0, 10)) {
      lines.push(`  ${file}`);
    }
    if (ctx.newFiles.length > 10) {
      lines.push(`  … and ${ctx.newFiles.length - 10} more`);
    }
  }

  return lines.join("\n");
}

function buildHandoffPrompt(summary: string, note?: string): string {
  const focus = note ? ` Focus on: ${note}.` : "";
  return [
    "Use the bundled handoff skill if it is available.",
    "",
    summary,
    "",
    `Continue the current task from this new pane.${focus}`,
    "Start with the highest-priority next step.",
  ].join("\n");
}

// ── Registration ───────────────────────────────────────

export default function handoffWorkflow(pi: ExtensionAPI): void {
  pi.registerCommand("handoff", {
    description: "Hand off the current task into a new vertical split with context",
    handler: async (args, ctx) => {
      const note = args.trim() || undefined;

      debug(MODULE, "building handoff context", { hasNote: Boolean(note) });

      // Gather context
      const repo = await getRepoInfo(pi, ctx.cwd);
      const status = summarizeStatus(repo?.statusLines ?? []);

      const handoffCtx: HandoffContext = {
        cwd: ctx.cwd,
        sessionName: getSessionName(ctx),
        currentTask: findRecentTask(ctx),
        branch: repo?.branch,
        modifiedFiles: status.modifiedFiles,
        newFiles: status.newFiles,
        note,
      };

      const summary = buildHandoffSummary(handoffCtx);
      const prompt = buildHandoffPrompt(summary, note);

      debug(MODULE, "opening handoff split", {
        hasTask: Boolean(handoffCtx.currentTask),
        fileCount: status.modifiedFiles.length + status.newFiles.length,
      });

      const result = await openInSplit(pi, "right", buildPiCommand(ctx.cwd, { prompt }));

      if (result.ok) {
        ctx.ui.notify("Handed off to new split", "info");
      } else {
        ctx.ui.notify(`Handoff failed: ${result.error}`, "error");
      }
    },
  });
}
