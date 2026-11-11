// Process Tracker — what a changed entry note does to the tables on screen.
// Pure module: no Obsidian API and no DOM, covered by test/refresh.test.ts.

import type { Entry } from "../model/types.ts";
import { byId, daysOf } from "./state.ts";

/** A cell of a rendered table, addressed the way the renderer writes it into the DOM. */
export interface CellRef {
	trackPath: string;
	date: string;
}

/**
 * A row of a rendered table that has tracks below its own, as the renderer writes it into the
 * DOM: its track, and its descendants ([[nested-tracks]]).
 */
export interface RowRef {
	trackPath: string;
	descendants: readonly string[];
}

/**
 * The days changed entries ask the table to recount: the days whose cells show them right
 * now, and the days they claim after the change — the day each was made and the day it was
 * closed, in the row of every track it belongs to. No day is named twice.
 *
 * The cells that show an entry are read straight out of the table — the renderer writes the
 * addresses of a day into the cell — so the plugin keeps no copy of the vault in memory. A note
 * that moved from one day to another touches both, a note just closed appears in the day of
 * its closing, and a note that stopped being an entry touches only the days it is leaving.
 *
 * An entry closes the cells of the tracks above its own too ([[expectation]] §12), so its days
 * are named in every one of `rows` that has its track below: the rows of the table that have
 * descendants, each with the list the renderer gave it.
 */
export function touchedDays(
	shown: readonly CellRef[],
	entries: readonly Entry[],
	rows: readonly RowRef[] = [],
): CellRef[] {
	const days: CellRef[] = [];
	const add = (day: CellRef): void => {
		if (!days.some((known) => sameCell(known, day))) days.push(day);
	};

	for (const day of shown) add(day);
	for (const entry of entries) {
		for (const date of daysOf(entry)) {
			add({ trackPath: entry.trackPath, date });
			for (const row of rows) {
				if (row.descendants.includes(entry.trackPath)) add({ trackPath: row.trackPath, date });
			}
		}
	}
	return days;
}

/**
 * The entries of one day after some of them changed.
 *
 * `known` are the other entries the cell was showing, re-read from the vault; `changed` are the
 * changed entries as they are now — a note that links to several tracks is an entry of each,
 * and a note that stopped being an entry is none. Either is taken only while it still belongs
 * to this day: an entry whose days or track moved leaves the day it was in.
 *
 * The day is counted, not guessed. Until Phase 7 an emptied cell was a statement about one
 * note and a duplicate had to wait for the next render to show itself; now the cell answers
 * for the whole day, and the state of affairs is what it shows ([[entry]]).
 */
export function recountDay(
	day: CellRef,
	known: readonly Entry[],
	changed: readonly Entry[],
): Entry[] {
	const entries = known.filter((entry) => belongsTo(entry, day));
	for (const entry of changed) {
		if (belongsTo(entry, day)) entries.push(entry);
	}
	return entries.sort(byId);
}

/** Whether an entry stands in this day of this track: made in it, or closed in it. */
export function belongsTo(entry: Entry, day: CellRef): boolean {
	return entry.trackPath === day.trackPath && daysOf(entry).includes(day.date);
}

export function sameCell(left: CellRef, right: CellRef): boolean {
	return left.trackPath === right.trackPath && left.date === right.date;
}
