// Process Tracker — parsing of the `process-tracker` code block source.
// Pure module: no Obsidian API, covered by test/parse.test.ts.

import { MAX_DAYS, MIN_WIDTH } from "../constants.ts";
import { normalizeFolder } from "../entry/compose.ts";
import { readEntriesMode } from "../entry/mode.ts";
import type {
	EntriesMode,
	NamesAlign,
	ShowMode,
	SortDirection,
	SortSpec,
	TrackerOptions,
	ViewMode,
} from "../model/types.ts";
import { readColor } from "../tracks/color.ts";

export interface ParseResult {
	options: TrackerOptions;
	/** Human readable problems; rendered under the table, never thrown. */
	warnings: string[];
}

export const DEFAULT_SORT: SortSpec = { field: "name", direction: "asc" };

/** Newest column first: the day just lived through sits next to the track name. */
export const DEFAULT_DATES: SortDirection = "desc";

/** No thread until the block asks for one: a tracker says enough with its checkmarks. */
export const DEFAULT_STROKE = false;

/** Every track is a row until the block asks for the ones that are due. */
export const DEFAULT_SHOW: ShowMode = "all";

/** A block is a table until it asks to be drawn another way. */
export const DEFAULT_VIEW: ViewMode = "table";

const ALIGNMENTS: readonly NamesAlign[] = ["left", "center", "right"];

const KNOWN_KEYS = [
	"track",
	"start",
	"days",
	"dates",
	"sort",
	"track_color",
	"stroke",
	"daily_note_dir",
	"entries",
	"title",
	"align",
	"width",
	"show",
	"view",
];

/**
 * The parameters only a table has a use for: its columns, its thread, its first column and the
 * daily notes behind its day captions. A checklist passes them over without a word
 * ([[checklist-view]]).
 */
const TABLE_ONLY_KEYS = ["days", "dates", "stroke", "align", "width", "daily_note_dir"];

/** Parses `key: value` lines of a code block into tracker options. */
export function parseCodeBlock(source: string): ParseResult {
	const warnings: string[] = [];
	const options: TrackerOptions = {
		track: null,
		start: null,
		days: null,
		dates: DEFAULT_DATES,
		sort: { ...DEFAULT_SORT },
		trackColor: null,
		stroke: DEFAULT_STROKE,
		dailyNoteDir: null,
		entries: null,
		title: null,
		align: null,
		width: null,
		show: DEFAULT_SHOW,
		view: DEFAULT_VIEW,
	};
	const seen = new Set<string>();
	/** Which of the warnings are about a parameter only a table reads, by their place. */
	const tableOnly = new Set<number>();

	for (const rawLine of source.split("\n")) {
		const line = rawLine.trim();
		if (line === "" || line.startsWith("#") || line.startsWith("//")) continue;

		const separator = line.indexOf(":");
		if (separator === -1) {
			warnings.push(`Not a "key: value" line: "${line}"`);
			continue;
		}

		const key = line.slice(0, separator).trim().toLowerCase();
		const value = line.slice(separator + 1).trim();

		if (!KNOWN_KEYS.includes(key)) {
			warnings.push(`Unknown parameter "${key}", ignored.`);
			continue;
		}
		const said = warnings.length;
		if (seen.has(key)) warnings.push(`Parameter "${key}" is repeated, the last value wins.`);
		seen.add(key);

		if (value === "") warnings.push(`Parameter "${key}" is empty, default is used.`);
		else applyParameter(options, key, value, warnings);

		if (TABLE_ONLY_KEYS.includes(key)) {
			for (let index = said; index < warnings.length; index++) tableOnly.add(index);
		}
	}

	// The view is known only once the whole block is read: it may be named on the last line.
	if (options.view !== "checklist") return { options, warnings };
	return { options, warnings: warnings.filter((_, index) => !tableOnly.has(index)) };
}

