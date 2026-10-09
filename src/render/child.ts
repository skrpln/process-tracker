// Process Tracker — lifecycle of one rendered code block.

import { MarkdownRenderChild } from "obsidian";
import type { DateColumn } from "../model/types.ts";
import { followsScroll } from "../codeblock/title.ts";
import { formatMonthYear } from "../dates/grid.ts";
import {
	BOX_FILL_PROPERTY,
	BOX_SHIFT_PROPERTY,
	FILLED_CLASS,
	MARK_ATTRIBUTE,
	MARK_CLASS,
	TRACK_COLOR_ATTRIBUTE,
	TRACK_COLOR_PROPERTY,
	paintRow,
	renderPeriodCaption,
	rowColorRequest,
	unpaintRow,
} from "./table.ts";
import type { ThemeProbe } from "./table.ts";
import { captionLabel, columnWidth, screenScale, visibleColumnRange } from "./visible.ts";

/** The tables the reader has on screen; the plugin repaints their cells through it. */
export interface LiveTables {
	add(scroll: HTMLElement): unknown;
	delete(scroll: HTMLElement): unknown;
}

/** What a background computes to when the colour on it resolved to nothing. */
const TRANSPARENT = "rgba(0, 0, 0, 0)";

/**
 * Runs the two things the table cannot do in CSS alone: keeps a date column as wide
 * as a row is tall, and keeps the month caption above the pinned column in step with
 * horizontal scrolling. Obsidian unloads the child together with the block, so the
 * listeners and the pending animation frame never outlive the table.
 *
 * The same lifetime answers the other question — which tables are on screen right now —
 * so the child announces its table for as long as the block lives.
 */
export class TrackerRenderChild extends MarkdownRenderChild {
	/** Handle of the animation frame an update is waiting for; 0 when none is. */
	private pending = 0;
	private label: string;
	private columnWidth: number | null = null;
	/** Set once the table has a layout to measure; cleared whenever its size changes. */
	private measured = false;
	/**
	 * Screen pixels per CSS pixel, asked before every update: a canvas zooms without resizing
	 * anything, so no observer reports it. Every client rect is divided by it ([[rendering]]).
	 */
	private zoom = 1;

	constructor(
		containerEl: HTMLElement,
		/** Both tables: the names on the left, the scrolling columns on the right. */
		private readonly frame: HTMLElement,
		private readonly scroll: HTMLElement,
		private readonly captionCell: HTMLElement,
		/** The hidden elements the theme answers through ([[rendering]]). */
		private readonly probe: ThemeProbe,
		private readonly columns: DateColumn[],
		/** The title of the corner, placeholders unfilled. */
		private readonly title: string,
		private readonly tables: LiveTables,
	) {
		super(containerEl);
		this.label = columns[0] === undefined ? "" : formatMonthYear(columns[0]);
	}

	onload(): void {
		this.tables.add(this.scroll);
		this.register(() => this.tables.delete(this.scroll));

		this.registerDomEvent(this.scroll, "scroll", () => this.schedule(), { passive: true });

		// A resize is the moment the theme may have changed under the table: fonts,
		// padding, the size of a checkbox. Everything measured is measured again.
		const observer = new this.win.ResizeObserver(() => {
			this.measured = false;
			this.schedule();
		});
		observer.observe(this.frame);
		this.register(() => observer.disconnect());

		this.schedule();
	}

	onunload(): void {
		if (this.pending !== 0) this.win.cancelAnimationFrame(this.pending);
		this.pending = 0;
	}

