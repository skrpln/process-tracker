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
track_color: "#4CAF50"          # Colour of the checkmarks. Without it the theme decides.
template: "[[Cleaning entry]]"  # Template for new entry notes of this track.
entries: journal                # Optional: notes (default) or journal, see below.
journal: "[[Cleaning log]]"     # Optional: where the journal lives. Without it, in this note.
---
```

> [!tip]
> `track_color` takes any colour CSS understands — `#4CAF50`, `green`, `rgb(76 175 80)`, or a variable of your theme like `var(--color-red)`. Keep the quotes: without them YAML reads `#` as the start of a comment. A value the browser cannot read is ignored and the track goes back to the colour of the theme. The colour is used as given — pick one that reads well against the theme you use, in the light and the dark variant both.

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
track_color: "#4CAF50"
stroke: true
entries: journal
```
````

| Option        | Values                                                       | Default     | What it does                         |
| ------------- | ------------------------------------------------------------ | ----------- | ------------------------------------ |
| `track`       | a Dataview filter                                            | every track | Picks which tracks become rows.      |
| `start`       | `YYYY-MM-DD`                                                 | today       | First day of the window.             |
| `days`        | a number                                                     | `7`         | How many days the window holds.      |
| `dates`       | `desc`, `asc`                                                | `desc`      | Which end of the window comes first. |
| `sort`        | `name`, `ctime`, `mtime` or a property, with `asc` or `desc` | `name asc`  | Define order of the rows.            |
| `track_color` | any CSS colour                                               | theme       | Colours the checkmarks of the table. |
| `stroke`      | `true`, `false`                                              | `false`     | Threads a streak of checked days together. |
| `daily_note_dir` | a folder, `/` for the vault root                          | your daily notes folder | Where this table looks for daily notes and creates them. |
| `entries`     | `notes`, `journal`                                           | the setting | How a click makes an entry for the tracks of this table. |

>[!tip] 
> - the `track` option needs the [Dataview](https://github.com/blacksmithgu/obsidian-dataview) community plugin, and takes what a Dataview query takes: `FROM #health or #sport`, `FROM "Health"`, `WHERE priority > 2`, or a source and a condition together;
> - the filter only narrows tracks: a note without the track tag never becomes a row, whatever the filter says;
> - without Dataview the table still works and shows every track in the vault;
> - `track_color` colours this table only, and only the tracks whose own card names no colour: the card always wins. A value that is not a colour is ignored, and a note about it appears under the table;
> - `stroke` draws a thin line through three or more checked days in a row, in the colour of the checkmarks. A day with an entry that is not done breaks the streak, exactly as an empty day does. The streak is counted over your vault and not over the days in sight: scroll into the middle of a long one and the line still runs off both edges of the table.

### 3. Click a cell

- Click on an empty cell to track your activity on that day.
- A cell has three states:
	- **empty box** — there is no entry note for that day;
	- **outlined box** — there is an entry note and `done` is not set yet;
	- **checked box** — there is an entry note with `done: true`.
- Hover a cell to preview its entry note
- Hover a track title to preview the track note.

> [!tip]+
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
mark: 🔥               # Optional. Shown instead of the checkmark.
---

anything worth keeping about that day: what you did, links, checklists
```

`mark` lets a day say how it went: a checked day shows the first sign of the value — a digit, a letter or an emoji — in place of its checkmark. `mark: 4` shows `4`, `mark: 🔥` shows 🔥; one sign fits in a cell, so `mark: 10` shows `1`. An outlined box keeps its box, and so does a day with several entries.

### Entries as journal records

Rather not have a note for every day? With `entries: journal` a click writes a record into the journal of the track instead: a section at the end of the track note, under `# Journal`, or the note its `journal` property links to. That note is created with the first record if it does not exist yet.

**Journal example**:
```markdown
# Journal

## 2026-09-28
- [x] done
### 🔥
anything worth keeping about that day

---

## 2026-09-27
- [ ] done

---
```

