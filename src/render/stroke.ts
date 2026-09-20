// Process Tracker — the thread under a streak of closed days.
// Pure module: no DOM, covered by test/stroke.test.ts.

import { shiftIsoDate } from "../dates/grid.ts";
import type { SortDirection } from "../model/types.ts";

/**
 * How many closed days in a row are worth a thread ([[expectation]] §9). Three is the whole
 * rule: a streak the reader can see as one is what the thread is for, and a pair is not one.
 */
export const MIN_STREAK = 3;

/**
 * Where the thread runs inside one cell, in the order the table shows its columns:
 * `start` — from the checkmark to the right edge, `mid` — edge to edge, `end` — from the
 * left edge to the checkmark. A cell the thread does not reach is marked `null`.
 */
export type StrokeMark = "start" | "mid" | "end";

/**
 * How far a streak runs past the window, on either side — the part of the picture the table
 * cannot see but has to draw ([[rendering#Ниточка|Ниточка]]).
 */
export interface StrokeEdges {
	/** Closed days before the first column, counted no further than the threshold. */
	before: number;
	/** Closed days after the last column. */
	after: number;
}

export interface StrokeWindow {
	/** Dates of the columns, in the order the table shows them. */
	days: readonly string[];
	/** Which way that order runs: `asc` — into the future, `desc` — into the past. */
	order: SortDirection;
	/** Is this day closed? Asked about days outside the window too. */
	closed: (date: string) => boolean;
}

/**
 * How far the streak runs past each edge of the table ([[expectation]] §9).
 *
 * A streak is counted over the vault, not over the columns in sight. The reader who scrolls
 * into the middle of a long streak sees one day of it, and that day still carries a thread
 * running off both edges: the picture belongs to the days, not to the window on them. So the
 * days beyond each edge are asked about — no further than it takes to decide, which is
 * `MIN_STREAK` days on either side, because nothing past that changes the drawing.
 *
 * Asked at every edge, whether the day standing there is closed or not: an edge whose day is
 * open has no streak to continue, and the answer is simply not used.
 */
export function streakEdges(window: StrokeWindow): StrokeEdges {
	const first = window.days[0];
	const last = window.days[window.days.length - 1];
	if (first === undefined || last === undefined) return { before: 0, after: 0 };

	const step = window.order === "asc" ? 1 : -1;
	return {
		before: beyond(first, -step, window.closed),
		after: beyond(last, step, window.closed),
	};
}

/**
 * The thread of one row: a mark for every column, or `null` where no thread runs.
 *
 * Takes the days as the table shows them — closed or not — and what `streakEdges` found
 * outside the window. Nothing here knows about dates, so the same counting serves the render,
 * which reads the days from the vault, and the repaint, which reads them back from the cells
 * ([[rendering#Ниточка|Ниточка]]).
 *
 * A draft breaks a streak exactly as an empty day does: a day is closed only when every entry
 * of it is done, and that is decided before the days get here ([[entry]]).
 */
export function strokeMarks(closed: readonly boolean[], edges: StrokeEdges): (StrokeMark | null)[] {
	const marks: (StrokeMark | null)[] = closed.map(() => null);

	let first = 0;
	while (first < closed.length) {
		if (!closed[first]) {
			first++;
			continue;
		}

		let last = first;
		while (last + 1 < closed.length && closed[last + 1]) last++;

		// Only a run that touches an edge of the table can go on past it.
		const before = first === 0 ? edges.before : 0;
		const after = last === closed.length - 1 ? edges.after : 0;

		if (last - first + 1 + before + after >= MIN_STREAK) {
			for (let index = first; index <= last; index++) {
				// The line leaves a cell by its edge wherever the streak goes on, and ends
				// at the checkmark where the streak does. A run of one cell going nowhere
				// never gets here: three days cannot fit in it.
				const fromEdge = index > first || before > 0;
				const toEdge = index < last || after > 0;
				marks[index] = fromEdge ? (toEdge ? "mid" : "end") : "start";
			}
		}

		first = last + 1;
	}

	return marks;
}

/** Closed days running away from a date, counted no further than the threshold. */
function beyond(edge: string, step: number, closed: (date: string) => boolean): number {
	let count = 0;
	while (count < MIN_STREAK && closed(shiftIsoDate(edge, step * (count + 1)))) count++;
	return count;
}