	/**
	 * Paints the rows whose colour paints something, and only those ([[rendering]]).
	 *
	 * `CSS.supports` answers for the form of a value, and `var(--color-gren)` has the form of
	 * a colour whatever it points at: a misspelt variable passes that check and then resolves
	 * to nothing. A rule fed such a value paints nothing at all, so a done day would come out
	 * with a transparent box — finished, and looking emptier than an empty one. Whether a
	 * value paints is not a question about its text: only the document the table stands in
	 * answers it, which is why the row arrives carrying a request and leaves carrying a
	 * colour — or nothing, as an unreadable value deserves ([[expectation]] §5).
	 *
	 * The colours of a table are few, so each distinct one is tried once and the answer is
	 * reused. Asked again — after a theme was changed under the table — the same requests are
	 * answered afresh, so a colour the new theme understands comes back.
	 */
	private checkColors(): void {
		const answers = new Map<string, boolean>();
		const rows = this.frame.querySelectorAll<HTMLElement>(`[${TRACK_COLOR_ATTRIBUTE}]`);
		for (const row of Array.from(rows)) {
			const color = rowColorRequest(row);
			const paints = answers.get(color) ?? this.paints(color);
			answers.set(color, paints);
			if (paints) paintRow(row, color);
			else unpaintRow(row);
		}
	}

	/**
	 * Does this colour paint? The probe wears it and the browser is read back.
	 *
	 * The probe is not drawn — it is a hidden element, and only the computed value of its
	 * background is ever taken from it, which costs no layout. A value that resolves to
	 * nothing leaves the background transparent, and that is the answer. Where there is
	 * nobody to ask — a table rendered outside the document, which computes to nothing at
	 * all — the value stands as the reader wrote it.
	 */
	private paints(color: string): boolean {
		this.probe.color.style.setProperty(TRACK_COLOR_PROPERTY, color);
		const painted = this.win.getComputedStyle(this.probe.color).backgroundColor;
		return painted === "" || painted !== TRANSPARENT;
	}

	/**
	 * Gives the draft a second way to be seen, in a theme that leaves it none ([[rendering]]).
	 *
	 * A draft is an unchecked box in a colour of its own, and that colour goes on the outline.
	 * Brutalist draws no outline at all — `border: none !important` — and paints an unchecked
	 * box in a table as a filled square instead, so there was nothing to recolour and a draft
	 * looked exactly like an empty day.
	 *
	 * The fill is therefore a last resort, and the conditions for it are read off the theme's
	 * own box, all three together:
	 *
	 * 1. **No outline.** A theme that draws one owns the look of a draft, and the recolouring
	 *    is its business; the fill must never reach such a theme. This condition comes first
	 *    and alone decides against, because it is a fact about the theme rather than a
	 *    conclusion drawn from a comparison.
	 * 2. **Something to tint.** A box with no fill either (Slytherin, Terminal) shows no draft
	 *    and never did: the theme draws no unchecked box, and the plugin does not argue.
	 * 3. **Nothing already telling them apart.** Two boxes stand in the probe, one plain and
	 *    one dressed as a draft; if the theme draws them differently, the draft already has a
	 *    voice and takes no fill.
	 *
	 * Asking again changes nothing: once the draft looks different, this does nothing at all.
	 */
	private checkDraft(): void {
		const plain = this.win.getComputedStyle(this.probe.box);
		if (boxLook(plain) === "" || outlined(plain)) return;
		if (plain.backgroundColor === TRANSPARENT) return;
		if (boxLook(plain) !== boxLook(this.win.getComputedStyle(this.probe.draftBox))) return;

		this.frame.style.setProperty(BOX_FILL_PROPERTY, plain.backgroundColor);
		this.frame.addClass(FILLED_CLASS);
	}

	/** At most one update per frame, however many scroll events arrive. */
	private schedule(): void {
		if (this.pending !== 0) return;
		this.pending = this.win.requestAnimationFrame(() => {
			this.pending = 0;
			this.update();
		});
	}

	private update(): void {
		this.zoom = screenScale(this.frame.getBoundingClientRect().width, this.frame.offsetWidth);
		if (!this.measured) this.measure();

		// A title without a placeholder says the same whatever is in sight.
		if (!followsScroll(this.title)) return;

		const date = this.scroll.querySelector<HTMLElement>(".process-tracker__date");
		if (date === null) return;

		const range = visibleColumnRange({
			scrollLeft: this.scroll.scrollLeft,
			viewWidth: this.scroll.clientWidth,
			columnWidth: date.getBoundingClientRect().width / this.zoom,
			total: this.columns.length,
		});
		if (range === null) return;

		const labels = this.columns.slice(range.first, range.last + 1).map(formatMonthYear);
		const label = captionLabel(labels, this.label, this.scroll.scrollLeft <= 0);
		if (label === this.label) return;

		this.label = label;
		renderPeriodCaption(this.captionCell, this.title, label);
	}

