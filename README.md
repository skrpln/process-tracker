# Process Tracker

A tracker for [Obsidian](https://obsidian.md) whose checkmarks are notes. A `process-tracker` code block becomes a table: rows are your tracks — a habit, a practice, a long project — columns are days, and a checked box means the day is done.

Every check is a separate note in your vault, where you can write what you did, how it went, links, photos, the protocol you followed. Hover the cell and the note opens in a preview you can read and edit on the spot, without leaving the table.

## Getting started

### 1. Make a track

Create a note for something you want to track — cleaning, running, a course — and tag it `process_tracker`. Only notes with this tag become rows of a tracker table, and the tag itself can be changed in the plugin settings.

The properties of the note set up its row:

```yaml
---
tags: process_tracker, some, other, tags
track_name: Cleaning            # Row title. Without it the file name is used.
template: "[[Cleaning entry]]"  # Template for new entry notes of this track.
---
```

> [!tip]
> New entries go to the folder set in the plugin settings. A `tp.file.move` command inside the template can send the entries of this track somewhere else — that needs [Templater](https://github.com/SilentVoid13/Templater) with "Trigger Templater on new file creation" enabled.

### 2. Add a table

In any note, add a `process-tracker` code block. Every option is optional. An empty block shows every track in your vault over the last seven days.

**Code block example**:

````markdown
```process-tracker
track: FROM #health
start: 2026-09-01
days: 30
dates: asc
sort: priority desc
```
````

| Option  | Values                                                       | Default     | What it does                         |
| ------- | ------------------------------------------------------------ | ----------- | ------------------------------------ |
| `track` | a Dataview filter                                            | every track | Picks which tracks become rows.      |
| `start` | `YYYY-MM-DD`                                                 | today       | First day of the window.             |
| `days`  | a number                                                     | `7`         | How many days the window holds.      |
| `dates` | `desc`, `asc`                                                | `desc`      | Which end of the window comes first. |
| `sort`  | `name`, `ctime`, `mtime` or a property, with `asc` or `desc` | `name asc`  | Define order of the rows.            |

>[!tip]
> - the `track` option needs the [Dataview](https://github.com/blacksmithgu/obsidian-dataview) community plugin, and takes what a Dataview query takes: `FROM #health or #sport`, `FROM "Health"`, `WHERE priority > 2`, or a source and a condition together;
> - the filter only narrows tracks: a note without the track tag never becomes a row, whatever the filter says;
> - without Dataview the table still works and shows every track in the vault.

### 3. Click a cell

- Click on an empty cell to track your activity on that day.
- A cell has three states:
	- **empty box** — there is no entry note for that day;
	- **outlined box** — there is an entry note and `done` is not set yet;
	- **checked box** — there is an entry note with `done: true`.
- Hover a cell to preview its entry note
- Hover a track title to preview the track note.

> [!tip] 
> The preview is drawn by the core **Page preview** plugin, which lists Process Tracker among its sources: the switch there decides whether you have to hold `Cmd`/`Ctrl` to get one.

**Available actions**

| Cell         | Click                              | `Cmd` / `Ctrl` + click         |
| ------------ | ---------------------------------- | ------------------------------ |
| Empty box    | creates an entry note for that day | creates one and checks the box |
| Outlined box | opens the note in a new tab        | checks the box                 |
| Checked box  | opens the note in a new tab        | unchecks the box               |

**Entry note example**:
```yaml
---
track: "[[Cleaning]]"  # Link to the track note this entry belongs to.
date: 2026-09-11
done: true
---

anything worth keeping about that day: what you did, links, checklists
```

## Settings

**Settings → Community plugins → Process Tracker**

| Setting      | What it does                                                 | Default           |
| ------------ | ------------------------------------------------------------ | ----------------- |
| Track tag    | Only notes with this tag become tracks. `#` is optional, and nested tags count: `process_tracker/health` matches `process_tracker`. | `process_tracker` |
| Entry folder | Where new entry notes go.                                    | vault root        |

## Bugs and questions

Please open an [issue](https://github.com/skrpln/process-tracker/issues). It helps if you say:

- your Obsidian version and operating system;
- the plugin version;
- **the theme you use** — please name it even when the problem looks unrelated to looks;
- where it happened: Reading mode, Live Preview, a canvas, a hover preview;
- a small `process-tracker` block that shows the problem;
- console errors, if there were any.

The theme matters more than it sounds. The tracker is a real table inside your note, so
every rule a theme writes for tables reaches it — paddings, borders, backgrounds, fonts,
even the width of a checkbox. Most of that is welcome: the tracker is meant to look like
the rest of your vault, and it should differ from theme to theme. But a rule now and then
lands somewhere it hurts, and knowing the theme is what turns a screenshot into a fixable
report. A screenshot of the table helps too.

## License

MIT. See [LICENSE](LICENSE).
