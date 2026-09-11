// Process Tracker — grouping date columns into month captions.
// Pure module: no Obsidian API, no DOM.

import type { DateColumn } from "../model/types.ts";

/** One caption above a run of date columns that belong to the same month. */
export interface MonthGroup {
	/** English month name, with a year when the table spans more than one year. */
	label: string;
	year: number;
	/** Month number, 1-12. */
	month: number;
	/** Index of the first date column of the group. */
	start: number;
	/** How many date columns the caption spans. */
	span: number;
}

const MONTH_NAMES = [
	"January",
	"February",
	"March",
	"April",
	"May",
	"June",
	"July",
	"August",
	"September",
	"October",
	"November",
	"December",
];

/**
 * Splits consecutive columns into month runs. Columns are expected in table order
 * (newest first), and the groups keep that order.
 */
export function groupByMonth(columns: DateColumn[]): MonthGroup[] {
	const withYear = new Set(columns.map((column) => column.year)).size > 1;
	const groups: MonthGroup[] = [];

	columns.forEach((column, index) => {
		const last = groups[groups.length - 1];
		if (last !== undefined && last.year === column.year && last.month === column.month) {
			last.span++;
			return;
		}
		groups.push({
			label: monthLabel(column.month, column.year, withYear),
			year: column.year,
			month: column.month,
			start: index,
			span: 1,
		});
	});

	return groups;
}

export function monthLabel(month: number, year: number, withYear: boolean): string {
	const name = MONTH_NAMES[month - 1] ?? String(month);
	return withYear ? `${name} ${year}` : name;
}