	/**
	 * Everything the tracker has to ask the theme about, asked once per layout: how tall
	 * a row is, how tall the head is, and how wide a date column must be. The answers
	 * come from the rendered tables, never from an assumption — a theme decides the size
	 * of a checkbox, the padding of a cell and the face of a caption ([[rendering]]).
	 */
	private measure(): void {
		const dates = this.scroll.querySelector<HTMLElement>(".process-tracker__dates");
		const names = this.frame.querySelector<HTMLElement>(".process-tracker__names");
		if (dates === null || names === null) return;

		const rowHeight = this.matchHeights("tbody tr", "--pt-row-height");
		this.matchHeights("thead tr", "--pt-head-height");
		// No layout yet: the block is rendered off screen, or the note is still opening.
		if (rowHeight <= 0) return;

		this.measured = true;
		// A table with a layout is a table in the document, and only there does a theme
		// answer anything: asked in `onload`, before Obsidian has put the block in its note,
		// every question about a colour came back empty ([[rendering#Пробник|Пробник]]).
		this.checkColors();
		this.checkDraft();
		this.matchFrameShape(dates);
		this.centreContent(dates);
		this.centreBox(dates);

		const width = columnWidth(
			{
				rowHeight,
				checkbox: this.checkboxClaim(),
				caption: this.captionClaim(),
				mark: this.markClaim(),
			},
			this.columnWidth,
		);
		if (width === null) return;

		this.columnWidth = width;
		dates.style.setProperty("--pt-col-date", `${width}px`);
	}

	/**
	 * Cuts the scrolling window to the card the theme draws for the table inside it.
	 *
	 * A window clips by its own box, and that box is not the card: a theme may set the
	 * table off with margins — Ultra Lobster gives every table `1.5em` above and below and
	 * `12px` at the sides — and the margins live inside the window. Rounding the window
	 * itself put its corners a line above and below the card, and at the height of the
	 * card the columns were still cut by a straight edge. So the window is clipped to the
	 * table's own border box, inset by the margins, with the table's corner radii.
	 */
	private matchFrameShape(dates: HTMLElement): void {
		const style = this.win.getComputedStyle(dates);
		const inset = [style.marginTop, style.marginRight, style.marginBottom, style.marginLeft];
		// The computed value of a corner can carry two radii, `16px 8px`, for an ellipse.
		// The window takes the first of them: a circle is the shape themes actually draw.
		const corners = [
			style.borderTopLeftRadius,
			style.borderTopRightRadius,
			style.borderBottomRightRadius,
			style.borderBottomLeftRadius,
		].map((corner) => corner.trim().split(/\s+/)[0]);

		if ([...inset, ...corners].every((value) => Number.parseFloat(value) === 0)) {
			this.scroll.style.removeProperty("--pt-frame-clip");
			return;
		}
		this.scroll.style.setProperty(
			"--pt-frame-clip",
			`inset(${inset.join(" ")} round ${corners.join(" ")})`,
		);
	}

	/**
	 * Puts the checkbox and the day number in the middle of their cell.
	 *
	 * A theme may pad the cells of a row unevenly: Ultra Lobster gives the last cell two
	 * pixels on the left and twenty on the right, the first cell ten and two. Content is
	 * laid out between the paddings, so an uneven pair pushes it sideways, and the last
	 * checkbox stood under the edge of its caption instead of under its middle. The
	 * stylesheet centres the content between the paddings; what the uneven pair takes
	 * away is measured here and handed back as a shift — for the first cell of a row, the
	 * last one, and one in between, the three places themes write such rules for.
	 */
	private centreContent(dates: HTMLElement): void {
		const shift = (cell: Element | undefined): string => {
			if (cell === undefined) return "0px";
			const style = this.win.getComputedStyle(cell);
			const left = px(style.paddingLeft) + px(style.borderLeftWidth);
			const right = px(style.paddingRight) + px(style.borderRightWidth);
			return `${(right - left) / 2}px`;
		};

		const groups: [string, string][] = [
			["tbody tr", "--pt-shift"],
			["thead tr", "--pt-day-shift"],
		];
		for (const [selector, variable] of groups) {
			const cells = Array.from(dates.querySelector(selector)?.children ?? []);
			dates.style.setProperty(`${variable}-first`, shift(cells[0]));
			dates.style.setProperty(`${variable}-mid`, shift(cells[1] ?? cells[0]));
			dates.style.setProperty(`${variable}-last`, shift(cells[cells.length - 1]));
		}
	}

