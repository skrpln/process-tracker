# Process Tracker

Process Tracker turns a fenced `process-tracker` code block into a tracker table inside a
note: rows are tracks, columns are dates, and a checked cell means the track was done that
day.

The plugin keeps no state of its own. Every check is an evidence note in your vault — a note
that links to the track, names a date and carries a `done` property — so the table is a view
of what your notes already say, and the history stays in the vault when the table is gone.

## Features

- A table of tracks by dates, with the track column pinned while the dates scroll.
- Rows chosen by tag and narrowed with Dataview syntax: folders, tags, links, conditions on
  properties.
- Three cell states read from the vault: an empty day, a started one, a done one.
- A click starts an evidence note for a day; a click with the modifier checks the box and
  takes the mark back.
- New evidence follows the template its track card names.
- Hover previews for the evidence behind a cell and for the card behind a track name.
- Cells follow evidence edited elsewhere — another tab, a hover popover, the note itself.
- Date columns scroll with the wheel, in a note and in a canvas card.
- Checkboxes, fonts and colours come from the theme in use.

## Requirements

[Dataview](https://github.com/blacksmithgu/obsidian-dataview) is needed by one parameter,
`track`, which is written in Dataview syntax. Without Dataview the table still renders: the
filter is skipped and a warning appears under the table.

## Basic syntax

````markdown
```process-tracker
track: #health
start: 2026-09-01
days: 30
dates: asc
sort: priority desc
```
````

Every parameter is optional. An empty block shows each track card of the vault over the last
seven days. A parameter the plugin cannot read never breaks the block: the table falls back to
the default and names the problem underneath.

## Options

| Option | Values | Default | Description |
| --- | --- | --- | --- |
| `track` | Dataview filter: a source, a condition, or both | every track card | Narrows the rows. |
| `start` | `YYYY-MM-DD` | today | First day of the interval. |
| `days` | number | `7` | Length of the interval in days. |
| `dates` | `desc`, `asc` | `desc` | Column direction. |
| `sort` | `name`, `ctime`, `mtime` or a property, plus `asc` or `desc` | `name asc` | Row order. |

`track` takes what a Dataview query takes: `FROM "Health"`, `#health or #sport`,
`[[cleaning]]`, `outgoing([[note]])` name the source, `WHERE priority > 2` states a condition
over the properties of a track card, and the two can be combined. The keyword `FROM` may be
left out. Filtering by the plugin tag always applies on top of the filter, so `track` narrows
the tracks and never reaches outside them. A filter Dataview cannot read is ignored rather
than obeyed: the table shows every track card and says why underneath.

`start` pins the window in place, so a note about September keeps showing September instead of
drifting with the calendar. Without it the interval ends today.

`dates: desc` puts today next to the track name and reads into the past; `dates: asc` puts the
first day of the interval there and reads 1 → 30.

## Track cards

A track is a note tagged `#process_tracker`. Its properties configure the row; its body is
yours — protocols, links, notes.

```yaml
---
tags: process_tracker
track_name: cleaning
template: "[[evidence template]]"
---
```

| Property | Meaning |
| --- | --- |
| `tags` | The tag from the settings. Without it the note is not a track. |
| `track_name` | Name shown in the first column. The file name is used when it is absent. |
| `template` | Note that new evidence of this track is built on. |

Take the tag off a card and the row leaves the table; the evidence notes stay where they are.

## Evidence notes

An evidence note documents one day of one track.

```yaml
---
track: "[[cleaning]]"
date: 2026-09-11
done: true
---
```

A note counts as evidence when it links to a track card and names a date, however it was made
— by the tracker, by a template, by hand. The `done` property decides the checkbox.

| Cell | What the vault says |
| --- | --- |
| Empty box | No evidence for that day. |
| Box outlined in the hover colour of the theme | Evidence with `done: false`. Hovering it says `Not done`. |
| Checked box | Evidence with `done: true`. |

When two notes claim the same day, the done one wins.

## Using the table

| Cell | Click | Click with Cmd / Ctrl |
| --- | --- | --- |
| Empty | starts an evidence note, `done: false` | starts one with `done: true` |
| Started | opens the note in a new tab | checks the box |
| Done | opens the note in a new tab | takes the mark back |

Taking a mark back asks nothing and keeps the note. Deleting evidence is your own job, and the
cell empties when the note goes.

Hovering a cell that has evidence previews that note, hovering a track name previews its card;
an empty cell previews nothing. The popover belongs to the core **Page preview** plugin, which
lists Process Tracker among its sources — turn it off there if you would rather not have it.

Edit a `done` property anywhere else — in another tab, in a hover popover, in the note itself
— and the cell follows at once, without the table being redrawn.

The wheel over the table scrolls the date columns, whichever way you turn it: a mouse has one
wheel, and over the table it belongs to the days. Move the pointer off the table to scroll the
note again. In a canvas the columns scroll once the card is focused, and the wheel with Ctrl
or Cmd is left to the zoom of the board.

## Settings

**Settings → Community plugins → Process Tracker.**

| Setting | Meaning |
| --- | --- |
| Track tag | Tag that turns a note into a track card. `process_tracker` by default. |
| Evidence folder | Folder new evidence notes go to. Empty means the vault root. |

A changed setting reaches a table the next time its note renders — reopen the note, or switch
between Reading mode and Live Preview.

A new evidence note is named `{{track}} {{date}}` and carries `track`, `date` and `done`. When
the track card names a `template`, the note is built on that template and the plugin fills the
three properties in.

Templates pair well with [Templater](https://github.com/SilentVoid13/Templater) if you want
more control than one folder for everything: with "Trigger Templater on new file creation"
enabled, a command like `tp.file.move` in the template sends the evidence of each track to its
own folder. This is a convenience, not a dependency — the folder setting and a plain template
work on their own.

## Installation

The plugin is not in the community list yet, so install it by hand:

1. Download `main.js`, `manifest.json` and `styles.css` from a
   [release](https://github.com/skrpln/process-tracker/releases).
2. Put them in `<vault>/.obsidian/plugins/process-tracker/`.
3. Enable **Process Tracker** in Settings → Community plugins.

## Support

Please report bugs through [GitHub Issues](https://github.com/skrpln/process-tracker/issues).
Useful bug reports include:

- Obsidian version and operating system.
- Plugin version.
- Whether the issue happens in Reading mode, Live Preview, a canvas or a hover preview.
- A small `process-tracker` code block that reproduces the issue.
- Console errors, if any.

## License

MIT. See [LICENSE](LICENSE).
