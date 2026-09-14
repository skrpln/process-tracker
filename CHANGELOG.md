# Changelog

## [Unreleased]

### Added
- Code block processor for the `process-tracker` language.
- Track cards: every note tagged `#process_tracker` becomes a row; `track_name` overrides the
  displayed name.
- Code block parameters `track`, `start`, `days`, `dates` and `sort`.
- `track` filters the rows with Dataview: a `FROM` source is answered from the index, a
  `WHERE` condition is evaluated on the track cards that source leaves. The keyword `FROM`
  may be left out. The plugin tag always applies on top of the filter.
- A filter that cannot be read never empties the table: the rows stay and a warning under the
  table names the reason — Dataview missing, a source or a condition Dataview could not read.
- `start: YYYY-MM-DD` sets the first day of the interval, so a monthly note keeps its own
  window instead of drifting with the calendar.
- `dates: asc | desc` chooses which end of the interval the table starts from.
- Table of tracks by dates: today is the first date column, older dates to the right.
- Cell state read from the evidence notes of the vault: a checked box for `done: true`, an
  unchecked box outlined in the hover colour of the theme for a draft, an empty box for a day
  without evidence. Nothing is cached — the state is rebuilt from the files on every render.
- Evidence is recognised by its properties — a link to a track card and a date — however the
  note was created. When two notes claim the same day, the done one wins.
- Clicking a cell: a plain click starts an evidence note on an empty day and opens the note
  of a day that has one; a click with the modifier (Cmd on macOS, Ctrl elsewhere) checks the
  box and takes the mark back. Unchecking asks nothing and keeps the note.
- New evidence is built on the template the track card names in its `template` property, with
  `track`, `date` and `done` filled in by the plugin. Everything is written in one pass, so
  Templater finds the `<% %>` commands of the template intact.
- Without a template an evidence note is named `{{track}} {{date}}`, lands in the folder from
  the settings — the vault root by default — and carries the three properties and an empty
  body. A template a card names but the vault does not have stops the creation with a notice.
- Hover previews: the evidence note behind a cell, the card behind a track name. The popover
  is the one the core Page preview plugin draws, so it follows the reader's own settings and
  is editable wherever Obsidian makes it editable. An empty cell previews nothing.
- Hovering a draft also says `Not done`: the preview shows the note, the tooltip names what
  the note is still missing.
- Empty state that names the filter when a `track` filter matched no card.
- Theme-aware styling through Obsidian CSS variables; checkboxes follow the theme.
- Pinned first column: track names stay in place while the dates scroll.
- Date captions above the table, without a grid around them: the day alone, set in the
  theme's heading face while the table body follows the theme's text face.
- Month and year above the pinned column, following the scroll: the caption names the month
  that owns more than half of the visible columns.
- Square cells: a date column is measured against the height of a row, so it stays square
  whatever the theme does to row height.
- A double rule sets the pinned track column apart from the grid of days.
- Equal width for every date column, independent of the content.
- Settings tab: the tag that marks a track card and the folder new evidence goes to. A changed
  setting reaches a table at the next render of its note.
- Evidence edited outside the table — in another tab, in a hover popover, by hand — repaints
  its cell. The plugin listens to the metadata cache and paints the cells of the one note that
  changed; no index is rebuilt and no table is redrawn, so the cost does not grow with the
  vault. Deleting an evidence note empties its cell.
- The wheel over the table scrolls the date columns, vertical gestures included: a mouse has
  one wheel, and over the table it belongs to the days. Works in a canvas card that is focused;
  a card that is not focused stays with the canvas. Ctrl / Cmd with the wheel is left to the
  zoom of the canvas and of the note.