	/**
	 * Finds where a checkbox stands in its cell, for the thread and for the marks ([[rendering]]).
	 *
	 * A checkbox does not stand in the middle of its cell: Obsidian sets one `0.2em` below its
	 * line in a rendered note and by half its own size in live preview, and a theme may move it
	 * again. So the box is asked where it is, and the difference between its middle and the
	 * middle of the cell becomes a shift: the thread is moved by it onto the checkmarks it joins,
	 * and a mark to the place of the checkmark it replaces — so the line runs through the middle
	 * of a mark as it does through a box.
	 *
	 * Asked of a cell that shows its box: a cell with a mark keeps its box hidden, and a hidden
	 * box has no place. Measured on every table, since a mark can appear on any of them with a
	 * click; a table where every day shows a mark keeps the shift it had.
	 */
	private centreBox(dates: HTMLElement): void {
		const box = this.visibleBox(dates);
		const cell = box?.closest<HTMLElement>(".process-tracker__cell") ?? null;
		if (box === null || cell === null) return;

		const cellBox = cell.getBoundingClientRect();
		const own = box.getBoundingClientRect();
		const shift = (own.top + own.height / 2 - (cellBox.top + cellBox.height / 2)) / this.zoom;
		dates.style.setProperty(BOX_SHIFT_PROPERTY, `${Math.round(shift * 100) / 100}px`);
	}

	/** The checkbox of the first cell that shows one; `null` when every day shows a mark. */
	private visibleBox(root: HTMLElement): HTMLElement | null {
		return root.querySelector<HTMLElement>(
			`tbody .process-tracker__cell:not([${MARK_ATTRIBUTE}]) input[type="checkbox"]`,
		);
	}

	/**
	 * Gives the rows of both tables one height: the larger of the two.
	 *
	 * Side by side, the tables know nothing of each other — a row of track names and a
	 * row of checkboxes are measured by the theme separately, and half a pixel of
	 * difference sends the two halves of the tracker out of step. So the height is
	 * measured with nothing imposed, and then imposed on both.
	 */
	private matchHeights(rows: string, variable: string): number {
		this.frame.style.removeProperty(variable);

		let tallest = 0;
		for (const row of Array.from(this.frame.querySelectorAll<HTMLElement>(rows))) {
			tallest = Math.max(tallest, row.getBoundingClientRect().height / this.zoom);
		}
		if (tallest <= 0) return 0;

		this.frame.style.setProperty(variable, `${Math.ceil(tallest * 100) / 100}px`);
		return tallest;
	}

	/** The checkbox of a cell with the padding and borders around it. */
	private checkboxClaim(): number {
		const cells = this.sample(".process-tracker__cell");
		if (cells.length === 0) return 0;

		const box = this.visibleBox(this.scroll);
		const width = box === null ? 0 : box.getBoundingClientRect().width / this.zoom;
		return width === 0 ? 0 : width + this.widestSideRoom(cells);
	}

	/**
	 * The widest mark on the table with the padding and borders of a cell ([[rendering]]).
	 *
	 * Every mark is measured: an emoji is wider than a digit, and one of them decides the width
	 * of every column. A table has as many marks as closed days with one, and one layout serves
	 * all of them. A mark that appears later with a click is measured with the next layout.
	 */
	private markClaim(): number {
		const marks = Array.from(this.scroll.querySelectorAll<HTMLElement>(`.${MARK_CLASS}`));
		let widest = 0;
		for (const mark of marks) {
			widest = Math.max(widest, mark.getBoundingClientRect().width / this.zoom);
		}
		return widest === 0 ? 0 : widest + this.widestSideRoom(this.sample(".process-tracker__cell"));
	}

