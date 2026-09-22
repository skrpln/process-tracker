// Process Tracker — parsing of the `process-tracker` code block source.
// Pure module: no Obsidian API, covered by test/parse.test.ts.

import { MAX_DAYS } from "../constants.ts";
import { normalizeFolder } from "../entry/compose.ts";
import type { SortDirection, SortSpec, TrackerOptions } from "../model/types.ts";
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

const KNOWN_KEYS = [
	"track",
	"start",
	"days",
	"dates",
	"sort",
	"track_color",
	"stroke",
	"daily_note_dir",
];

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
	};
	const seen = new Set<string>();

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
		if (seen.has(key)) warnings.push(`Parameter "${key}" is repeated, the last value wins.`);
		seen.add(key);

		if (value === "") {
			warnings.push(`Parameter "${key}" is empty, default is used.`);
			continue;
		}

		if (key === "track") options.track = value;
		if (key === "start") options.start = parseStartDate(value, warnings);
		if (key === "days") applyDays(options, value, warnings);
		if (key === "dates") options.dates = parseDirection(value, DEFAULT_DATES, warnings);
		if (key === "sort") options.sort = parseSort(value, warnings);
		if (key === "track_color") options.trackColor = parseColor(value, warnings);
		if (key === "stroke") options.stroke = parseStroke(value, warnings);
		if (key === "daily_note_dir") options.dailyNoteDir = parseFolder(value);
	}

	return { options, warnings };
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
 * `daily_note_dir: <folder>` — where the journals of this table are looked for and created,
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
