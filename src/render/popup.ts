// Process Tracker — what a day shows on hover beyond one note: the list of its entries
// ([[rendering]]) and the tree of the entries below its track ([[nested-tracks]]).

import { Keymap, setTooltip } from "obsidian";
import type { App, HoverParent, HoverPopover } from "obsidian";
import { HOVER_SOURCE } from "../constants.ts";
import type { NestedBranch } from "../entry/nested.ts";
import type { Entry } from "../model/types.ts";
import { entryPreview, standingIn } from "../entry/state.ts";
import { anchorOf } from "./table.ts";

/** How long the list waits after the pointer left it, so a slow hand can still reach it. */
const CLOSE_DELAY = 200;

/** How far a popup keeps from the edge of its window, in pixels. */
const WINDOW_GAP = 2;

/** Class of the tree of a day: the children of a track and the entries below them. */
export const NESTED_CLASS = "process-tracker__nested";

/** Class of a tree that stands in a popover of Obsidian, under the note it previews. */
const NESTED_HOSTED_CLASS = "is-hosted";

/**
 * Class of the note a popover of Obsidian previews, once a tree stands inside it: the note
 * then takes the height of its text and ends where the tree begins.
 */
const NESTED_NOTE_CLASS = "process-tracker__nested-note";

/**
 * Class of a popover of Obsidian whose tree could not be put inside the previewed note and
 * stands beside it: the popover then stacks the two in a column.
 */
const NESTED_HOST_CLASS = "process-tracker__nested-host";

/** What the list asks the plugin to do; both answers come back from the vault. */
export interface DayHandlers {
	/**
	 * A box was pressed: close or open that entry on the day of the list. `true` when the file
	 * took the change.
	 */
	toggle(entry: Entry, done: boolean, date: string): Promise<boolean>;
	/** A link was clicked: open that entry in a new tab, as a click on a cell does. */
	open(entry: Entry): void;
}

/** What the rows of a popup are drawn with, whichever popup they stand in. */
export interface DayContext {
	app: App;
	/** The note the tracker is drawn in: links are resolved and opened from it. */
	sourcePath: string;
	/** The day of the cell: a box shows how its entry stands in it, and closes it on it. */
	date: string;
	handlers: DayHandlers;
	/** Where the core Page preview plugin keeps the popover it opens for a link of the popup. */
	hoverParent: HoverParent;
	/** The name a track goes by now ([[nested-tracks]]). */
	trackName: (trackPath: string) => string;
	/** A link was followed: a popup of the plugin closes, as its day has been left. */
	onFollow: () => void;
}

/**
 * A day that holds several entries has one cell and several notes, so the cell hands the
 * day over to a list: a row per note, a live box and a link, no heading ([[expectation]] §8).
 * So does a day that holds an entry closed on another day: the list shows it with an open box,
 * the work of this day, and the box closes it here ([[expectation]] §7).
 *
 * A day with entries below its track shows them as a tree ([[expectation]] §12). The tree
 * stands under the rows, after a rule — or alone, where the track has no entry of its own;
 * a day whose one entry Obsidian previews gets the tree added to that preview instead
 * (`growNestedTree`).
 *
 * The container is the plugin's own — the core Page preview plugin shows one note, and this
 * shows a day — but the classes are Obsidian's, so a theme dresses the list exactly as it
 * dresses the previews standing next to it. The rows are previewed by the core plugin all
 * the same: each link raises `hover-link`, the same event the cells raise.
 *
 * The list lives in the body of its own document, not in the cell: the cells scroll inside
 * a frame that clips them, and a list drawn inside that frame would be cut off by it.
 */
export class DayPopup implements HoverParent {
	/** Where the core Page preview plugin keeps the popover it opened for a row. */
	hoverPopover: HoverPopover | null = null;

	private readonly element: HTMLElement;
	/** Where the rows live: the part a theme dresses as the content of a note. */
	private readonly list: HTMLElement;
	/** Handle of the timer that closes the list; 0 when none is pending. */
	private closing = 0;