	/**
	 * The widest day caption with the padding and borders around it.
	 *
	 * Every caption is measured, not the first one: digits are not equal in width, and
	 * a column cut to the width of `16` clips `09` — Obsidian ends an overflowing
	 * caption with an ellipsis, and the reader loses the date.
	 *
	 * The text is measured with a range rather than by the width of its cell: a cell
	 * already too narrow clips the text, and its own width would then confirm that
	 * everything fits.
	 */
	private captionClaim(): number {
		const captions = Array.from(
			this.scroll.querySelectorAll<HTMLElement>(".process-tracker__date"),
		);
		if (captions.length === 0) return 0;

		const range = this.scroll.ownerDocument.createRange();
		let widest = 0;
		for (const caption of captions) {
			// The text, not its wrapper: the wrapper is a block as wide as the cell, and
			// measuring it would only confirm the width the column already has.
			range.selectNodeContents(caption.querySelector(".process-tracker__day") ?? caption);
			widest = Math.max(widest, range.getBoundingClientRect().width / this.zoom);
		}

		return widest === 0 ? 0 : widest + this.widestSideRoom(this.sample(".process-tracker__date"));
	}

	/**
	 * The first cell of a kind, the second and the last — the three places a theme puts a
	 * padding of its own. Ultra Lobster pads the last cell of a row by twenty pixels on
	 * the right and the first by ten on the left, while every cell between them gets
	 * eight; measuring the first cell alone left the last column too narrow for its
	 * checkbox, and Obsidian ended it with an ellipsis.
	 *
	 * Three cells, not all of them: every column shares one width, so the widest claim
	 * decides, and a table of three thousand days must not be walked to find it.
	 */
	private sample(selector: string): HTMLElement[] {
		const all = Array.from(this.scroll.querySelectorAll<HTMLElement>(selector));
		return all.length <= 3 ? all : [all[0], all[1], all[all.length - 1]];
	}

	private widestSideRoom(cells: HTMLElement[]): number {
		return cells.reduce((widest, cell) => Math.max(widest, this.sideRoom(cell)), 0);
	}

	/** Everything a cell spends sideways before its content starts: padding, borders. */
	private sideRoom(cell: HTMLElement): number {
		const style = this.win.getComputedStyle(cell);
		const values = [
			style.paddingLeft,
			style.paddingRight,
			style.borderLeftWidth,
			style.borderRightWidth,
		];
		return values.reduce((total, value) => total + px(value), 0);
	}

	/** The table may live in a popout window, which has its own timers. */
	private get win(): typeof window {
		return this.scroll.ownerDocument.defaultView ?? window;
	}
}

/**
 * Does the theme draw an outline around this box — the thing a draft recolours?
 *
 * A width of zero, a style of `none` or a transparent colour all mean the same to a reader:
 * there is no outline on screen. Any one of them is enough for the answer to be no.
 */
function outlined(style: CSSStyleDeclaration): boolean {
	return (
		style.borderTopStyle !== "none" &&
		style.borderTopStyle !== "hidden" &&
		px(style.borderTopWidth) > 0 &&
		style.borderTopColor !== TRANSPARENT
	);
}

/** Everything about a checkbox a reader could tell two of them apart by. */
function boxLook(style: CSSStyleDeclaration): string {
	return [
		style.backgroundColor,
		style.backgroundImage,
		style.borderTopWidth,
		style.borderTopStyle,
		style.borderTopColor,
		style.boxShadow,
		style.outlineWidth,
		style.outlineStyle,
		style.outlineColor,
		style.opacity,
	].join(" ");
}

/** A computed length in pixels; anything unreadable counts as nothing. */
function px(value: string): number {
	return Number.parseFloat(value) || 0;
}
