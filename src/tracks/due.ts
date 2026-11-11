// Process Tracker — regular tracks: the period of a track, the days it was closed in, and
// whether its day has come ([[track-selection#Регулярность|Регулярность]]).
// Pure module: no Obsidian API, covered by test/due.test.ts.

import { toIsoDate } from "../dates/grid.ts";
import { nestedEntries } from "../entry/nested.ts";
import { cellState, findEntries } from "../entry/state.ts";
import type { EntryIndex } from "../entry/state.ts";

/**
 * How often a regular track is to be repeated ([[expectation]] §5). A table counts days, so a
 * period is made of whole months and whole days and of nothing smaller.
 */
export interface Period {
	/** Counted by the calendar; a year is twelve of them. */
	months: number;
	/** A week is seven of them. */
	days: number;
}

/**
 * The units of a length of time as Dataview hands it over — a Luxon duration, which answers
 * with a number for each of them.
 */
export interface DurationUnits {
	years?: number;
	months?: number;
	weeks?: number;
	days?: number;
	hours?: number;
	minutes?: number;
	seconds?: number;
	milliseconds?: number;
}

/**
 * A duration as a period, or `null` when it is none: it counts hours, minutes or seconds, it
 * does not come to whole months and whole days, or it does not run forward. `1.5 years` is
 * eighteen months and a period; `1.5 days` and `0 days` are not.
 */
export function toPeriod(units: DurationUnits): Period | null {
	const clock =
		(units.hours ?? 0) !== 0 ||
		(units.minutes ?? 0) !== 0 ||
		(units.seconds ?? 0) !== 0 ||
		(units.milliseconds ?? 0) !== 0;
	if (clock) return null;

	const months = (units.years ?? 0) * 12 + (units.months ?? 0);
	const days = (units.weeks ?? 0) * 7 + (units.days ?? 0);
	if (!Number.isInteger(months) || !Number.isInteger(days)) return null;
	if (months < 0 || days < 0 || months + days === 0) return null;
	return { months, days };
}

/**
 * The day a period after an ISO date, on the local calendar.
 *
 * The months go first and the days after, as Luxon — and so Dataview — adds a duration. A
 * month is a month of the calendar: the day keeps its number, and where the month it lands in
 * is too short, it is the last day of that month — 31 January and a month is 28 February.
 */
export function addPeriod(iso: string, period: Period): string {
	const [year, month, day] = iso.split("-").map(Number);
	const first = new Date(year, month - 1 + period.months, 1);
	const length = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
	return toIsoDate(
		new Date(first.getFullYear(), first.getMonth(), Math.min(day, length) + period.days),
	);
}

/** The closed days of the tracks of one table, as `show: due` asks about them. */
export interface ClosedDays {
	/** Whether the cell of this track shows this day closed. */
	closed(trackPath: string, date: string): boolean;
	/** The last day the cell of this track shows closed, wherever it lies; `null` — none. */
	last(trackPath: string): string | null;
}

/** The answer for a track with nothing below it; shared, so a lookup allocates nothing. */
const NO_TRACKS: readonly string[] = Object.freeze([]);

/**
 * The closed days of the tracks, read off the entries of the vault.
 *
 * A day is closed when its cell shows a checkmark ([[expectation]] §7, §12): every entry of the
 * track's own is closed in it, or an entry of a track below is. So the days are counted the way
 * the cells are, by the same `cellState`, and the row and the choice of rows never disagree.
 *
 * The last closed day is looked for over the whole vault, not over the window of a table, and
 * only among the days something was closed in — the track's own entries and those below it —
 * from the latest back. The index is walked once, whatever the number of tracks asked about.
 *
 * `until` stops the search at a day: a checklist asks what was due on its own day, and what
 * was closed after that day had not happened yet ([[checklist-view]]). A table gives none and
 * counts every closing, the ones ahead of today among them.
 */
export function closedDays(
	index: EntryIndex,
	descendants: ReadonlyMap<string, readonly string[]>,
	until: string | null = null,
): ClosedDays {
	const closings = new Map<string, Set<string>>();
	for (const day of index.values()) {
		for (const entry of day) {
			if (entry.closed === null) continue;
			// ISO dates sort as text.
			if (until !== null && entry.closed > until) continue;
			const known = closings.get(entry.trackPath);
			if (known === undefined) closings.set(entry.trackPath, new Set([entry.closed]));
			else known.add(entry.closed);
		}
	}

	const closed = (trackPath: string, date: string): boolean => {
		const own = findEntries(index, trackPath, date);
		const below = descendants.get(trackPath) ?? NO_TRACKS;
		return cellState(own, date, nestedEntries(index, below, date)) === "done";
	};

	const last = (trackPath: string): string | null => {
		const days = new Set<string>();
		for (const track of [trackPath, ...(descendants.get(trackPath) ?? NO_TRACKS)]) {
			for (const date of closings.get(track) ?? []) days.add(date);
		}
		// ISO dates sort as text. A day with a closing can still be a draft — one open entry
		// keeps it so — and is passed over for the one before it.
		const latestFirst = Array.from(days).sort().reverse();
		return latestFirst.find((date) => closed(trackPath, date)) ?? null;
	};

	return { closed, last };
}

/**
 * Whether a regular track belongs in a block of `show: due` on this day ([[expectation]] §4) —
 * the day a table is drawn on, or the day of a checklist:
 *
 * - it is closed today — it stays till the day is over, so a track just checked does not
 *   vanish from under the pointer;
 * - it was never closed;
 * - its period has run out: the last closed day and the period come to today or earlier. The
 *   day the period runs out counts — closed on a Monday with a week to go, the track is back
 *   on the next Monday.
 *
 * A track closed ahead of time, on a day yet to come, counts its period from that day.
 */
export function isDue(trackPath: string, period: Period, days: ClosedDays, today: string): boolean {
	if (days.closed(trackPath, today)) return true;

	const last = days.last(trackPath);
	return last === null || addPeriod(last, period) <= today;
}
