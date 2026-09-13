# Changelog

## [Unreleased]

### Added
- Code block processor for the `process-tracker` language.
- Track cards: every note tagged `#process_tracker` becomes a row; `track_name` overrides the
  displayed name.
- Code block parameters `days` and `sort`; `track` is parsed but not applied yet.
- Table of tracks by dates: today is the first date column, older dates to the right.
- Theme-aware styling through Obsidian CSS variables; checkboxes follow the theme.
- Pinned first column: track names stay in place while the dates scroll.
- Date captions in `dd.mm` above the table, without a grid around them; the year appears once
  above the pinned column, and only when the table covers more than one year.
- Equal width for every date column, independent of the content.
- Interface font and interface font sizes, so the table reads as UI rather than as prose.
