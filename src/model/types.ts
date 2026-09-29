// Process Tracker — domain types shared across modules.

export type SortDirection = "asc" | "desc";

/**
 * How the new entries of a track are made ([[expectation]] §4): as notes of their own, or as
 * records in the journal of the track. Only the making: a table reads both kinds always.
 */
export type EntriesMode = "notes" | "journal";

/** Sort field: `name`, `ctime`, `mtime` or any frontmatter property of a track card. */
export interface SortSpec {
	field: string;
	direction: SortDirection;
}

/** Result of parsing a `process-tracker` code block. */
export interface TrackerOptions {
	/** Dataview filter expression, applied since Phase 3. `null` — not set. */
	track: string | null;
	/** First day of the interval. `null` — the interval ends today. */
	start: Date | null;
	/** Direction of the date columns: `desc` — newest first, `asc` — oldest first. */
	dates: SortDirection;
	/** Table length in days. `null` — resolve at render time. */
	days: number | null;
	sort: SortSpec;
	/**
	 * Colour of the checkmarks of this table, for the tracks whose card names none.
	 * `null` — the colour of the theme.
	 */
	trackColor: string | null;
	/** Whether a streak of closed days is threaded together ([[expectation]] §9). */
	stroke: boolean;
	/**
	 * Folder the daily notes of this table are looked for and created in; `""` — the vault root.
	 * `null` — the folder of the daily notes settings ([[daily-notes]]).
	 */
	dailyNoteDir: string | null;
	/** How the entries of this table are made, for the tracks whose card says nothing. */
	entries: EntriesMode | null;
}

/** A track card: a vault note tagged with the plugin tag. */
export interface TrackCard {
	path: string;
	/** File name without extension. */
	basename: string;
	/** Displayed name: `track_name` property, or the file name. */
	name: string;
	/** Colour of the checkmarks of this track: the `track_color` property. `null` — none. */
	color: string | null;
	/** How the new entries of this track are made: the `entries` property. `null` — not said. */
	entries: EntriesMode | null;
	/** Tags of the note, normalized: lower case, without the leading `#`. */
	tags: string[];
	frontmatter: Record<string, unknown>;
	/** File creation / modification time, ms since epoch. */
	ctime: number;
	mtime: number;
}

/**
 * An entry: one day of one track — a note of its own, or a record in the journal of the track.
 */
export interface Entry {
	/** The note; for a record, the journal it stands in. */
	path: string;
	/** Path of the track card the `track` property points at. */
	trackPath: string;
	/** Local calendar date as `YYYY-MM-DD`. */
	date: string;
	/** The `done` property; `false` for a draft. */
	done: boolean;
	/** The first visible sign of the `mark` property; `null` — no mark ([[expectation]] §6). */
	mark: string | null;
	/** Where the record stands in its journal; `null` — the entry is a note of its own. */
	record: EntryRecord | null;
}

/** A record of a track journal: a `## YYYY-MM-DD` heading and the text under it. */
export interface EntryRecord {
	/**
	 * Which of the records of this date in this journal it is, from 0. Unlike the line, it
	 * does not move when a record of another day is written above it, so it addresses the
	 * record between renders ([[entry#Журнал трека|entry]]).
	 */
	nth: number;
	/** The text of the heading, `2026-09-28 🔥`: what a link to the record is made of. */
	heading: string;
	/** The line of the heading, from 0, as the metadata cache last saw it. */
	line: number;
}

/** State of one cell, derived from the entry behind it ([[expectation]] §7). */
export type CellState = "empty" | "draft" | "done";

/** One date column of the tracker table. */
export interface DateColumn {
	/** Local calendar date as `YYYY-MM-DD`. */
	iso: string;
	/** Day of month, 1-31. */
	day: number;
	/** Month number, 1-12. */
	month: number;
	year: number;
	isToday: boolean;
}