	constructor(
		app: App,
		sourcePath: string,
		/** The cell the list belongs to; the pointer coming back to it keeps the list open. */
		readonly cell: HTMLElement,
		entries: readonly Entry[],
		/** The entries below the track of the cell, as the tree of the day; none — no tree. */
		branches: readonly NestedBranch[],
		handlers: DayHandlers,
		trackName: (trackPath: string) => string,
	) {
		const context: DayContext = {
			app,
			sourcePath,
			date: cell.dataset.date ?? "",
			handlers,
			hoverParent: this,
			trackName,
			onFollow: () => this.close(),
		};
		this.element = cell.ownerDocument.body.createDiv({
			cls: "popover hover-popover process-tracker__day",
		});
		// The wrappers a preview has inside a popover. Obsidian gives the popover a surface,
		// but a theme is free to leave it the colour of the page and dress the embed inside
		// instead — Brutalist does, and the list came out as text floating over the note.
		// Built like a preview, it is dressed like one ([[rendering]]).
		const content = this.element
			.createDiv({ cls: "markdown-embed" })
			.createDiv({ cls: "markdown-embed-content" });
		// A theme hangs the look of an internal link on `markdown-rendered`, so the rows
		// live under it: without that class the list showed bare underlined links while the
		// same links everywhere else in the vault were drawn the way the theme draws them.
		// `markdown-preview-view` is deliberately left out — that class means the box of a
		// note view, and themes fill it with page geometry ([[rendering]]).
		this.list = content.createDiv({
			cls: "markdown-rendered process-tracker__day-list",
		});
		inheritTypography(this.list, cell);
		for (const entry of entries) renderRow(this.list, entry, context);
		if (branches.length > 0) renderNestedTree(this.list, branches, context, entries.length > 0);
		this.place();

		this.element.addEventListener("mouseenter", () => this.hold());
		this.element.addEventListener("mouseleave", () => this.scheduleClose());
	}

	/** Keeps the list open: the pointer is over it, or back over its cell. */
	hold(): void {
		if (this.closing === 0) return;
		this.window?.clearTimeout(this.closing);
		this.closing = 0;
	}

	/** The pointer left: the list closes, unless the pointer is back before the delay runs out. */
	scheduleClose(): void {
		this.hold();
		this.closing = this.window?.setTimeout(() => this.close(), CLOSE_DELAY) ?? 0;
	}

	/** Whether the list is still on screen: it closes itself once the pointer leaves it. */
	isOpen(): boolean {
		return this.element.isConnected;
	}

	close(): void {
		this.hold();
		this.hoverPopover = null;
		this.element.remove();
	}

	/** The window the list is drawn in — the main one, or a popout. */
	private get window(): Window | null {
		return this.cell.ownerDocument.defaultView;
	}

	/**
	 * Under the cell, left edges aligned — and above it, or pulled back from the right edge,
	 * where the window has no room. The position is fixed because the cell scrolls: a list
	 * that followed the cell would have to be redrawn on every wheel tick, and the pointer
	 * leaving the cell closes it anyway.
	 */
	private place(): void {
		const view = this.window;
		if (view === null) return;

		// A box of a checklist hidden behind its mark has no place; the mark stands for it.
		const cell = anchorOf(this.cell).getBoundingClientRect();
		const list = this.element.getBoundingClientRect();
		const gap = WINDOW_GAP;

		const below = cell.bottom + gap;
		const top = below + list.height > view.innerHeight ? cell.top - gap - list.height : below;
		const left = Math.min(cell.left, Math.max(gap, view.innerWidth - gap - list.width));

		this.element.style.top = `${Math.max(gap, top)}px`;
		this.element.style.left = `${left}px`;
	}
}

/**
 * Adds the tree of a day to the popover Obsidian has just shown for the track's own entry
 * ([[expectation]] §12): the entry on top, still editable, one rule, and the tree after it.
 *
 * The popover is Obsidian's and stays so — the plugin is handed it as the `hoverPopover` of
 * its hover parent at the moment it is shown, and `hoverEl` is public API. The tree goes
 * inside the note the popover previews, as the last thing in it, not beside it: a theme is
 * free to leave the popover the colour of the page and give the surface to the note inside —
 * Brutalist and Ultra Lobster do — and a tree beside the note stood on another colour. Inside
 * it, the popup is one surface, scrolls as one and is placed by Obsidian as one
 * ([[nested-tracks#Дерево в попапе Obsidian|nested-tracks]]).
 *
 * The note is marked with a class, and the stylesheet does the rest by it: Obsidian stretches
 * the text of a previewed note to the full height of the popover, which pushed the tree down
 * by its own height, and ends the note with a padding and the margin of its last rule, which
 * stood between the rule and the tree. With the class the note is as tall as its text and the
 * tree starts right under the rule.
 *
 * `rule` says whether the tree brings a rule of its own: it does only where the text of the
 * entry does not end with one, so there is always one rule between the two and never two.
 *
 * A click on the tree is no click on the note. Obsidian turns the note into an editor on a
 * click anywhere inside it, unless the click was cancelled — so every click on the tree is.
 *
 * The tree is set by the stylesheet the way Obsidian sets the note above it — the text font,
 * at the size of a popover — and not by a measurement of the note the tracker is in: here its
 * neighbour is the preview.
 */
