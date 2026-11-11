// Process Tracker — the pointer over the table or the checklist: clicks, previews, the list of
// a day and the tree of the entries below its track.

import { Keymap, MarkdownRenderChild } from "obsidian";
import type { App, HoverParent, HoverPopover } from "obsidian";
import { HOVER_SOURCE } from "../constants.ts";
import { nestedBranches } from "../entry/nested.ts";
import type { NestedBranch } from "../entry/nested.ts";
import { entryAt, entryEndsWithRule } from "../entry/source.ts";
import { entryPreview, standingIn } from "../entry/state.ts";
import type { CellState, Entry, PropertyNames } from "../model/types.ts";
import { trackName, trackParents } from "../tracks/links.ts";
import { buildTrackTree } from "../tracks/tree.ts";
import { DayPopup, growNestedTree } from "./popup.ts";
import type { DayHandlers } from "./popup.ts";
import {
	CELL_CLASS,
	CREATABLE_CLASS,
	MARK_CLASS,
	anchorOf,
	countedIdsOf,
	descendantsOfRow,
	entryIdsOf,
	nestedOf,
	ownStateOf,
	traceIdsOf,
} from "./table.ts";

/** How long the pointer rests on a day before its list opens, as a preview waits too. */
const OPEN_DELAY = 300;

/**
 * The links of the table: a track name, the caption of a day whose daily note is in the
 * vault ([[expectation]] §10), and a link of the corner title. Both are opened by Obsidian itself; what they need from here
 * is the preview on hover, which a link of a plugin does not get on its own. A checklist holds
 * no link but these: the names of its tracks and the links of the line above it.
 */
const LINK_SELECTOR =
	".process-tracker__track a, .process-tracker__date a, .process-tracker__period a, " +
	".process-tracker__checklist a";

/** The cell a click landed on, read back from the DOM. */
export interface CellTarget {
	cell: HTMLElement;
	trackPath: string;
	date: string;
	/**
	 * The state of the track's own entries. A cell checked by an entry below its track says
	 * more than they do, and a click works with the track's own ([[expectation]] §12).
	 */
	state: CellState;
	/**
	 * Addresses of the track's own entries the cell counts, in the order the list shows them.
	 * An entry closed on another day leaves only a trace here and is not among them: a click
	 * works with the day as the cell shows it ([[expectation]] §7).
	 */
	entryIds: string[];
}

