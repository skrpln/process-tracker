// Process Tracker — what a click on a cell asks for.
// Pure module: no Obsidian API, covered by test/actions.test.ts.

import type { CellState, ClickAction } from "../model/types.ts";

export type CellAction =
	| { kind: "create"; done: boolean }
	| { kind: "open" }
	| { kind: "toggle"; done: boolean }
	| { kind: "toggleDay"; done: boolean }
	| { kind: "nothing" };

/**
 * Which of the two actions a click asks for ([[entry#Жесты|entry]]). The settings give one of
 * them to the plain click — apart for a table and for a checklist — and the click with the
 * modifier has the other: two actions, two gestures, nothing left over.
 */
export function clickAction(plain: ClickAction, mod: boolean): ClickAction {
	if (!mod) return plain;
	return plain === "open" ? "status" : "open";
}

/**
 * The interaction table of [[expectation]] §8, one for a cell of a table and for a box of a
 * checklist.
 *
 * `open` works with the note: it starts one where the day is empty, and opens the one that is
 * already there. `status` works with the mark itself: it sets it and it takes it back —
 * without a warning, the note stays either way.
 *
 * A day with several entries has no single note to work with, so `open` does nothing: which
 * of them to open is not the plugin's to decide, and the popup carries a link to each
 * ([[entry]]). `status` works there as it does everywhere — it just reaches the whole day at
 * once, and the day follows its own mark: one open entry makes it a draft, so `status` closes
 * them all.
 */
export function cellAction(state: CellState, count: number, action: ClickAction): CellAction {
	const status = action === "status";
	if (count === 0) return { kind: "create", done: status };
	if (!status) return count === 1 ? { kind: "open" } : { kind: "nothing" };
	return { kind: count === 1 ? "toggle" : "toggleDay", done: state === "draft" };
}