export function growNestedTree(
	popover: HoverPopover,
	branches: readonly NestedBranch[],
	context: Omit<DayContext, "hoverParent" | "onFollow">,
	rule: boolean,
): void {
	const host = popover.hoverEl;
	if (branches.length === 0 || host.querySelector(`.${NESTED_CLASS}`) !== null) return;

	// Obsidian builds the note into the popover before it shows it; a popover found without
	// one keeps the tree as a part of its own.
	const note = host.querySelector<HTMLElement>(":scope > .markdown-embed");
	if (note === null) host.addClass(NESTED_HOST_CLASS);
	else note.addClass(NESTED_NOTE_CLASS);

	const tree = renderNestedTree(
		note ?? host,
		branches,
		// The links of the tree are previewed from a parent of their own: the popover they
		// stand in is the preview of another note and is not theirs to replace.
		{ ...context, hoverParent: { hoverPopover: null }, onFollow: () => undefined },
		rule,
	);
	tree.addClass(NESTED_HOSTED_CLASS);
	tree.addEventListener("click", (event: MouseEvent) => event.preventDefault());
}

/**
 * Draws the tree of a day ([[expectation]] §12): a line for each child of the track and, under
 * it, the entries of the day that stand below the child, as tasks — a live box and a link each.
 *
 * The line of a child is one of two things. A child with a record of its own for the day is a
 * task itself: the box is the box of that record, the name leads to the record. A child with
 * none is a plain item whose name leads to its card. So a name is never said twice, and a
 * track whose children have a record each and nothing else is a flat list of boxes
 * ([[nested-tracks#Дерево дня|Дерево дня]]).
 *
 * The markup is the one Obsidian renders a list of a note into, class for class, so a theme
 * dresses the tree as it dresses a checklist: bullets, indents, the look of a done task.
 *
 * With `rule` the tree starts with a horizontal rule — a real `hr` under `markdown-rendered`,
 * so it is the rule a theme draws at the end of a note, not a line of the plugin's own.
 */
function renderNestedTree(
	parent: HTMLElement,
	branches: readonly NestedBranch[],
	context: DayContext,
	rule: boolean,
): HTMLElement {
	const tree = parent.createDiv({ cls: `${NESTED_CLASS} markdown-rendered` });
	if (rule) tree.createEl("hr");

	const tasks = branches.some((branch) => branch.own !== null);
	const list = tree.createEl("ul", { cls: tasks ? TASK_LIST_CLASSES : "has-list-bullet" });
	for (const branch of branches) {
		const item =
			branch.own === null
				? renderTrackItem(list, branch.trackPath, context)
				: renderEntryItem(list, branch.own, context);
		if (branch.entries.length === 0) continue;

		const below = item.createEl("ul", { cls: TASK_LIST_CLASSES });
		for (const entry of branch.entries) renderEntryItem(below, entry, context);
	}
	return tree;
}

/** The classes Obsidian gives a list that holds tasks. */
export const TASK_LIST_CLASSES = "contains-task-list has-list-bullet";

/** A child with no record of its own for the day: a plain item, its name a link to its card. */
function renderTrackItem(list: HTMLElement, trackPath: string, context: DayContext): HTMLElement {
	const item = list.createEl("li");
	item.createSpan({ cls: "list-bullet" });
	renderTrackLink(item, trackPath, context);
	return item;
}

/** One entry as a task of the tree: its box, and a link to it under the name it goes by. */
function renderEntryItem(list: HTMLElement, entry: Entry, context: DayContext): HTMLElement {
	const item = list.createEl("li", { cls: "task-list-item" });
	// The item says what its box says, the way a task of a note does: a theme strikes a done
	// task through by `data-task`.
	const follow = (checked: boolean): void => {
		item.setAttr("data-task", checked ? "x" : " ");
		item.toggleClass("is-checked", checked);
	};
	follow(renderBox(item, entry, context, follow).checked);
	// A note is named by itself; a record has no name of its own and goes by its track.
	const name = entry.record === null ? basename(entry.path) : context.trackName(entry.trackPath);
	renderEntryLink(item, entry, name, context);
	return item;
}

