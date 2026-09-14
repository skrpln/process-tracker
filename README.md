# Process Tracker

A tracker table inside a note: rows are tracks, columns are dates. A checked cell means the
track was done that day, and every check is documented by an evidence note.

> **Status: early development.** Phases 1-5 of 6 are done — the table renders, filters track
> cards with Dataview, shows the state of every cell as the evidence notes describe it, writes
> that evidence on a click and previews it on hover. Live updates on vault changes and a
> settings tab are still ahead; see [Roadmap](#roadmap).

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

## Interaction

| Cell | Click | Click with Cmd / Ctrl |
| --- | --- | --- |
| Empty | start an evidence note, `done: false` | start one with `done: true` |
| Draft (`done: false`) | open the note in a new tab | check the box |
| Done (`done: true`) | open the note in a new tab | take the mark back |

Taking a mark back asks nothing and keeps the note; deleting evidence stays a manual job.

Hovering a cell that has evidence previews that note, hovering a track name previews its card;
an empty cell previews nothing. The popover belongs to the core **Page preview** plugin, which
lists Process Tracker among its sources — turn it off there if you would rather not have it.

A new evidence note follows the template the track card names in its `template` property;
the plugin fills in `track`, `date` and `done` and leaves the rest of the template, `<% %>`
commands included, to Templater. Without a template the note is named `{{track}} {{date}}`,
lands in the folder from the settings — the vault root by default — and carries the three
properties and an empty body.

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
| `track` | Track filter in Dataview syntax: a `FROM` source, a `WHERE` condition, or both. Filtering by the plugin tag is always applied on top of it. | every card tagged `#process_tracker` |
| `start` | First day of the interval, `YYYY-MM-DD`. Pins the window in place — a monthly summary keeps showing its own month. | `today`, meaning the interval ends today |
| `days` | Interval length in days. | 7 |
| `dates` | Column direction: `desc` puts the newest day next to the track name, `asc` reads 1 → 30. | `desc` |
| `sort` | `name`, `ctime`, `mtime` or any frontmatter property, plus `asc` / `desc`. | `name asc` |

`track` takes what a Dataview query takes: `FROM "folder"`, `#tag`, `[[link]]`,
`outgoing([[note]])` and their combinations name the source, `WHERE priority > 2` names a
condition over the properties of a track card. The keyword `FROM` may be left out, so
`track: #health or #sport` works. A filter Dataview cannot read is ignored rather than
obeyed: the table shows every track card and says why underneath.

Unknown parameters and malformed values never break the block: the table falls back to the
defaults and lists the problems underneath.

## Requirements

- [Dataview](https://github.com/blacksmithgu/obsidian-dataview) — evaluates the `track` filter.
- [Templater](https://github.com/SilentVoid13/Templater) — renders evidence templates, with
  "Trigger Templater on new file creation" enabled.

Without Dataview the table still renders — the `track` filter is skipped and a warning shows
under the table. Templater is used by features that arrive in later phases.

## Roadmap

| Phase | Scope | State |
| --- | --- | --- |
| 1 | Code block processor, track cards, basic table | done |
| 2 | Pinned first column, date captions, horizontal scroll | done |
| 3 | `track` filtering through Dataview | done |
| 4 | Cell state from evidence notes, checking cells, creating evidence from a template | done |
| 5 | Hover popups for evidence and track cards | done |
| 6 | Live updates on vault changes, settings tab | next |

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