function applyParameter(
	options: TrackerOptions,
	key: string,
	value: string,
	warnings: string[],
): void {
	if (key === "track") options.track = value;
	if (key === "start") options.start = parseStartDate(value, warnings);
	if (key === "days") applyDays(options, value, warnings);
	if (key === "dates") options.dates = parseDirection(value, DEFAULT_DATES, warnings);
	if (key === "sort") options.sort = parseSort(value, warnings);
	if (key === "track_color") options.trackColor = parseColor(value, warnings);
	if (key === "stroke") options.stroke = parseStroke(value, warnings);
	if (key === "daily_note_dir") options.dailyNoteDir = parseFolder(value);
	if (key === "entries") options.entries = parseEntries(value, warnings);
	if (key === "title") options.title = parseTitle(value);
	if (key === "align") options.align = parseAlign(value, warnings);
	if (key === "width") options.width = parseWidth(value, warnings);
	if (key === "show") options.show = parseShow(value, warnings);
	if (key === "view") options.view = parseView(value, warnings);
}

/**
 * `track_color: <any CSS colour>` — the colour of the checkmarks of this table.
 *
 * Here an unreadable value is worth a warning, unlike the same value in a track card, where
 * it is ignored in silence: a code block is a thing the reader is writing right now, and the
 * warnings under the table are where this block answers for itself ([[expectation]] §4).
 */
export function parseColor(value: string, warnings: string[] = []): string | null {
	const color = readColor(value);
	if (color === null) warnings.push(`"track_color: ${value}" is not a colour, ignored.`);
	return color;
}

/**
 * `stroke: true | false` — whether a streak of closed days is threaded together.
 *
 * Only the two words the syntax names are read. A parameter of two states has no third
 * meaning to guess at, so anything else is worth saying out loud ([[expectation]] §4).
 */
export function parseStroke(value: string, warnings: string[] = []): boolean {
	const flag = value.toLowerCase();
	if (flag === "true" || flag === "false") return flag === "true";

	warnings.push(`Unknown value "stroke: ${value}", "${DEFAULT_STROKE}" is used.`);
	return DEFAULT_STROKE;
}

/**
 * `entries: notes | journal` — how the entries of this table are made, for the tracks whose
 * card says nothing ([[entry#Журнал трека|entry]]). An unknown value is said out loud, as an
 * unreadable colour is, and the settings decide instead.
 */
export function parseEntries(value: string, warnings: string[] = []): EntriesMode | null {
	const mode = readEntriesMode(value);
	if (mode === null) {
		warnings.push(`Unknown value "entries: ${value}", the mode of the settings is used.`);
	}
	return mode;
}

/**
 * `title: <text>` — the corner above the track names, or the line above a checklist. The text
 * is taken as written, quotes around it dropped, so `title: ""` leaves the corner empty: a line
 * with nothing after the colon is an empty parameter and keeps the default, like any other.
 */
