// Process Tracker — what a changed entry note does to the tables on screen.
// Pure module: no Obsidian API and no DOM, covered by test/refresh.test.ts.

import type { Entry } from "../model/types.ts";
import { byPath } from "./state.ts";

/** A cell of a rendered table, addressed the way the renderer writes it into the DOM. */
export interface CellRef {
	trackPath: string;
	date: string;
}

/**
 * The days one changed note asks the table to recount: the days whose cells show it right
 * now, and the day it claims after the change.
 *
 * The cells that show it are read straight out of the table — the renderer writes the paths
 * of a day into `data-entry` — so the plugin keeps no copy of the vault in memory. A note
 * that moved from one day to another touches both, and a note that stopped being an entry
 * touches only the days it is leaving.
 */
export function touchedDays(claimed: CellRef[], entry: Entry | null): CellRef[] {
	const days = [...claimed];
	if (entry === null) return days;

	const own = { trackPath: entry.trackPath, date: entry.date };
	if (!days.some((day) => sameCell(day, own))) days.push(own);
	return days;
}

/**
 * The entries of one day after the note changed.
 *
 * `known` are the other entries the cell was showing, re-read from the vault; `changed` is
 * the note that changed, as it is now. Either is taken only while it still belongs to this
 * day: a note whose date or track moved leaves the day it was in.
 *
 * The day is counted, not guessed. Until Phase 7 an emptied cell was a statement about one
 * note and a duplicate had to wait for the next render to show itself; now the cell answers
 * for the whole day, and the state of affairs is what it shows ([[entry]]).
 */
export function recountDay(day: CellRef, known: Entry[], changed: Entry | null): Entry[] {
	const entries = known.filter((entry) => belongsTo(entry, day));
	if (changed !== null && belongsTo(changed, day)) entries.push(changed);
	return entries.sort(byPath);
}

/** Whether an entry is one of this day of this track. */
export function belongsTo(entry: Entry, day: CellRef): boolean {
	return entry.trackPath === day.trackPath && entry.date === day.date;
}

export function sameCell(left: CellRef, right: CellRef): boolean {
	return left.trackPath === right.trackPath && left.date === right.date;
}
