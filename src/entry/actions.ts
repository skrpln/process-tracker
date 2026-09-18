// Process Tracker — what a click on a cell asks for.
// Pure module: no Obsidian API, covered by test/actions.test.ts.

import type { CellState } from "../model/types.ts";

export type CellAction =
	| { kind: "create"; done: boolean }
	| { kind: "open" }
	| { kind: "toggle"; done: boolean };

/**
 * The interaction table of [[expectation]] §8.
 *
 * A plain click works with the note: it starts one where the day is empty, and opens the
 * one that is already there. The modifier works with the mark itself: it sets it and it
 * takes it back — without a warning, the note stays either way.
 */
export function cellAction(state: CellState, mod: boolean): CellAction {
	if (state === "empty") return { kind: "create", done: mod };
	if (!mod) return { kind: "open" };
	return { kind: "toggle", done: state === "draft" };
}