/** One row of the list of a day: the box of an entry and the link to it. */
function renderRow(list: HTMLElement, entry: Entry, context: DayContext): void {
	const row = list.createDiv({ cls: "process-tracker__day-row" });
	renderBox(row, entry, context);

	// A record is named the way Obsidian names a link to a heading: `Cleaning > 2026-09-28`.
	const name = basename(entry.path);
	renderEntryLink(row, entry, entry.record === null ? name : `${name} > ${entry.record.heading}`, context);
}

/**
 * The box of one entry in a popup. `onSet` hears what the box shows whenever a press settles:
 * the mark the file took, or the old one where it refused.
 */
function renderBox(
	parent: HTMLElement,
	entry: Entry,
	context: DayContext,
	onSet?: (checked: boolean) => void,
): HTMLInputElement {
	const box = parent.createEl("input", { cls: "task-list-item-checkbox", type: "checkbox" });
	// Checked only where the entry was closed on this very day: one closed on another day
	// stands here as the work of this day, open.
	box.checked = standingIn(entry, context.date) === "closed";
	box.addEventListener("click", (event: MouseEvent) => {
		// The box must not check itself: the mark belongs to the file, and it is set
		// here only once the file has taken it.
		const wanted = box.checked;
		event.preventDefault();
		void context.handlers.toggle(entry, wanted, context.date).then((written) => {
			box.checked = written ? wanted : !wanted;
			onSet?.(box.checked);
		});
	});
	return box;
}

/** The link to one entry in a popup: opens it in a new tab, previews it on hover. */
function renderEntryLink(parent: HTMLElement, entry: Entry, text: string, context: DayContext): void {
	const link = parent.createEl("a", {
		cls: "internal-link",
		text,
		attr: { href: entry.path, "data-href": entry.path },
	});
	// Two notes of one day can share a basename; the path says which is which.
	setTooltip(link, entry.path);

	link.addEventListener("click", (event: MouseEvent) => {
		// Obsidian would open the link in the current tab; a cell opens its note in a
		// new one, and a row of the list is the same click ([[expectation]] §8).
		event.preventDefault();
		event.stopPropagation();
		context.handlers.open(entry);
		context.onFollow();
	});
	previewOnHover(link, entryPreview(entry), context);
}

/**
 * The name of a child in the tree: a link to its card, as the name of a track in the first
 * column is. Nothing of Obsidian's listens for a link in a popup, so the click is answered
 * here the way Obsidian answers it in a note: in this tab, or in a new one with the modifier.
 */
function renderTrackLink(parent: HTMLElement, trackPath: string, context: DayContext): void {
	const link = parent.createEl("a", {
		cls: "internal-link",
		text: context.trackName(trackPath),
		attr: { href: trackPath, "data-href": trackPath },
	});
	link.addEventListener("click", (event: MouseEvent) => {
		event.preventDefault();
		event.stopPropagation();
		void context.app.workspace.openLinkText(trackPath, context.sourcePath, Keymap.isModEvent(event));
		context.onFollow();
	});
	previewOnHover(link, trackPath, context);
}

/** Hands a link of a popup to the core Page preview plugin, as the cells hand theirs. */
function previewOnHover(link: HTMLElement, linktext: string, context: DayContext): void {
	link.addEventListener("mouseover", (event: MouseEvent) => {
		context.app.workspace.trigger("hover-link", {
			event,
			source: HOVER_SOURCE,
			hoverParent: context.hoverParent,
			targetEl: link,
			linktext,
			sourcePath: context.sourcePath,
		});
	});
}

/**
 * Sets an element the way the note its cell belongs to is set.
 *
 * The typography of a note hangs on the view class the list does without, and a theme
 * puts it there in a variable of its own: Terminal sizes notes by `--the-font-size`, which
 * nothing outside that theme knows. So the two values are not guessed from variables but
 * measured on the note the tracker is drawn in — the way every other theme-dependent
 * number in the plugin is measured ([[rendering]]). A tracker drawn outside any rendered
 * note keeps what the stylesheet gives it.
 */
function inheritTypography(target: HTMLElement, cell: HTMLElement): void {
	const note = cell.closest(".markdown-preview-view, .markdown-rendered");
	const view = cell.ownerDocument.defaultView;
	const style = note === null || view === null ? null : view.getComputedStyle(note);
	if (style === null) return;

	target.style.fontFamily = style.fontFamily;
	target.style.fontSize = style.fontSize;
}

/** The name of a note as the reader knows it: no folders, no extension. */
function basename(path: string): string {
	const name = path.slice(path.lastIndexOf("/") + 1);
	return name.endsWith(".md") ? name.slice(0, -".md".length) : name;
}
