# pi-fff

A [Pi](https://github.com/mariozechner/pi) extension that replaces the built-in `find` and `grep` tools with [FFF](https://github.com/dmtrKovalenko/fff.nvim) — a Rust-native, SIMD-accelerated search engine called in-process through C FFI.

## Why pi-fff?

Pi's built-in tools spawn a new subprocess (`fd`, `rg`) on every call. pi-fff eliminates that overhead entirely:

| Built-in tool | pi-fff replacement | What changes |
|---|---|---|
| `find` (spawns `fd`) | `find` (FFF `fileSearch`) | Fuzzy matching, frecency ranking, git-aware, pre-indexed |
| `grep` (spawns `rg`) | `grep` (FFF `grep`) | SIMD-accelerated, frecency-ordered, mmap-cached, no subprocess |
| *(none)* | `multi_grep` (FFF `multiGrep`) | OR-logic multi-pattern search via Aho-Corasick |

**Key advantages:**

- **In-process C FFI** — no subprocess per call, instant response
- **Pre-indexed** — background indexing at session start; searches are near-instant
- **Frecency ranking** — files you access often rank higher, learns across sessions
- **Query history** — remembers query→file associations for smarter future ranking
- **Git-aware** — modified, staged, and untracked files get a ranking boost
- **Smart case** — lowercase query → case-insensitive; mixed case → case-sensitive
- **4-stage fallback** — zero-result searches recover through broaden → fuzzy → filepath → actionable error
- **Auto-enrichment** — small result sets (≤3 files) automatically include surrounding context lines

## Install

> **Prerequisite:** [Pi](https://github.com/mariozechner/pi) must be installed.

### As a Pi package (recommended)

Global install:

```shell
pi install git:github.com/sanurb/pi-fff
```

Project-local install:

```shell
pi install -l git:github.com/sanurb/pi-fff
```

Pi clones the repo, installs dependencies, and loads the extension from the `pi` field in `package.json`.

### Pin to a specific version

```shell
pi install git:github.com/sanurb/pi-fff@v0.1.0
```

### Local development

```shell
git clone https://github.com/sanurb/pi-fff.git
cd pi-fff
pnpm install
```

Then either load it directly:

```shell
pi -e ./src/index.ts
```

Or add it to your Pi `settings.json`:

```json
{
  "extensions": ["/absolute/path/to/pi-fff/src/index.ts"]
}
```

## Tools

This extension overrides Pi's built-in `find` and `grep` by registering tools with the same names. No configuration needed — install and it takes over.

### `grep`

Search file contents. Smart case, plain text by default, optional regex.

| Parameter | Type | Default | Description |
|---|---|---|---|
| `pattern` | `string` | *(required)* | Search text or regex |
| `path` | `string` | — | Directory or file constraint (e.g. `src/`, `*.ts`) |
| `ignoreCase` | `boolean` | smart case | Force case-insensitive search |
| `literal` | `boolean` | `true` | Treat pattern as literal text, not regex |
| `context` | `number` | `0` | Context lines before/after each match |
| `limit` | `number` | `100` | Maximum matches returned |
| `output_mode` | `string` | `"content"` | `"content"`, `"files_with_matches"`, or `"count"` |
| `cursor` | `string` | — | Pagination cursor from a previous result |

### `find`

Fuzzy file name search with frecency ranking.

| Parameter | Type | Default | Description |
|---|---|---|---|
| `pattern` | `string` | *(required)* | Fuzzy search query (e.g. `main.ts`, `src/ config`) |
| `path` | `string` | — | Directory constraint prepended to query |
| `limit` | `number` | `200` | Maximum results returned |

### `multi_grep`

OR-logic multi-pattern content search. One call replaces multiple sequential greps.

| Parameter | Type | Default | Description |
|---|---|---|---|
| `patterns` | `string[]` | *(required)* | Patterns with OR logic — include all naming variants |
| `constraints` | `string` | — | File constraints (e.g. `*.{ts,tsx} !test/`) |
| `context` | `number` | `0` | Context lines around matches |
| `limit` | `number` | `100` | Maximum matches returned |
| `output_mode` | `string` | `"content"` | `"content"`, `"files_with_matches"`, or `"count"` |
| `cursor` | `string` | — | Pagination cursor |

## Commands

| Command | Description |
|---|---|
| `/fff-health` | Show FFF runtime status (git info, frecency/history DB, scan state) |
| `/fff-rescan` | Force a filesystem rescan |
| `/fff-stats` | Session search telemetry (call counts, fallback stats, output size) |

## How it works

### Architecture

```
src/
├── index.ts                 Extension entry: lifecycle, tool registration, commands
├── finder.ts                FFF instance management (create, destroy, rescan)
├── tool-pipeline.ts         Shared execution envelope (abort, telemetry, truncation)
├── grep-tool.ts             grep: params, execute, fallback, enrichment
├── find-tool.ts             find: params, execute
├── multi-grep-tool.ts       multi_grep: params, execute
├── format-grep.ts           Grep output formatter (pure)
├── format-find.ts           Find output formatter (pure)
├── fallback.ts              4-stage zero-result recovery (broaden → fuzzy → filepath → error)
├── enrichment.ts            Auto-enrichment for small result sets
├── annotations.ts           Frecency labels, git status, size warnings (pure)
├── truncation.ts            Match-centered line truncation (pure)
├── query-tracker.ts         Query→file association tracking
├── populate-annotations.ts  Runtime annotation population
├── cursor-store.ts          Pagination cursor management
├── render.ts                TUI rendering for tool calls/results
├── telemetry.ts             In-memory session counters
└── types.ts                 Shared TypeScript interfaces
```

### Data storage

FFF stores frecency and query history in LMDB databases under `~/.pi/agent/fff/`:

| File | Purpose |
|---|---|
| `frecency.mdb` | File access frequency and recency scores |
| `history.mdb` | Query-to-file selection history |

No project files leave your machine. The extension runs entirely locally and only communicates with your configured LLM through Pi itself.

## Security

- **No shell execution** — all search happens through in-process C FFI
- **No network calls** — the extension makes zero outbound requests
- **No telemetry** — session stats are in-memory only, reset each session
- **Local storage only** — frecency and history databases stay on disk under `~/.pi/agent/fff/`

## License

MIT
