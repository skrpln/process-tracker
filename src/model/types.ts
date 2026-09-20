// Process Tracker — domain types shared across modules.

export type SortDirection = "asc" | "desc";

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
	/** Tags of the note, normalized: lower case, without the leading `#`. */
	tags: string[];
	frontmatter: Record<string, unknown>;
	/** File creation / modification time, ms since epoch. */
	ctime: number;
	mtime: number;
}

/** An entry note: one day of one track. */
export interface Entry {
	path: string;
	/** Path of the track card the `track` property points at. */
	trackPath: string;
	/** Local calendar date as `YYYY-MM-DD`. */
	date: string;
	/** The `done` property; `false` for a draft. */
	done: boolean;
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
