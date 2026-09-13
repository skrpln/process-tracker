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
	/** Date of the first column. `null` — today, resolved at render time. */
	start: Date | null;
	/** Table length in days. `null` — resolve at render time. */
	days: number | null;
	sort: SortSpec;
}

/** A track card: a vault note tagged with the plugin tag. */
export interface TrackCard {
	path: string;
	/** File name without extension. */
	basename: string;
	/** Displayed name: `track_name` property, or the file name. */
	name: string;
	/** Tags of the note, normalized: lower case, without the leading `#`. */
	tags: string[];
	frontmatter: Record<string, unknown>;
	/** File creation / modification time, ms since epoch. */
	ctime: number;
	mtime: number;
}

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
