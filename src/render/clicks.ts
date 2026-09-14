// Process Tracker — clicks on the cells of the table.

import { Keymap, MarkdownRenderChild } from "obsidian";
import type { CellState } from "../model/types.ts";

/** The cell a click landed on, read back from the DOM. */
export interface CellTarget {
	cell: HTMLElement;
	trackPath: string;
	date: string;
	state: CellState;
	/** Path of the evidence behind the cell; `null` while the day is empty. */
	evidencePath: string | null;
}

/**
 * One listener for the whole table. A tracker of 30 tracks over 90 days holds 2700 cells,
 * and a listener on each of them would cost more than drawing the table; the cell a click
 * landed on is read back from the `data-` attributes the renderer wrote, so nothing has to
 * be kept in memory between renders.
 *
 * Obsidian unloads the child together with the block, and the listener goes with it.
 */
export class CellClickChild extends MarkdownRenderChild {
	constructor(
		containerEl: HTMLElement,
		private readonly scroll: HTMLElement,
		private readonly onCell: (target: CellTarget, mod: boolean) => void,
	) {
		super(containerEl);
	}

	onload(): void {
		this.registerDomEvent(this.scroll, "click", (event: MouseEvent) => {
			const target = readCell(event.target);
			if (target === null) return;

			// The box must not check itself: the mark belongs to the file. Cancelling the
			// click here also takes back the checked state the browser has already set.
			event.preventDefault();
			this.onCell(target, Keymap.isModifier(event, "Mod"));
		});
	}
}

/**
 * `instanceof HTMLElement` is not used on purpose: a table in a popout window belongs to
 * another document, whose classes are not these classes.
 */
function readCell(node: EventTarget | null): CellTarget | null {
	const element = node as HTMLElement | null;
	if (element === null || typeof element.closest !== "function") return null;

	const cell = element.closest<HTMLElement>(".process-tracker__cell");
	if (cell === null) return null;

	const trackPath = cell.dataset.track ?? "";
	const date = cell.dataset.date ?? "";
	if (trackPath === "" || date === "") return null;

	return {
		cell,
		trackPath,
		date,
		state: (cell.dataset.state ?? "empty") as CellState,
		evidencePath: cell.dataset.evidence ?? null,
	};
}