export function parseTitle(value: string): string {
	return value.replace(/^(["'])(.*)\1$/, "$2");
}

/**
 * An alignment as it was written, or `null` for anything else. Case and the spaces around it
 * do not matter. The code block and the settings read the word the same way.
 */
export function readAlign(raw: unknown): NamesAlign | null {
	if (typeof raw !== "string") return null;
	const word = raw.trim().toLowerCase();
	return ALIGNMENTS.find((known) => known === word) ?? null;
}

/**
 * `align: left | center | right` — how the first column stands in this table. A block that
 * says nothing, or says a word that is no alignment, leaves it to the settings of the plugin
 * ([[expectation]] §10).
 */
export function parseAlign(value: string, warnings: string[] = []): NamesAlign | null {
	const align = readAlign(value);
	if (align === null) {
		warnings.push(`Unknown value "align: ${value}", the alignment of the settings is used.`);
	}
	return align;
}

/**
 * `width: <pixels>` — how wide the first column is. The plugin writes this line itself when
 * the column is dragged ([[rendering#Ширина первого столбца|rendering]]), and a reader may
 * write it by hand. Only a whole number is a width; one under the limit is raised to it, as
 * `days` over its limit is trimmed.
 */
export function parseWidth(value: string, warnings: string[] = []): number | null {
	if (!/^\d+$/.test(value)) {
		warnings.push(`"width: ${value}" is not a whole number of pixels, ignored.`);
		return null;
	}

	const width = Number(value);
	if (width < MIN_WIDTH) {
		warnings.push(`"width: ${value}" is under the limit of ${MIN_WIDTH}, raised.`);
		return MIN_WIDTH;
	}
	return width;
}

/**
 * `show: all | due` — which tracks become rows: every one, or only the regular tracks whose
 * day has come ([[track-selection#Регулярность|Регулярность]]). Two words and no third meaning
 * to guess at, as with `stroke`: anything else is said out loud, and every track is shown.
 */
export function parseShow(value: string, warnings: string[] = []): ShowMode {
	const word = value.toLowerCase();
	if (word === "all" || word === "due") return word;

	warnings.push(`Unknown value "show: ${value}", "${DEFAULT_SHOW}" is used.`);
	return DEFAULT_SHOW;
}

/**
 * `view: table | checklist` — how the block is drawn: a table of days, or a checklist of one
 * day ([[checklist-view]]). Anything else is said out loud, and the block stays a table.
 */
export function parseView(value: string, warnings: string[] = []): ViewMode {
	const word = value.toLowerCase();
	if (word === "table" || word === "checklist") return word;

	warnings.push(`Unknown value "view: ${value}", "${DEFAULT_VIEW}" is used.`);
	return DEFAULT_VIEW;
}

/**
 * `daily_note_dir: <folder>` — where the daily notes of this table are looked for and created,
 * instead of the folder of the daily notes settings ([[daily-notes]]). Quotes around the
 * value are dropped, and so are the slashes at its ends; `/` is the vault root, returned as an
 * empty string. Whether the folder is in the vault is asked at render, not here.
 */
export function parseFolder(value: string): string {
	return normalizeFolder(value.replace(/^(["'])(.*)\1$/, "$2"));
}

/** `dates: asc | desc` — the direction of the date columns. */
export function parseDirection(
	value: string,
	fallback: SortDirection,
	warnings: string[] = [],
): SortDirection {
	const direction = value.toLowerCase();
	if (direction === "asc" || direction === "desc") return direction;
	warnings.push(`Unknown value "dates: ${value}", "${fallback}" is used.`);
	return fallback;
}

/**
 * `start: YYYY-MM-DD` fixes the first day of the tracked interval; `start: today`
 * is the default and means "the interval ends today", so the window moves with the
 * calendar. Returns `null` for today and for anything unreadable.
 */
export function parseStartDate(value: string, warnings: string[] = []): Date | null {
	if (value.toLowerCase() === "today") return null;

	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
	if (match === null) {
		warnings.push(`"start: ${value}" is not a date in YYYY-MM-DD form, today is used.`);
		return null;
	}

	const [, year, month, day] = match.map(Number);
	const date = new Date(year, month - 1, day);
	// Rejects 2027-02-29 and friends: the Date constructor rolls them over silently.
	if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
		warnings.push(`"start: ${value}" is not a calendar date, today is used.`);
		return null;
	}

	return date;
}

function applyDays(options: TrackerOptions, value: string, warnings: string[]): void {
	const days = Number(value);
	if (!Number.isInteger(days) || days < 1) {
		warnings.push(`"days: ${value}" is not a positive integer, default is used.`);
		return;
	}
	if (days > MAX_DAYS) {
		warnings.push(`"days: ${value}" exceeds the limit of ${MAX_DAYS}, trimmed.`);
		options.days = MAX_DAYS;
		return;
	}
	options.days = days;
}

/** Parses `sort: <field> <asc|desc>`; direction defaults to `asc`. */
export function parseSort(value: string, warnings: string[] = []): SortSpec {
	const parts = value.split(/\s+/).filter((part) => part !== "");
	const field = parts[0] ?? DEFAULT_SORT.field;
	const rawDirection = (parts[1] ?? "asc").toLowerCase();

	let direction: SortDirection = "asc";
	if (rawDirection === "asc" || rawDirection === "desc") {
		direction = rawDirection;
	} else {
		warnings.push(`Unknown sort direction "${parts[1]}", "asc" is used.`);
	}
	if (parts.length > 2) warnings.push(`Extra words in "sort: ${value}" are ignored.`);

	return { field, direction };
}
