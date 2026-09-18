// Process Tracker — what a changed entry note does to the tables on screen.
// Pure module: no Obsidian API and no DOM, covered by test/refresh.test.ts.

import { cellState } from "./state.ts";
import type { CellState, Entry } from "../model/types.ts";

/** A cell of a rendered table, addressed the way the renderer writes it into the DOM. */
export interface CellRef {
	trackPath: string;
	date: string;
}

/** One cell and the look it must take. */
export interface CellPaint {
	cell: CellRef;
	state: CellState;
	/** Path of the note behind the cell; `null` leaves the cell empty. */
	entryPath: string | null;
}

/** The cells one changed note asks the table to repaint. */
export interface RefreshPlan {
	/** Cells that showed the note and no longer may. */
	clear: CellRef[];
	/** The cell the note claims now; `null` when it is no longer an entry. */
	paint: CellPaint | null;
}

/**
 * Plans the repaint after one note changed.
 *
 * `claimed` are the cells that show this note right now: the renderer writes its path into
 * `data-entry`, so the caller reads them straight out of the table instead of the plugin
 * keeping a copy of the vault in memory. A note that moved to another day — or stopped being
 * an entry at all — leaves those cells behind; a note that still claims its cell keeps it and
 * only changes its look.
 *
 * Emptying a cell is a statement about this note, not a verdict on the day: a second note may
 * claim the same day, and the table picks that up at its next render ([[entry]]).
 */
export function planRefresh(entry: Entry | null, claimed: CellRef[]): RefreshPlan {
	const paint: CellPaint | null =
		entry === null
			? null
			: {
					cell: { trackPath: entry.trackPath, date: entry.date },
					state: cellState(entry),
					entryPath: entry.path,
				};

	const kept = paint?.cell ?? null;
	return { clear: claimed.filter((cell) => kept === null || !sameCell(cell, kept)), paint };
}

export function sameCell(left: CellRef, right: CellRef): boolean {
	return left.trackPath === right.trackPath && left.date === right.date;
}
