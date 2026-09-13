# Process Tracker

A tracker table inside a note: rows are tracks, columns are dates. A checked cell means the
track was done that day, and every check is documented by an evidence note.

> **Status: early development.** Phases 1-2 of 6 are done — the table renders, reads track
> cards from the vault and pins the first column. Checkbox interaction,
> evidence notes, hover popups and a settings tab are still ahead; see [Roadmap](#roadmap).

## Concepts

| Term | Meaning |
| --- | --- |
| **Track** | An activity you follow — one row of the table. |
| **Track card** | A note tagged `#process_tracker`. Its properties configure the track, its body is yours: protocols, links, notes. |
| **Evidence** | A note that documents one day of one track. Its `done` property drives the checkbox — no state is stored inside the plugin. |

A track card:

```yaml
---
tags: process_tracker
template: "[[evidence_template]]"
track_name: cleaning
---
```

An evidence note:

```yaml
---
track: "[[cleaning]]"
date: 2026-09-11
done: true
---
```

## Usage

Add a code block to any note:

````markdown
```process-tracker
track: FROM "folder"
start: 2026-09-01
days: 30
dates: asc
sort: priority asc
```
````

| Parameter | Value | Default |
| --- | --- | --- |
| `track` | Track filter in Dataview source syntax. Filtering by the plugin tag is always applied on top of it. | every card tagged `#process_tracker` |
| `start` | First day of the interval, `YYYY-MM-DD`. Pins the window in place — a monthly summary keeps showing its own month. | `today`, meaning the interval ends today |
| `days` | Interval length in days. | 7 |
| `dates` | Column direction: `desc` puts the newest day next to the track name, `asc` reads 1 → 30. | `desc` |
| `sort` | `name`, `ctime`, `mtime` or any frontmatter property, plus `asc` / `desc`. | `name asc` |

Unknown parameters and malformed values never break the block: the table falls back to the
defaults and lists the problems underneath.

## Requirements

- [Dataview](https://github.com/blacksmithgu/obsidian-dataview) — evaluates the `track` filter.
- [Templater](https://github.com/SilentVoid13/Templater) — renders evidence templates, with
  "Trigger Templater on new file creation" enabled.

Both are used by features that arrive in later phases; the table itself renders without them.

## Roadmap

| Phase | Scope | State |
| --- | --- | --- |
| 1 | Code block processor, track cards, basic table | done |
| 2 | Pinned first column, date captions, horizontal scroll | done |
| 3 | `track` filtering through Dataview | next |
| 4 | Checking cells, creating evidence notes from a template | planned |
| 5 | Hover popups for evidence and track cards | planned |
| 6 | Live updates on vault changes, settings tab | planned |

## Installation

Until the plugin is in the community list, install it manually: download `main.js`,
`manifest.json` and `styles.css` from a [release](../../releases) into
`<vault>/.obsidian/plugins/process-tracker/`, then enable **Process Tracker** in
Settings → Community plugins.

## Development

```bash
npm install
npm run dev    # esbuild in watch mode
npm run build  # type check + minified bundle
npm test       # unit tests
```

Tests run on the Node test runner (Node 22.6+), which executes TypeScript directly — the
project has no test framework and no runtime dependencies.

## License

[MIT](LICENSE)
