// Process Tracker — the pointer over the table: clicks and hover previews.

import { Keymap, MarkdownRenderChild } from "obsidian";
import type { App, HoverParent, HoverPopover } from "obsidian";
import { HOVER_SOURCE } from "../constants.ts";
import type { CellState } from "../model/types.ts";

/** The cell a click landed on, read back from the DOM. */
export interface CellTarget {
	cell: HTMLElement;
	trackPath: string;
	date: string;
	state: CellState;
	/** Path of the entry behind the cell; `null` while the day is empty. */
	entryPath: string | null;
}

/** The note under the pointer, and the element it hangs on. */
interface HoverTarget {
	element: HTMLElement;
	path: string;
}

/**
 * One listener for the whole table, for each kind of pointer event. A tracker of 30 tracks
 * over 90 days holds 2700 cells, and a listener on each of them would cost more than drawing
 * the table; what the pointer is over is read back from the `data-` attributes the renderer
 * wrote, so nothing has to be kept in memory between renders.
 *
 * Obsidian unloads the child together with the block, and the listeners go with it.
 */
export class CellPointerChild extends MarkdownRenderChild implements HoverParent {
	/** Where the core Page preview plugin keeps the popover it opened for this table. */
	hoverPopover: HoverPopover | null = null;

	constructor(
		containerEl: HTMLElement,
		/** Both tables of the tracker: the cells scroll, the track names do not. */
		private readonly frame: HTMLElement,
		private readonly app: App,
		private readonly sourcePath: string,
		private readonly onClick: (target: CellTarget, mod: boolean) => void,
	) {
		super(containerEl);
	}

	onload(): void {
		this.registerDomEvent(this.frame, "click", (event: MouseEvent) => {
			const target = readCell(event.target);
			if (target === null) return;

			// The box must not check itself: the mark belongs to the file. Cancelling the
			// click here also takes back the checked state the browser has already set.
			event.preventDefault();
			this.onClick(target, Keymap.isModifier(event, "Mod"));
		});

		this.registerDomEvent(this.frame, "mouseover", (event: MouseEvent) => {
			const target = readHover(event.target);
			if (target !== null) this.preview(target, event);
		});
	}

	/**
	 * The popover is not drawn by the plugin: the `hover-link` event hands the note to the
	 * core Page preview plugin, which shows it the way the reader has set it up — with or
	 * without the modifier key, in their own theme, editable where Obsidian allows it.
	 */
	private preview(target: HoverTarget, event: MouseEvent): void {
		this.app.workspace.trigger("hover-link", {
			event,
			source: HOVER_SOURCE,
			hoverParent: this,
			targetEl: target.element,
			linktext: target.path,
			sourcePath: this.sourcePath,
		});
	}
}

function readCell(node: EventTarget | null): CellTarget | null {
	const cell = closestOf(node, ".process-tracker__cell");
	if (cell === null) return null;

	const trackPath = cell.dataset.track ?? "";
	const date = cell.dataset.date ?? "";
	if (trackPath === "" || date === "") return null;

	return {
		cell,
		trackPath,
		date,
		state: (cell.dataset.state ?? "empty") as CellState,
		entryPath: cell.dataset.entry ?? null,
	};
}

/**
 * The note to preview: the entry of a cell that has one, the card behind a track name.
 * An empty cell shows nothing — there is no note to show ([[expectation]] §8).
 */
function readHover(node: EventTarget | null): HoverTarget | null {
	const cell = closestOf(node, ".process-tracker__cell");
	if (cell !== null) {
		const path = cell.dataset.entry ?? "";
		return path === "" ? null : { element: cell, path };
	}

	const link = closestOf(node, ".process-tracker__track a");
	if (link === null) return null;
	const path = link.dataset.href ?? "";
	return path === "" ? null : { element: link, path };
}

/**
 * `instanceof HTMLElement` is not used on purpose: a table in a popout window belongs to
 * another document, whose classes are not these classes.
 */
function closestOf(node: EventTarget | null, selector: string): HTMLElement | null {
	const element = node as HTMLElement | null;
	if (element === null || typeof element.closest !== "function") return null;
	return element.closest<HTMLElement>(selector);
}
