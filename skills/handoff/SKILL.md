---
name: handoff
description: >
  Generate a self-contained handoff prompt for continuing work in a fresh session.
  Use when: "handoff", "hand off", "continuation prompt", "wrap up", "context transfer",
  "pick this up later", "pass to another agent".
---

# Handoff — Session Context Transfer

Generate a single, copy-pasteable prompt that gives a zero-context agent everything it needs to continue the current work. Nothing more.

## Instructions

### Step 1 — Gather State from Filesystem

Do not rely on conversation memory. Run these exact commands:

```bash
pwd
basename $(pwd)
git branch --show-current 2>/dev/null
git log --oneline -5 2>/dev/null
git status --short 2>/dev/null
git diff --stat 2>/dev/null
```

If git commands return empty (not a git repo), note "No VCS" and skip branch/commit/dirty-file extraction. Use `ls -la` and conversation history as the sole sources.

### Step 2 — Extract Context

For each element below, extract from the **specific source listed**. One or two sentences max. If the source yields nothing, write "None" — do not invent.

| Element | Source | Question |
|---------|--------|----------|
| **Goal** | Conversation: first user message | What is the user ultimately trying to accomplish? |
| **Scope** | Conversation: task boundaries | What specific task was this session focused on? |
| **Completed** | `git log` output + conversation | What has been done? List commits and files. |
| **In-progress** | `git diff --stat` + conversation tail | What was being worked on at handoff time? |
| **Remaining** | Conversation: unfinished items | What still needs to be done? |
| **Decisions** | Conversation: choice points | What choices were made and why? |
| **Blockers** | Conversation: errors, unknowns | Issues, bugs, or unknowns for the next session? |
| **Key files** | `git status` + `git diff --stat` | Which files are most relevant to the next step? |
| **User note** | `/handoff [note]` argument, if provided | What did the user want the next agent to focus on? |

### Step 3 — Emit the Handoff Prompt

Produce a single Markdown fenced code block. Use exactly this structure.

**Required sections** (always present, even if content is "None"):
- Project header, Goal, Current State, What's Left

**Conditional sections** (include only when non-empty):
- What's Been Done, Key Decisions, Key Files, Gotchas, Focus

```
Project: {name} — {one-line description}
Path: {absolute path}
Branch: {current branch or "no VCS"}

## Goal
{What the user is trying to accomplish.}

## What's Been Done
- {commit hash + message, or file + what changed}

## Current State
{Clean/dirty, failing tests, uncommitted changes.}

Dirty files:
- {path — what changed and why}

## What's Left
1. {Next concrete step — the new agent does this FIRST}
2. {Subsequent step}

## Key Decisions
- {Decision: what was chosen and why}

## Key Files
- `{path}` — {why it matters for the next step}

## Gotchas
- {Anything surprising or easy to get wrong}

## Focus
{User's note from /handoff argument, if provided.}
```

## Non-Negotiable Acceptance Criteria

1. **Self-contained** — zero references to "our conversation", "as we discussed", "earlier", or any prior context. A fresh agent reads this cold.
2. **Next action is concrete** — "What's Left" item #1 is a single, executable action with a specific file or command. ❌ "continue the refactor" → ✅ "Refactor `src/parser.ts` to replace the regex tokenizer with the new `TokenStream` class from `src/stream.ts`"
3. **Every dirty file listed** — every file from `git status --short` appears under "Dirty files" with a one-line note. No exceptions. If `git status` is clean, write "Working tree clean".
4. **No filler** — no full file contents, no conversation transcripts, no emotional context, no obvious project facts, no apologies, no preambles.
5. **Proportional sizing** (line count of the code block content, including headers):
   - Quick fix (1–2 files): 10–20 lines
   - Multi-file feature: 25–50 lines
   - Major refactor: 50–80 lines max
6. **One-shot generation** — never ask the user clarifying questions. Use what you have. If information is missing, omit the section or write "Unknown".
7. **Nothing outside the code block** — no commentary, no summary, no "here's your handoff". The fenced code block is the entire response.

## Output

A single Markdown fenced code block matching the template above. That is the entire deliverable.
