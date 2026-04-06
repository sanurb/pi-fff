# pi-fff — FFF-powered search for Pi

## What this is

A Pi extension that replaces the built-in `find` and `grep` tools with [FFF](https://github.com/dmtrKovalenko/fff.nvim) — a Rust search engine called through the Node SDK (`@ff-labs/fff-node`) via C FFI. Adds `multi_grep` for OR-logic multi-pattern search.

## Architecture

```
src/
├── index.ts                ← Extension entry: lifecycle, tool registration, commands
├── finder.ts               ← FFF instance management (ensureFinder, destroy, getFinder)
├── tool-pipeline.ts        ← Shared execute envelope (abort, finder, telemetry, truncation)
├── grep-tool.ts            ← grep tool: params, execute logic, fallback, enrichment
├── find-tool.ts            ← find tool: params, execute logic
├── multi-grep-tool.ts      ← multi_grep tool: params, execute logic
├── format-grep.ts          ← Grep output formatter (pure function)
├── format-find.ts          ← Find output formatter (pure function)
├── fallback.ts             ← Zero-result fallback chain (4 stages, sync)
├── enrichment.ts           ← Auto-enrichment for small result sets
├── query-tracker.ts        ← Query→file tracking heuristics
├── populate-annotations.ts ← Runtime annotation population (bridges SDK → formatters)
├── telemetry.ts            ← Session counters (in-memory)
├── annotations.ts          ← Frecency labels, git status, size warnings (pure)
├── truncation.ts           ← Match-centered line truncation (pure)
├── cursor-store.ts         ← Pagination cursor management (in-memory)
├── render.ts               ← TUI renderCall/renderResult (single shared result renderer)
├── types.ts                ← Shared interfaces (readonly by default)
└── fff-node.d.ts           ← Type shim for @ff-labs/fff-node SDK
```

## Module boundaries

| Module | Knows about | Pure? |
|--------|-------------|-------|
| types | nothing | yes |
| annotations | types | yes |
| truncation | nothing | yes |
| format-grep | types, annotations, truncation | yes |
| format-find | types, annotations | yes |
| fallback | FFF SDK, types | no (sync) |
| enrichment | FFF SDK, types | no |
| query-tracker | FFF SDK, types | no |
| populate-annotations | FFF SDK, types (runtime detection) | no |
| tool-pipeline | finder, telemetry, pi-coding-agent | no |
| telemetry | types | yes (in-memory state) |
| cursor-store | types | yes (in-memory state) |
| render | pi-tui, pi-coding-agent (Theme) | no |
| finder | FFF SDK (lazy resolution, no TLA) | no |
| grep-tool | tool-pipeline, formatters, fallback, enrichment | no |
| find-tool | tool-pipeline, formatters, query-tracker | no |
| multi-grep-tool | tool-pipeline, formatters, enrichment | no |
| index | all modules (wiring only) | no |

## Key patterns

- **Override built-ins**: grep and find register with the same `name` as Pi's built-ins
- **Pure formatters**: format-grep, format-find, annotations, truncation have zero FFF SDK imports
- **Definition gating**: All `isDefinition` features check `"isDefinition" in items[0]` at runtime
- **Fallback chain**: 4 stages (broaden → fuzzy → filepath → actionable error), stops at first success
- **Auto-enrichment**: ≤3 files → re-issue grep with wider context (1 file: 15 lines, 2-3: 8 lines)
- **Frecency thresholds**: ≥100 hot, ≥50 warm, ≥10 frequent, <10 omit
- **Budget scaling**: ≤3 files → 5000 chars, 4-8 → 3500, ≥9 → 2500

## Commands

| Command | Description |
|---------|-------------|
| `/fff-health` | Show FFF runtime status |
| `/fff-rescan` | Force filesystem rescan |
| `/fff-stats` | Session search telemetry |
