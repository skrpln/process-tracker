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
- Month captions above the date columns; a caption stays centred in the visible part of its
  own month while the table scrolls.
- Equal width for every date column, independent of the content.