/** Asked for by a click on the caption of a day with no daily note: its cell and the day. */
export type DailyNoteRequest = (caption: HTMLElement, date: string) => void;

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
	/** The popover the core Page preview plugin opened for this table, while it is shown. */
	private popover: HoverPopover | null = null;
	/**
	 * The cell whose own entry was last handed to the preview while entries stood below its
	 * track: the popover shown next is that entry's, and the tree of the day goes under it.
	 */
	private treeCell: HTMLElement | null = null;

	/** The list of a day, while one is open. */
	private day: DayPopup | null = null;
	/** Handle of the timer that opens a list; 0 when none is pending. */
	private opening = 0;
	/** The cell that timer belongs to, so a pointer moving inside it does not reset it. */
	private openingCell: HTMLElement | null = null;

	constructor(
		containerEl: HTMLElement,
		/**
		 * Both tables of the tracker: the cells scroll, the track names do not. For a
		 * checklist, the list with the line above it.
		 */
		private readonly frame: HTMLElement,
		private readonly app: App,
		private readonly sourcePath: string,
		private readonly onClick: (target: CellTarget, mod: boolean) => void,
		private readonly handlers: DayHandlers,
		private readonly onDailyNote: DailyNoteRequest,
		/** What the properties of an entry are called, for reading the entries of a cell. */
		private readonly names: PropertyNames,
	) {
		super(containerEl);
	}

	/** Where the core Page preview plugin keeps the popover it opened for this table. */
	get hoverPopover(): HoverPopover | null {
		return this.popover;
	}

	/**
	 * Obsidian writes a popover here at the moment it shows it. That is where the tree of a
	 * day is added to the preview of the track's own entry ([[nested-tracks]]): the popover is
	 * Obsidian's, the entry in it stays editable, and the tree stands under it.
	 *
	 * Which popover it is, Obsidian does not say; the pointer does. A preview asked for is
	 * dropped by Obsidian once the pointer leaves its cell, so the one that gets shown belongs
	 * to the cell the pointer was last over — and a hover on anything else forgets the cell.
	 */
	set hoverPopover(popover: HoverPopover | null) {
		this.popover = popover;
		const cell = this.treeCell;
		if (popover === null || cell === null) return;

		// One rule stands between the entry and the tree: the one the text of the entry ends
		// with, and where it ends with none, one the tree brings ([[nested-tracks]]).
		const [id] = entryIdsOf(cell);
		const own = id === undefined ? null : entryAt(this.app, id, cell.dataset.track ?? "", this.names);
		const rule = own === null || !entryEndsWithRule(this.app, own);

		growNestedTree(
			popover,
			this.branchesOf(cell),
			{
				app: this.app,
				sourcePath: this.sourcePath,
				date: cell.dataset.date ?? "",
				handlers: this.handlers,
				trackName: (trackPath) => trackName(this.app, trackPath, this.names),
			},
			rule,
		);
	}

	onload(): void {
		this.registerDomEvent(this.frame, "click", (event: MouseEvent) => {
			const caption = readNewDay(event.target);
			if (caption !== null) {
				this.closeDay();
				this.onDailyNote(caption.cell, caption.date);
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
	 * a daily note — shows the note behind it.
	 *
	 * A day that holds an entry closed on another day opens the list even when that entry is
	 * all it holds: only the list shows it as it stands in this day — an open box, which closes
	 * it here ([[expectation]] §7).
	 *
	 * A day with entries below its track shows them as a tree ([[expectation]] §12): under the
	 * preview of the track's own entry where it has one, under the list where it has several,
	 * and alone — in the popup of the plugin — where it has none.
	 */
	private onHover(event: MouseEvent): void {
		const cell = cellUnder(event.target);
		if (cell !== null) {
			this.onCellHover(cell, event);
			return;
		}

		this.treeCell = null;
		this.cancelOpen();
		this.liveDay()?.scheduleClose();

		const link = closestOf(event.target, LINK_SELECTOR);
		const path = link === null ? "" : (link.dataset.href ?? "");
		if (link !== null && path !== "") this.preview({ element: link, path }, event);
	}

	private onCellHover(cell: HTMLElement, event: MouseEvent): void {
		const ids = entryIdsOf(cell);
		const below = nestedOf(cell).length > 0;
		if (ids.length > 1 || traceIdsOf(cell).length > 0 || (below && ids.length === 0)) {
			this.treeCell = null;
			const open = this.liveDay();
			// The pointer came back to the cell the list belongs to: the list stays.
			if (open !== null && open.cell === cell) {
				open.hold();
				return;
			}
			// The list of another day is on its way out while this one is on its way in.
			open?.scheduleClose();
			this.scheduleOpen(cell, ids);
			return;
		}

		this.cancelOpen();
		this.liveDay()?.scheduleClose();
		const entry =
			ids.length === 1 ? entryAt(this.app, ids[0], cell.dataset.track ?? "", this.names) : null;
		// Set before the preview is asked for: the popover may be shown from within the call.
		this.treeCell = entry !== null && below ? cell : null;
		if (entry !== null) this.preview({ element: cell, path: entryPreview(entry) }, event);
	}

	/**
	 * The tree of a day: the entries below the track of a cell, under the children of the
	 * track ([[expectation]] §12).
	 *
	 * The entries are the ones the cell names, read again, so the boxes show what the vault
	 * says now. The tree is built from the tracks the row lists as its descendants, with the
	 * parents of each read at this moment: who stands below the row is the render's word, how
	 * they stand under one another is the vault's ([[nested-tracks]]).
	 */
	private branchesOf(cell: HTMLElement): NestedBranch[] {
		const entries: Entry[] = [];
		for (const ref of nestedOf(cell)) {
			const entry = entryAt(this.app, ref.id, ref.trackPath, this.names);
			if (entry !== null) entries.push(entry);
		}
		if (entries.length === 0) return [];

		const trackPath = cell.dataset.track ?? "";
		const tracks = [trackPath, ...descendantsOfRow(cell.parentElement)];
		const tree = buildTrackTree(
			tracks.map((path) => ({ path, parents: trackParents(this.app, path, this.names) })),
		);
		return nestedBranches(tree, trackPath, entries);
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
			// What the reader sees of a cell: Obsidian places the preview by it and watches the
			// pointer leave it.
			targetEl: anchorOf(target.element),
			linktext: target.path,
			sourcePath: this.sourcePath,
		});
	}

	private scheduleOpen(cell: HTMLElement, ids: string[]): void {
		// A pointer crossing the box and the wrapper inside one cell reports a hover each
		// time; the wait belongs to the cell, so it is not started over by them.
		if (this.openingCell === cell) return;

		this.cancelOpen();
		this.openingCell = cell;
		const view = cell.ownerDocument.defaultView;
		this.opening = view?.setTimeout(() => this.openDayList(cell, ids), OPEN_DELAY) ?? 0;
	}

	/**
	 * Opens the list of one day, and the tree of the entries below its track under it. The
	 * notes are read again here, so the boxes show what the vault says at the moment the list
	 * appears. A day that thinned out to one note it counts in the meantime gets no list: the
	 * cell itself is repainted by the subscription.
	 */
	private openDayList(cell: HTMLElement, ids: string[]): void {
		this.opening = 0;
		this.openingCell = null;

		const entries: Entry[] = [];
		for (const id of ids) {
			const entry = entryAt(this.app, id, cell.dataset.track ?? "", this.names);
			if (entry !== null) entries.push(entry);
		}
		const date = cell.dataset.date ?? "";
		const single = entries.length === 1 && standingIn(entries[0], date) !== "trace";
		const branches = this.branchesOf(cell);
		if (single || (entries.length === 0 && branches.length === 0)) return;

		this.closeDay();
		this.day = new DayPopup(
			this.app,
			this.sourcePath,
			cell,
			entries,
			branches,
			this.handlers,
			(trackPath) => trackName(this.app, trackPath, this.names),
		);
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

/**
 * The cell under the pointer. In a table everything a cell shows stands inside it. In a
 * checklist the box is the cell, and the mark shown in its place stands after it, so a mark
 * outside any cell answers for the box before it ([[checklist-view]]).
 */
function cellUnder(node: EventTarget | null): HTMLElement | null {
	const cell = closestOf(node, `.${CELL_CLASS}`);
	if (cell !== null) return cell;

	const box = closestOf(node, `.${MARK_CLASS}`)?.previousElementSibling ?? null;
	return box !== null && box.matches(`.${CELL_CLASS}`) ? (box as HTMLElement) : null;
}

function readCell(node: EventTarget | null): CellTarget | null {
	const cell = cellUnder(node);
	if (cell === null) return null;

	const trackPath = cell.dataset.track ?? "";
	const date = cell.dataset.date ?? "";
	if (trackPath === "" || date === "") return null;

	return {
		cell,
		trackPath,
		date,
		state: ownStateOf(cell),
		entryIds: countedIdsOf(cell),
	};
}

/**
 * The caption of a day a click can make a daily note for ([[daily-notes]]). A caption that is a
 * link is not one of them: Obsidian opens the daily note behind it by itself.
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
