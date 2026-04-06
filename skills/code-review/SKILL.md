---
name: code-review
description: >
  Review code changes using Ringi — local-first structured review with web UI.
  Use when: "review", "code review", "/review", reviewing staged changes,
  branch diffs, or commit ranges. Ringi is the review tool; Pi is the workflow glue.
---

# Code Review with Ringi

Ringi is the single source of truth for review state. Pi creates review sessions and opens the ringi web UI. Do not duplicate ringi's structured review in freeform LLM output.

## Quick path

```bash
git add -A                        # stage what you want to review
/review                           # creates ringi session, opens browser pane
```

Or from the CLI directly:

```bash
ringi serve                       # start web UI (if not running)
ringi review create               # snapshot staged diff
# review in browser: comments, suggestions, todos
ringi review resolve last --yes   # approve
ringi export last --output r.md   # audit trail
```

## Review sources

| Source | Command | When to use |
|--------|---------|-------------|
| Staged changes | `/review` | Default. Safest explicit review source |
| Branch divergence | `/review --branch main` | Before pushing a feature branch |
| Specific commits | `/review --commits a1b,c2d` | Reviewing an agent's commit batch |
| GitHub PR | `/review --pr <url>` | Reviewing a pull request |

Preview before creating: `ringi source diff staged --stat`

## What happens when you run `/review`

1. Pi checks prerequisites (ringi CLI, git repo, staged changes)
2. Pi ensures `ringi serve` is running (starts it if needed)
3. Pi calls `ringi review create --json` to snapshot the diff
4. Pi opens the ringi web UI in a cmux browser pane
5. You review in the browser: inline comments, code suggestions, todos
6. When done: `ringi review resolve last --yes` to approve

## What Pi should NOT do

- Do not perform freeform LLM code review — ringi structures that
- Do not generate review summaries — ringi exports handle that
- Do not create review findings in chat — use ringi's inline comments
- Do not track review state — ringi's SQLite database is the source of truth

## When ringi is unavailable

If ringi is not installed, tell the user:

```
ringi not found. Install: pnpm install -g ringi
```

If no staged changes exist:

```
No staged changes. Stage files first: git add <files>
```

## Useful follow-up commands

```bash
ringi review show last --comments --todos   # check review state
ringi todo list                             # pending follow-ups
ringi review export last                    # export to markdown
ringi review resolve last --yes             # approve and close
```

## Non-negotiables

- Ringi owns review state. Pi does not.
- Reviews are immutable snapshots. The diff is anchored at creation time.
- Always stage explicitly before reviewing. Do not auto-stage.
- The web UI is the review surface, not the terminal.
