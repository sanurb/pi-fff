# pi-cmux-workflows — Opinionated workflow commands for Pi + cmux

## What this repo is

A compact set of **slash command workflows** that make Pi + cmux dramatically more useful for daily development.

Not a platform. Not an SDK. Not an orchestration framework. Just excellent daily ergonomics.

## Architecture

```
extensions/
  index.ts              ← entrypoint: guards + workflow registration
  cmux.ts               ← cmux CLI wrapper (exec, identify, split, browser pane)
  shell.ts              ← shell escaping and Pi command building
  git.ts                ← minimal git helpers (repo info, status summary)
  session.ts            ← session context extraction (recent task, name)
  debug.ts              ← conditional stderr logging
  workflows/
    split.ts            ← /split, /splitv, /splith
    review.ts           ← /review (ringi + cmux browser pane)
    open-project.ts     ← /open <path-or-zoxide-query>
    handoff.ts          ← /handoff [note]
skills/
  code-review/SKILL.md  ← ringi review workflow, sources, non-negotiables
  handoff/SKILL.md      ← self-contained handoff prompt generation
prompts/
  review.md             ← ringi review workflow prompt
```

## Module boundaries

| Module | Knows about | Does not know about |
|--------|-------------|-------------------|
| cmux | cmux CLI | workflows, git, session, ringi |
| shell | nothing | cmux, git, workflows |
| git | ExtensionAPI (exec) | cmux, session, workflows |
| session | SessionManager API | cmux, git, workflows |
| workflows/* | cmux, shell, git, session | each other |
| review workflow | cmux, ringi CLI | other workflows |
| index | all modules (wiring only) | — |

## Key patterns

- **Ringi-first review**: ringi owns review state, cmux is the presentation layer, Pi is workflow glue
- **Guards**: PI_CMUX_CHILD=1 → bail; cmux ping → bail if unavailable
- **Split readiness**: poll for new surface after `new-split` before sending command
- **Shell safety**: all values go through `shellEscape()` — no interpolation
- **Concise handoffs**: bounded file lists, truncated task text, no giant dumps
- **Degraded modes**: clear errors for missing ringi, no staged changes, failed browser pane

## Slash commands

| Command | Description |
|---------|-------------|
| `/split [prompt]` | Open vertical split with Pi |
| `/splitv [prompt]` | Alias for /split |
| `/splith [prompt]` | Open horizontal split with Pi |
| `/review` | Create ringi review for staged changes, open browser pane |
| `/review --branch <name>` | Review branch divergence |
| `/review --commits <sha>` | Review specific commits |
| `/review --pr <url>` | Review a GitHub PR |
| `/open <path>` | Open Pi in another directory |
| `/handoff [note]` | Hand off task context to new split |

## Review architecture

```
User runs /review
  → Pi checks prerequisites (ringi, git, staged changes)
  → Pi ensures ringi serve is running (auto-starts if needed)
  → Pi calls: ringi review create --json
  → Pi calls: cmux new-pane --type browser --url <ringi-url>
  → User reviews in ringi web UI (comments, suggestions, todos)
  → User resolves: ringi review resolve last --yes
```

Pi does NOT:
- Perform freeform LLM code review
- Generate review summaries
- Track review state
- Create review findings in chat

## Non-goals

- Generic cmux passthrough
- Browser automation beyond opening ringi URL
- Sidebar/status systems
- Agent orchestration
- Subagent platforms
- Session naming or turn summaries
- Freeform LLM review output
