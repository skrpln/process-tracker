// Process Tracker — the list a day of several entries opens on hover ([[rendering]]).

import { setTooltip } from "obsidian";
import type { App, HoverParent, HoverPopover } from "obsidian";
import { HOVER_SOURCE } from "../constants.ts";
import type { Entry } from "../model/types.ts";

/** How long the list waits after the pointer left it, so a slow hand can still reach it. */
const CLOSE_DELAY = 200;

/** What the list asks the plugin to do; both answers come back from the vault. */
export interface DayHandlers {
	/** A box was pressed: switch that note. `true` when the note took the change. */
	toggle(path: string, done: boolean): Promise<boolean>;
	/** A link was clicked: open that note in a new tab, as a click on a cell does. */
	open(path: string): void;
}

/**
 * A day that holds several entries has one cell and several notes, so the cell hands the
 * day over to a list: a row per note, a live box and a link, no heading ([[expectation]] §8).
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
		private readonly app: App,
		private readonly sourcePath: string,
		/** The cell the list belongs to; the pointer coming back to it keeps the list open. */
		readonly cell: HTMLElement,
		entries: readonly Entry[],
		private readonly handlers: DayHandlers,
	) {
		this.element = cell.ownerDocument.body.createDiv({
			cls: "popover hover-popover process-tracker__day",
		});
		// A theme hangs the look of an internal link on `markdown-rendered`, so the rows
		// live under it: without that class the list showed bare underlined links while the
		// same links everywhere else in the vault were drawn the way the theme draws them.
		// `markdown-preview-view` is deliberately left out — that class means the box of a
		// note view, and themes fill it with page geometry ([[rendering]]).
		this.list = this.element.createDiv({
			cls: "markdown-rendered process-tracker__day-list",
		});
		this.inheritTypography();
		for (const entry of entries) this.renderRow(entry);
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

	/**
	 * Sets the list the way the note it belongs to is set.
	 *
	 * The typography of a note hangs on the view class the list does without, and a theme
	 * puts it there in a variable of its own: Terminal sizes notes by `--the-font-size`, which
	 * nothing outside that theme knows. So the two values are not guessed from variables but
	 * measured on the note the tracker is drawn in — the way every other theme-dependent
	 * number in the plugin is measured ([[rendering]]). A tracker drawn outside any rendered
	 * note keeps what the stylesheet gives it.
	 */
	private inheritTypography(): void {
		const note = this.cell.closest(".markdown-preview-view, .markdown-rendered");
		const style = note === null ? null : (this.window?.getComputedStyle(note) ?? null);
		if (style === null) return;

		this.list.style.fontFamily = style.fontFamily;
		this.list.style.fontSize = style.fontSize;
	}

	/** The window the list is drawn in — the main one, or a popout. */
	private get window(): Window | null {
		return this.cell.ownerDocument.defaultView;
	}

	private renderRow(entry: Entry): void {
		const row = this.list.createDiv({ cls: "process-tracker__day-row" });

		const box = row.createEl("input", { cls: "task-list-item-checkbox", type: "checkbox" });
		box.checked = entry.done;
		box.addEventListener("click", (event: MouseEvent) => {
			// The box must not check itself: the mark belongs to the file, and it is set
			// here only once the file has taken it.
			const wanted = box.checked;
			event.preventDefault();
			void this.handlers.toggle(entry.path, wanted).then((written) => {
				box.checked = written ? wanted : !wanted;
			});
		});

		const link = row.createEl("a", {
			cls: "internal-link",
			text: basename(entry.path),
			attr: { href: entry.path, "data-href": entry.path },
		});
		// Two notes of one day can share a basename; the path says which is which.
		setTooltip(link, entry.path);

		link.addEventListener("click", (event: MouseEvent) => {
			// Obsidian would open the link in the current tab; a cell opens its note in a
			// new one, and a row of the list is the same click ([[expectation]] §8).
			event.preventDefault();
			event.stopPropagation();
			this.handlers.open(entry.path);
			this.close();
		});
		link.addEventListener("mouseover", (event: MouseEvent) => {
			this.app.workspace.trigger("hover-link", {
				event,
				source: HOVER_SOURCE,
				hoverParent: this,
				targetEl: link,
				linktext: entry.path,
				sourcePath: this.sourcePath,
			});
		});
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

		const cell = this.cell.getBoundingClientRect();
		const list = this.element.getBoundingClientRect();
		const gap = 2;

		const below = cell.bottom + gap;
		const top = below + list.height > view.innerHeight ? cell.top - gap - list.height : below;
		const left = Math.min(cell.left, Math.max(gap, view.innerWidth - gap - list.width));

		this.element.style.top = `${Math.max(gap, top)}px`;
		this.element.style.left = `${left}px`;
	}
}

/** The name of a note as the reader knows it: no folders, no extension. */
function basename(path: string): string {
	const name = path.slice(path.lastIndexOf("/") + 1);
	return name.endsWith(".md") ? name.slice(0, -".md".length) : name;
}
