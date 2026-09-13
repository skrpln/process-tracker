// Process Tracker — parsing of the `process-tracker` code block source.
// Pure module: no Obsidian API, covered by test/parse.test.ts.

import { MAX_DAYS } from "../constants.ts";
import type { SortDirection, SortSpec, TrackerOptions } from "../model/types.ts";

export interface ParseResult {
	options: TrackerOptions;
	/** Human readable problems; rendered under the table, never thrown. */
	warnings: string[];
}

export const DEFAULT_SORT: SortSpec = { field: "name", direction: "asc" };

/** Newest column first: the day just lived through sits next to the track name. */
export const DEFAULT_DATES: SortDirection = "desc";

const KNOWN_KEYS = ["track", "start", "days", "dates", "sort"];

/** Parses `key: value` lines of a code block into tracker options. */
export function parseCodeBlock(source: string): ParseResult {
	const warnings: string[] = [];
	const options: TrackerOptions = {
		track: null,
		start: null,
		days: null,
		dates: DEFAULT_DATES,
		sort: { ...DEFAULT_SORT },
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
	}

	return { options, warnings };
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
