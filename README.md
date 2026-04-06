# pi-fff

Pi extension replacing built-in `find` and `grep` with [FFF](https://github.com/dmtrKovalenko/fff.nvim) — frecency-ranked, git-aware, in-process C FFI search.

## Install

```bash
pi install pi-fff
```

## What it does

- **grep** — overrides built-in grep with FFF-powered content search
- **find** — overrides built-in find with FFF-powered file search
- **multi_grep** — new tool for OR-logic multi-pattern search

### Why

Pi's built-in tools spawn subprocesses from scratch every call. This extension:

- Calls FFF in-process via C FFI (no subprocess overhead)
- Returns frecency-ranked results (right file first)
- Auto-enriches small result sets (eliminates follow-up `read` calls)
- Recovers from zero-result searches through a 4-stage fallback chain
- Tracks query→file associations for smarter future ranking

## Commands

- `/fff-health` — runtime status
- `/fff-rescan` — force filesystem rescan
- `/fff-stats` — session search telemetry

## License

MIT
