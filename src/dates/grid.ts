// Process Tracker — date columns of the tracker table.
// Pure module: no Obsidian API, covered by test/grid.test.ts.

import type { DateColumn, SortDirection } from "../model/types.ts";

export interface GridSpec {
	/** First day of the interval. `null` — the interval ends today. */
	start: Date | null;
	/** The day the table is rendered on; marks the `isToday` column. */
	today: Date;
	days: number;
	/** `desc` — newest column first, `asc` — oldest column first. */
	order: SortDirection;
}

/**
 * Builds the date columns of the table.
 *
 * The interval is always `days` long. With an explicit `start` it runs forward from
 * that day, so a note keeps its own window; without it the interval ends today and
 * moves with the calendar. `order` decides which end of the interval comes first.
 *
 * Dates are local: arithmetic runs on calendar components, so DST shifts are safe.
 */
export function buildDateColumns(spec: GridSpec): DateColumn[] {
	const days = Math.max(0, Math.trunc(spec.days));
	if (days === 0) return [];

	const first = spec.start ?? addDays(spec.today, -(days - 1));
	const today = toIsoDate(spec.today);

	const columns: DateColumn[] = [];
	for (let offset = 0; offset < days; offset++) {
		const date = addDays(first, offset);
		const iso = toIsoDate(date);
		columns.push({
			iso,
			day: date.getDate(),
			month: date.getMonth() + 1,
			year: date.getFullYear(),
			isToday: iso === today,
		});
	}

	return spec.order === "asc" ? columns : columns.reverse();
}

/** Column caption: day of month, always two digits. */
export function formatDay(column: DateColumn): string {
	return String(column.day).padStart(2, "0");
}

const MONTH_NAMES = [
	"january",
	"february",
	"march",
	"april",
	"may",
	"june",
	"july",
	"august",
	"september",
	"october",
	"november",
	"december",
];

/**
 * Caption above the pinned column: month and year of a column, in English, lower case.
 * The day captions carry no month, so this caption is always shown and follows
 * the scroll — see `captionLabel`.
 */
export function formatMonthYear(column: DateColumn): string {
	return `${MONTH_NAMES[column.month - 1] ?? column.month} ${column.year}`;
}

/**
 * Splits a caption back into its two parts, which are set in different faces:
 * the month in the heading font of the theme, the year in the face of the day
 * captions. Anything without a space stays whole, as the month.
 */
export function splitMonthYear(label: string): { month: string; year: string } {
	const cut = label.lastIndexOf(" ");
	if (cut === -1) return { month: label, year: "" };
	return { month: label.slice(0, cut), year: label.slice(cut + 1) };
}

/** Local calendar date as `YYYY-MM-DD` — the format used in evidence frontmatter. */
export function toIsoDate(date: Date): string {
	const year = String(date.getFullYear()).padStart(4, "0");
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const day = String(date.getDate()).padStart(2, "0");
	return `${year}-${month}-${day}`;
}

function addDays(date: Date, days: number): Date {
	return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}
