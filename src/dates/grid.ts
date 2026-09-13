// Process Tracker — date columns of the tracker table.
// Pure module: no Obsidian API, covered by test/grid.test.ts.

import type { DateColumn } from "../model/types.ts";

/**
 * Builds `days` columns starting from `today` and going back in time:
 * index 0 is today, the further right, the older the date.
 * Dates are local: arithmetic runs on calendar components, so DST shifts are safe.
 */
export function buildDateColumns(today: Date, days: number): DateColumn[] {
	const columns: DateColumn[] = [];
	for (let offset = 0; offset < Math.max(0, Math.trunc(days)); offset++) {
		const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() - offset);
		columns.push({
			iso: toIsoDate(date),
			day: date.getDate(),
			month: date.getMonth() + 1,
			year: date.getFullYear(),
			isToday: offset === 0,
		});
	}
	return columns;
}

/** Column caption: `dd/mm`, both parts always two digits. */
export function formatDayMonth(column: DateColumn): string {
	const day = String(column.day).padStart(2, "0");
	const month = String(column.month).padStart(2, "0");
	return `${day}/${month}`;
}

/**
 * Whether the table needs a year caption at all. Inside a single year the day and
 * month lines are unambiguous and the corner above the pinned column stays empty.
 */
export function spansMultipleYears(columns: DateColumn[]): boolean {
	return new Set(columns.map((column) => column.year)).size > 1;
}

/** Local calendar date as `YYYY-MM-DD` — the format used in evidence frontmatter. */
export function toIsoDate(date: Date): string {
	const year = String(date.getFullYear()).padStart(4, "0");
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const day = String(date.getDate()).padStart(2, "0");
	return `${year}-${month}-${day}`;
}
