// Process Tracker — what a click on a cell asks for.
// Pure module: no Obsidian API, covered by test/actions.test.ts.

import type { CellState } from "../model/types.ts";

export type CellAction =
	| { kind: "create"; done: boolean }
	| { kind: "open" }
	| { kind: "toggle"; done: boolean }
	| { kind: "toggleDay"; done: boolean }
	| { kind: "nothing" };

/**
 * The interaction table of [[expectation]] §8.
 *
 * A plain click works with the note: it starts one where the day is empty, and opens the
 * one that is already there. The modifier works with the mark itself: it sets it and it
 * takes it back — without a warning, the note stays either way.
 *
 * A day with several entries has no single note to work with, so a plain click does
 * nothing: which of them to open is not the plugin's to decide, and the popup carries a
 * link to each ([[entry]]). The modifier works there as it does everywhere — it just
 * reaches the whole day at once, and the day follows its own mark: one open entry makes
 * it a draft, so the modifier closes them all.
 */
export function cellAction(state: CellState, count: number, mod: boolean): CellAction {
	if (count === 0) return { kind: "create", done: mod };
	if (!mod) return count === 1 ? { kind: "open" } : { kind: "nothing" };
	return { kind: count === 1 ? "toggle" : "toggleDay", done: state === "draft" };
}
