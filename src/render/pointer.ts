// Process Tracker — the pointer over the table: clicks, previews and the list of a day.

import { Keymap, MarkdownRenderChild } from "obsidian";
import type { App, HoverParent, HoverPopover } from "obsidian";
import { HOVER_SOURCE } from "../constants.ts";
import { entryAt } from "../entry/source.ts";
import type { CellState, Entry } from "../model/types.ts";
import { DayPopup } from "./popup.ts";
import type { DayHandlers } from "./popup.ts";
import { CREATABLE_CLASS, entryPathsOf } from "./table.ts";

/** How long the pointer rests on a day before its list opens, as a preview waits too. */
const OPEN_DELAY = 300;

/**
 * The links of the table: a track name, and the caption of a day whose journal is in the
 * vault ([[expectation]] §10). Both are opened by Obsidian itself; what they need from here
 * is the preview on hover, which a link of a plugin does not get on its own.
 */
const LINK_SELECTOR = ".process-tracker__track a, .process-tracker__date a";

/** The cell a click landed on, read back from the DOM. */
export interface CellTarget {
	cell: HTMLElement;
	trackPath: string;
	date: string;
	state: CellState;
	/** Paths of the notes behind the cell, in the order the list shows them. */
	entryPaths: string[];
}

/** Asked for by a click on the caption of a day with no journal: the caption cell and the day. */
export type JournalRequest = (caption: HTMLElement, date: string) => void;

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

	/** The list of a day, while one is open. */
	private day: DayPopup | null = null;
	/** Handle of the timer that opens a list; 0 when none is pending. */
	private opening = 0;
	/** The cell that timer belongs to, so a pointer moving inside it does not reset it. */
	private openingCell: HTMLElement | null = null;

	constructor(
		containerEl: HTMLElement,
		/** Both tables of the tracker: the cells scroll, the track names do not. */
		private readonly frame: HTMLElement,
		private readonly app: App,
		private readonly sourcePath: string,
		private readonly onClick: (target: CellTarget, mod: boolean) => void,
		private readonly handlers: DayHandlers,
		private readonly onJournal: JournalRequest,
	) {
		super(containerEl);
	}

	onload(): void {
		this.registerDomEvent(this.frame, "click", (event: MouseEvent) => {
			const caption = readNewDay(event.target);
			if (caption !== null) {
				this.closeDay();
				this.onJournal(caption.cell, caption.date);
				return;
			}

			const target = readCell(event.target);
			if (target === null) return;

			// The box must not check itself: the mark belongs to the file. Cancelling the
			// click here also takes back the checked state the browser has already set.
			event.preventDefault();
			// The day is about to change; a list drawn from the old one would lie.
			this.closeDay();
			this.onClick(target, Keymap.isModifier(event, "Mod"));
		});

		this.registerDomEvent(this.frame, "mouseover", (event: MouseEvent) => this.onHover(event));
		this.registerDomEvent(this.frame, "mouseleave", () => {
			this.cancelOpen();
			this.liveDay()?.scheduleClose();
		});
	}

	onunload(): void {
		this.cancelOpen();
		this.closeDay();
	}

	/**
	 * What the pointer found ([[expectation]] §8): a day of one entry hands its note to the
	 * core Page preview plugin, a day of several opens the list of the plugin, an empty day
	 * shows nothing, and a link of the table — a track name, or a day caption that leads to
	 * a journal — shows the note behind it.
	 */
	private onHover(event: MouseEvent): void {
		const cell = closestOf(event.target, ".process-tracker__cell");
		if (cell !== null) {
			this.onCellHover(cell, event);
			return;
		}

		this.cancelOpen();
		this.liveDay()?.scheduleClose();

		const link = closestOf(event.target, LINK_SELECTOR);
		const path = link === null ? "" : (link.dataset.href ?? "");
		if (link !== null && path !== "") this.preview({ element: link, path }, event);
	}

	private onCellHover(cell: HTMLElement, event: MouseEvent): void {
		const paths = entryPathsOf(cell);
		if (paths.length > 1) {
			const open = this.liveDay();
			// The pointer came back to the cell the list belongs to: the list stays.
			if (open !== null && open.cell === cell) {
				open.hold();
				return;
			}
			// The list of another day is on its way out while this one is on its way in.
			open?.scheduleClose();
			this.scheduleOpen(cell, paths);
			return;
		}

		this.cancelOpen();
		this.liveDay()?.scheduleClose();
		if (paths.length === 1) this.preview({ element: cell, path: paths[0] }, event);
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

	private scheduleOpen(cell: HTMLElement, paths: string[]): void {
		// A pointer crossing the box and the wrapper inside one cell reports a hover each
		// time; the wait belongs to the cell, so it is not started over by them.
		if (this.openingCell === cell) return;

		this.cancelOpen();
		this.openingCell = cell;
		const view = cell.ownerDocument.defaultView;
		this.opening = view?.setTimeout(() => this.openDayList(cell, paths), OPEN_DELAY) ?? 0;
	}

	/**
	 * Opens the list of one day. The notes are read again here, so the boxes show what the
	 * vault says at the moment the list appears. A day that thinned out to one note in the
	 * meantime gets no list: the cell itself is repainted by the subscription.
	 */
	private openDayList(cell: HTMLElement, paths: string[]): void {
		this.opening = 0;
		this.openingCell = null;

		const entries: Entry[] = [];
		for (const path of paths) {
			const entry = entryAt(this.app, path);
			if (entry !== null) entries.push(entry);
		}
		if (entries.length < 2) return;

		this.closeDay();
		this.day = new DayPopup(this.app, this.sourcePath, cell, entries, this.handlers);
	}

	private cancelOpen(): void {
		this.openingCell = null;
		if (this.opening === 0) return;
		this.frame.ownerDocument.defaultView?.clearTimeout(this.opening);
		this.opening = 0;
	}

	private closeDay(): void {
		this.liveDay()?.close();
		this.day = null;
	}

	/** The list on screen, if the one the child holds has not closed itself already. */
	private liveDay(): DayPopup | null {
		return this.day !== null && this.day.isOpen() ? this.day : null;
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
		entryPaths: entryPathsOf(cell),
	};
}

/**
 * The caption of a day a click can make a journal for ([[daily-notes]]). A caption that is a
 * link is not one of them: Obsidian opens the journal behind it by itself.
 */
function readNewDay(node: EventTarget | null): { cell: HTMLElement; date: string } | null {
	if (closestOf(node, `.process-tracker__day.${CREATABLE_CLASS}`) === null) return null;

	const cell = closestOf(node, ".process-tracker__date");
	const date = cell?.dataset.date ?? "";
	return cell === null || date === "" ? null : { cell, date };
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
