/**
 * Session context extraction helpers.
 *
 * Extracts minimal useful context from the current Pi session
 * for handoff into new panes.
 */

import type { ExtensionCommandContext } from "@mariozechner/pi-coding-agent";

const MAX_TEXT_LENGTH = 280;

interface MessageLike {
  role?: string;
  content?: unknown;
}

/** Normalize whitespace and truncate to a safe length. */
function truncate(text: string, maxLength: number = MAX_TEXT_LENGTH): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 3)}...`;
}

function isMessageEntry(entry: unknown): entry is { type: "message"; message: MessageLike } {
  return typeof entry === "object" && entry !== null && (entry as any).type === "message" && typeof (entry as any).message === "object";
}

function getMessageText(message: MessageLike | undefined): string | undefined {
  if (!message) return undefined;

  if (typeof message.content === "string") {
    const text = message.content.replace(/\s+/g, " ").trim();
    return text.length > 0 ? truncate(text) : undefined;
  }

  if (!Array.isArray(message.content)) return undefined;

  const text = message.content
    .filter(
      (part): part is { type: "text"; text: string } =>
        typeof part === "object" && part !== null && part.type === "text" && typeof part.text === "string",
    )
    .map((part) => part.text.replace(/\s+/g, " ").trim())
    .filter((part) => part.length > 0)
    .join(" ")
    .trim();

  return text.length > 0 ? truncate(text) : undefined;
}

const SKIP_PATTERNS = [
  /^\//,         // slash commands
  /^:/,          // colon commands
  /^run\s+\//i,  // "run /reload" etc.
];

const LOW_SIGNAL = new Set([
  "yes", "ok", "okay", "yep", "yeah", "sure", "nice", "cool", "great",
  "go ahead", "do it", "makes sense", "ok makes sense",
]);

const HANDOFF_PREFIX = "Handoff context from another Pi pane:";

function isSkippable(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return true;
  if (SKIP_PATTERNS.some((p) => p.test(trimmed))) return true;
  if (trimmed.startsWith(HANDOFF_PREFIX)) return true;
  if (LOW_SIGNAL.has(trimmed.toLowerCase())) return true;
  if (trimmed.split(/\s+/).length === 1 && trimmed.length <= 4) return true;
  return false;
}

/**
 * Find the most recent meaningful user message in the session.
 * Skips commands, low-signal responses, and previous handoffs.
 */
export function findRecentTask(ctx: ExtensionCommandContext): string | undefined {
  const entries = ctx.sessionManager.getBranch();

  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i];
    if (!isMessageEntry(entry) || entry.message?.role !== "user") continue;

    const text = getMessageText(entry.message);
    if (!text || isSkippable(text)) continue;
    return text;
  }

  return undefined;
}

/**
 * Get the current session name, if any.
 */
export function getSessionName(ctx: ExtensionCommandContext): string | undefined {
  return ctx.sessionManager.getSessionName() || undefined;
}
