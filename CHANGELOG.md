# Changelog

## [Unreleased]

### Added
- Code block processor for the `process-tracker` language.
- Track cards: every note tagged `#process_tracker` becomes a row; `track_name` overrides the
  displayed name.
- Code block parameters `start`, `days`, `dates` and `sort`; `track` is parsed but not applied
  yet.
- `start: YYYY-MM-DD` sets the first day of the interval, so a monthly note keeps its own
  window instead of drifting with the calendar.
- `dates: asc | desc` chooses which end of the interval the table starts from.
- Table of tracks by dates: today is the first date column, older dates to the right.
- Theme-aware styling through Obsidian CSS variables; checkboxes follow the theme.
- Pinned first column: track names stay in place while the dates scroll.
- Date captions above the table, without a grid around them: `dd.mm` in a condensed
  grotesque face.
- Year caption above the pinned column, shown as soon as the table covers more than one year
  and following the scroll: it names the year that owns more than half of the visible columns.
- Equal width for every date column, independent of the content.
- Interface font and interface font sizes, so the table reads as UI rather than as prose.