- A record is a second-level heading that starts with the date; it runs to the next heading of the first or second level. First-level headings are yours — years, months, anything.
- `done` is the **first checkbox** of the record, wherever it stands in it. The plugin writes it right under the heading; if your template has checkboxes of its own, keep the `done` line above them.
- The `mark` of a record is its first third-level heading made of a single sign: `### 🔥` shows 🔥, `### 4` shows 4. Headings of more than one sign — `### Steps`, `### 10` — are just headings.
- New records go on top, ordered by date: a record is written right above the nearest older one, set apart by blank lines and closed with a `---` rule. No year or month headings are made for you.
- The body of a record is the `template` of the track, without its properties. `{{date}}`, `{{time}}`, `{{date:format}}` and shifts like `{{date+1d:format}}` are filled in for the day of the record. Templater commands `<% %>` are **left out**: Templater acts on new files, and a record is written into an existing one, so they could not run. A line that holds nothing but commands — a `tp.file.move` that files entry notes, say — goes with them, so one template serves both modes.
- A click opens the journal at the record, and hovering a cell previews the record alone. The body of the record, the mark included, can be edited in the preview; its date heading cannot. `Cmd`/`Ctrl` + click switches the checkbox and leaves the rest of the journal as it is; a record without a checkbox gets one. Checking the box in the journal itself updates the table.
- Two records with the same heading are two entries of that day. Obsidian links a heading to the first of them, so their previews show the first; the list of the day opens each at its own line.

The mode only decides how new entries are made. The table always shows both kinds, so a track can switch modes and keep its history. The track note says it first with `entries`, then the code block, then the plugin settings.

### 4. Click a date

The caption above a column is a link when the daily note of that day is in your vault: a click opens it in this tab, `Cmd`/`Ctrl` + click in a new one, and hovering it gives the same preview a cell does.

A day without a daily note shows a plain number, so the caption itself tells you whether there is anything to open. Click the number and Process Tracker offers to create the note — it shows the path first and waits for **Create**. The new note opens in a new tab, and the number becomes a link. Days ahead of today can have one too.

> [!tip]
> The folder, the date format and the template come from the core **Daily notes** plugin, or from [Periodic Notes](https://github.com/liamcain/obsidian-periodic-notes) when you keep your daily notes there. With neither plugin enabled, captions are plain numbers.

> [!tip]
> In the template, `{{date}}` and `{{title}}` are the name of the new note, `{{date:dddd, D MMMM}}` formats the day of that note — not today — and `{{yesterday}}`, `{{tomorrow}}` give the days around it. Templater commands run as in any new note when "Trigger Templater on new file creation" is on.

> [!tip]
> Moved older daily notes somewhere else, an archive for instance? Name that folder with `daily_note_dir`, and the table looks for them there and creates new ones there. Inside that folder a note is found at the path your date format gives it or, failing that, by its file name.

## Settings

**Settings → Community plugins → Process Tracker**

| Setting      | What it does                                                 | Default           |
| ------------ | ------------------------------------------------------------ | ----------------- |
| Track tag    | Only notes with this tag become tracks. `#` is optional, and nested tags count: `process_tracker/health` matches `process_tracker`. | `process_tracker` |
| Entry folder | Where new entry notes go.                                    | vault root        |
| New entries  | Separate notes, or records in the journal of the track. The `entries` property of a track note and of a code block override it. | separate notes |

## Bugs and questions

Please open an [issue](https://github.com/skrpln/process-tracker/issues). It helps if you say:

- your Obsidian version and operating system;
- the plugin version;
- **the theme you use** — please name it even when the problem looks unrelated to looks;
- where it happened: Reading mode, Live Preview, a canvas, a hover preview;
- a small `process-tracker` block that shows the problem;
- console errors, if there were any.
- a screenshot of the table helps too.


## License

MIT. See [LICENSE](LICENSE).
