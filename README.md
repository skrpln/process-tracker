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
track: "[[Home]]"               # Optional: the parent track, see "Tracks inside tracks".
recurrence: 6 months            # Optional: how often to repeat it, see "Regular tracks".
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
title: Morning · {{month}} {{year}}
align: left
width: 180
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
| `title`       | text, `{{month}}`, `{{year}}`, `[[links]]`                   | `{{month}} {{year}}` | The caption in the corner above the track names. |
| `align`       | `left`, `center`, `right`                                    | the setting | Aligns the track names and the title. |
| `width`       | a whole number of pixels, from `40`                          | `12em`      | Width of the column of track names. |
| `show`        | `all`, `due`                                                 | `all`       | Every track, or only the regular tracks that are due. |

>[!tip] 
> - the `track` option needs the [Dataview](https://github.com/blacksmithgu/obsidian-dataview) community plugin, and takes what a Dataview query takes: `FROM #health or #sport`, `FROM "Health"`, `WHERE priority > 2`, or a source and a condition together;
> - the filter only narrows tracks: a note without the track tag never becomes a row, whatever the filter says;
> - without Dataview the table still works and shows every track in the vault;
> - `track_color` colours this table only, and only the tracks whose own card names no colour: the card always wins. A value that is not a colour is ignored, and a note about it appears under the table;
> - `stroke` draws a thin line through three or more checked days in a row, in the colour of the checkmarks. A day with an entry that is not done breaks the streak, exactly as an empty day does. The streak is counted over your vault and not over the days in sight: scroll into the middle of a long one and the line still runs off both edges of the table;
> - `width` is written for you: drag the line between the track names and the dates, and the width is kept in the code block when you let go. Double-click the line to take it out again. A width is kept when the table stands in a note, or in a whole note shown in an embed, a hover preview or a canvas card; elsewhere — a part of a note embedded by its heading, a text card of a canvas — the column holds until the table is drawn again, and `width` can be written by hand;
> - `title` replaces the month and the year in the corner. `{{month}}` and `{{year}}` are those of the days in sight and follow the scroll; `[[links]]` work and show their preview, any other markdown stays as written. A long title wraps, and its last line stands on the line of the day numbers. `title: ""` leaves the corner empty.

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
track: "[[Cleaning]]"      # Link to the track note, or a list of links.
created: 2026-11-05        # The day the entry was made.
done: true
closed: 2026-11-10 14:30   # The day it was closed. The plugin writes it when you check the box.
mark: 🔥                   # Optional. Shown instead of the checkmark.
---

anything worth keeping about that day: what you did, links, checklists
```

A note is an entry when it has `track` and `done`. With a list in `track` it is an entry of every track on the list.

An entry stands in the table on two days:

- on the day of `created` — as an open box, unless it was closed that same day;
- on the day of `closed` — as a checked box.

So a task made on 5 November and closed on the 10th checks the 10th. The 5th stays empty, and its popup lists the task with an open box — the trace of the work started that day. Checking that box closes the task on the 5th instead. Times are ignored: `2026-11-10 14:30` is 10 November.

A click on an empty cell makes a note with `created` set to the day of the cell, whatever the template says; `Cmd`/`Ctrl` + click also checks it and writes `closed`. Checking a box writes `done: true` and `closed` with the day of the cell and the current time, so a day checked afterwards keeps its own day. Unchecking writes `done: false` and removes `closed`. Other properties of the note, a task status for instance, are left alone.

> [!note]
> Entry notes made by version 0.2 and earlier have a `date` instead. They stay where they were: `date` stands in for a missing `created` and for a missing `closed`, and checking such a note changes `done` only.

`mark` lets a day say how it went: a checked day shows the first sign of the value — a digit, a letter or an emoji — in place of its checkmark. `mark: 4` shows `4`, `mark: 🔥` shows 🔥; one sign fits in a cell, so `mark: 10` shows `1`. An outlined box keeps its box, and so does a day with several entries.

### Entries as journal records

Rather not have a note for every day? With `entries: journal` a click writes a record into the journal of the track instead: a section at the end of the track note, under `# Journal`, or the note its `journal` property links to. That note is created with `# Journal` and the first record if it does not exist yet.

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

### Tracks inside tracks

A track can stand under another one: an area of life, the tracks in it, the tasks of each. Give the track note a `track` property that links to its parent — or a list of links, if it has several:

```yaml
---
tags: process_tracker
track: "[[Home]]"
---
```

Whatever is done below a track shows in its row:

- A day is checked when an entry of a track below it — a child, a child of a child, and so on — was closed on that day. Open entries below do not change the cell.
- Hover the cell to see what was done: the entry of the track itself, a rule, and right under it a tree of that day. Each child of the track is a line; under it stand its entry notes and the entries of the tracks below it. A child that has a journal record of its own for the day is a checkbox itself — the box of that record — so a track whose children have a record each shows a plain checklist. A box in the tree checks and unchecks its entry, a name opens the note. A child with nothing on that day is left out.
- Click and `Cmd`/`Ctrl` + click work with the entries of the track itself, as in any other row; the entries below are changed from the tree.
- A day closed by a single entry shows the `mark` of that entry, whichever track it belongs to.
- `stroke` runs through the days closed from below as well.

The tracks below a row do not have to be rows of the same table: a table with one row for `Home` still counts every task under it. The tree lists them in the order of the table's `sort`.

A track note that also has `done` is a long task: a track with a row and a journal of its own and, at the same time, an entry of its parent — open from the day it was `created`, checked on the day it was `closed`.

> [!note]
> The tree under the entry of the track itself is added to the preview of the core **Page preview** plugin, so it needs that plugin on. A day with no entry of its own shows the tree in a popup of Process Tracker.

### Regular tracks

Some things come round on a schedule: change the bed linen every week, defrost the fridge twice a year. Give such a track a `recurrence` — how often it is to be repeated:

```yaml
---
tags: process_tracker
recurrence: 6 months
---
```

Then add `show: due` to a code block, and the table keeps only the tracks that are due:

- the last checked day plus `recurrence` is today or earlier — checked on a Monday with `1 week`, the track is back next Monday;
- the track was never checked;
- the track was checked today — it stays for the rest of the day, so a row does not vanish as you check it.

````markdown
```process-tracker
track: FROM "Home"
show: due
```
````

`recurrence` is a number and a unit, or several such pairs in a row:

| Period | Written as                            |
| ------ | ------------------------------------- |
| days   | `3 days`, `1 day`, `3d`               |
| weeks  | `2 weeks`, `2 wk`, `2w`               |
| months | `6 months`, `6 mo`                    |
| years  | `1 year`, `2 yrs`                     |
| a mix  | `1 month 2 weeks`, `1 month, 2 weeks` |

> [!tip]
> - The period is read by [Dataview](https://github.com/blacksmithgu/obsidian-dataview), so `show: due` needs it; without Dataview every track is shown.
> - Months go by the calendar: 31 January and `1 month` is 28 February.
> - A bare number is not a period. `1m` is a minute and `1y` is not understood; hours and minutes mean nothing in a table of days.
> - A track with no `recurrence`, or with one that cannot be read, is not shown.
> - The last checked day is looked for in the whole vault, not only in the days of the table, and a day checked by a track below counts — see "Tracks inside tracks".
> - "Today" is the real today, wherever `start` and `days` put the window.

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
| First column alignment | How the track names and the corner title stand. The `align` option of a code block overrides it. | center |
| Entry properties, Track properties | The names of the properties the plugin reads and writes, one field each: `track`, `done`, `created`, `closed`, `date`, `mark` of an entry note, `track_name`, `track_color`, `template`, `entries`, `journal`, `recurrence` of a track note. The link of a track to its parent goes by the same name as `track`. Rename one to match the properties your notes already use; an empty field means the default name. | the names above |

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
