# pi-cmux-workflows

Opinionated workflow commands for [Pi](https://github.com/mariozechner/pi-coding-agent) + [cmux](https://cmux.app).

A compact set of slash commands that make daily development with Pi + cmux dramatically more useful.

## What it does

| Command | What happens |
|---------|-------------|
| `/split [prompt]` | Open a new vertical split with a fresh Pi session |
| `/splith [prompt]` | Open a new horizontal split with a fresh Pi session |
| `/review` | Create a ringi review for staged changes, open in browser pane |
| `/review --branch main` | Review branch divergence from main |
| `/review --commits a1b,c2d` | Review specific commits |
| `/review --pr <url>` | Review a GitHub pull request |
| `/open ~/projects/api` | Open Pi in another directory in a new split |
| `/open api` | Open Pi via zoxide match in a new split |
| `/handoff` | Hand off current task context to a new split |
| `/handoff fix the auth bug next` | Hand off with a focus note |

## Review workflow (ringi-first)

The `/review` command uses [ringi](https://github.com/sanurb/ringi) as the single source of truth for review state:

```bash
git add -A          # 1. stage what you want to review
/review             # 2. creates ringi session, opens browser pane
                    # 3. review in ringi web UI: comments, suggestions, todos
ringi review resolve last --yes   # 4. approve when done
ringi export last --output r.md   # 5. (optional) export audit trail
```

**What happens under the hood:**
1. Pi checks prerequisites (ringi CLI, git repo, staged changes)
2. Pi ensures `ringi serve` is running (starts it in a split if needed)
3. Pi calls `ringi review create --json` to snapshot the diff
4. Pi opens the ringi web UI in a cmux browser pane next to your terminal

**Pi does NOT** perform freeform LLM code review. Ringi structures the review with inline comments, code suggestions, todos, and export. Pi is only the workflow glue.

## Bundled Skills

### `code-review`

Teaches Pi the ringi workflow: review sources, prerequisites, follow-up commands, and the boundary between Pi (workflow glue) and ringi (review state owner).

### `handoff`

Self-contained handoff prompt generation with proportional sizing (10–80 lines based on session complexity).

## What it does NOT do

- Freeform LLM code review (ringi handles structured review)
- Generic cmux command routing or passthrough
- Browser automation beyond opening ringi's URL
- Sidebar status, notifications, or monitoring
- Agent orchestration or subagent spawning
- Session naming or turn summaries

## Requirements

- [Pi](https://github.com/mariozechner/pi-coding-agent) (coding agent)
- [cmux](https://cmux.app) (terminal multiplexer)
- [ringi](https://github.com/sanurb/ringi) (local-first code review) — required for `/review`
- Optional: [zoxide](https://github.com/ajeetdsouza/zoxide) (for `/open` fuzzy matching)

## Install

```bash
pi install git:github.com/sanurb/pi-cmux-workflows
```

## Configuration

| Environment Variable | Default | Description |
|---------------------|---------|-------------|
| `PI_CMUX_CHILD` | — | Set to `1` to prevent recursive spawn |
| `PI_CMUX_WORKFLOWS_DEBUG` | — | Set to `1` for debug logging to stderr |

## How it works

1. **Guard checks**: bail if running as a child process or if cmux is unavailable
2. **Split creation** (for `/split`, `/open`, `/handoff`): creates a `new-split`, polls for surface readiness, sends command via `cmux send`
3. **Review creation** (for `/review`): calls `ringi review create --json`, opens `cmux new-pane --type browser` with ringi URL
4. **Shell safety**: all values are single-quote escaped — no injection possible

## Architecture

```
extensions/
  index.ts              ← entrypoint: guards + workflow registration
  cmux.ts               ← cmux CLI wrapper (exec, split, browser pane)
  shell.ts              ← shell escaping, Pi command building
  git.ts                ← repo info, status summary
  session.ts            ← context extraction from current session
  debug.ts              ← conditional stderr logging
  workflows/
    split.ts            ← /split, /splitv, /splith
    review.ts           ← /review (ringi + cmux browser)
    open-project.ts     ← /open with zoxide fallback
    handoff.ts          ← /handoff with context extraction
skills/
  code-review/SKILL.md  ← ringi review workflow, sources, boundaries
  handoff/SKILL.md      ← handoff methodology, template, sizing
prompts/
  review.md             ← ringi review workflow prompt
```

## Degraded modes

| Condition | Behavior |
|-----------|----------|
| cmux unavailable | Extension silently skips registration |
| ringi not installed | `/review` shows install instructions |
| No staged changes | `/review` shows staging instructions |
| Not a git repo | `/review` shows error |
| ringi serve not running | `/review` auto-starts it in a split |
| Browser pane fails | Shows fallback URL to open manually |
| zoxide unavailable | `/open` falls back to direct path only |

## Limitations

- Requires cmux to be running — silently no-ops otherwise
- `/review` requires ringi installed globally
- ringi serve runs on port 3000 by default
- No session inheritance — each split starts a fresh Pi session
- No worktree support yet

## Acknowledgment

This project is inspired by and builds on the great work of:

- [javiermolinar/pi-cmux](https://github.com/javiermolinar/pi-cmux) — extension patterns (split readiness, shell escaping, zoxide), and the extension → prompt → skill shape for workflows
- [espennilsen/pi](https://github.com/espennilsen/pi) — handoff skill methodology, proportional context sizing, and progressive skill structure
- [joelhooks/pi-cmux](https://github.com/joelhooks/pi-cmux) — child-process guards (`PI_CMUX_CHILD`) and cmux lifecycle teaching patterns

Also informed by [storelayer/pi-cmux-browser](https://github.com/storelayer/pi-cmux-browser), [sasha-computer/pi-cmux](https://github.com/sasha-computer/pi-cmux), and [simonjohansson/pi-cmux](https://github.com/simonjohansson/pi-cmux).

## Deferred roadmap

- **Git worktree continuation**: open a new split in a worktree branch with context
- **Session forking**: inherit session history via `SessionManager.createBranchedSession()`
- **ringi MCP integration**: connect Pi to ringi via MCP for agent-assisted review
- **Review from Pi context**: auto-detect review source from current git state
- **Horizontal variants**: `/reviewh`, `/handoffh` for horizontal splits

## License

MIT
