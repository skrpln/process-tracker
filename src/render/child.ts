// Process Tracker — lifecycle of one rendered code block.

import { MarkdownRenderChild } from "obsidian";
import type { DateColumn } from "../model/types.ts";
import { formatMonthYear } from "../dates/grid.ts";
import { renderPeriodCaption } from "./table.ts";
import { captionLabel, squareColumnWidth, visibleColumnRange } from "./visible.ts";

/**
 * Runs the two things the table cannot do in CSS alone: keeps a date column as wide
 * as a row is tall, and keeps the month caption above the pinned column in step with
 * horizontal scrolling. Obsidian unloads the child together with the block, so the
 * listeners and the pending animation frame never outlive the table.
 */
export class TrackerRenderChild extends MarkdownRenderChild {
	private frame = 0;
	private label: string;
	private columnWidth: number | null = null;

	constructor(
		containerEl: HTMLElement,
		private readonly scroll: HTMLElement,
		private readonly captionCell: HTMLElement,
		private readonly columns: DateColumn[],
	) {
		super(containerEl);
		this.label = columns[0] === undefined ? "" : formatMonthYear(columns[0]);
	}

	onload(): void {
		this.registerDomEvent(this.scroll, "scroll", () => this.schedule(), { passive: true });

		const observer = new this.win.ResizeObserver(() => this.schedule());
		observer.observe(this.scroll);
		this.register(() => observer.disconnect());

		this.schedule();
	}

	onunload(): void {
		if (this.frame !== 0) this.win.cancelAnimationFrame(this.frame);
		this.frame = 0;
	}

	/** At most one update per frame, however many scroll events arrive. */
	private schedule(): void {
		if (this.frame !== 0) return;
		this.frame = this.win.requestAnimationFrame(() => {
			this.frame = 0;
			this.update();
		});
	}

	private update(): void {
		this.matchColumnToRow();

		const pinned = this.scroll.querySelector<HTMLElement>(".process-tracker__track");
		const date = this.scroll.querySelector<HTMLElement>(".process-tracker__date");
		if (pinned === null || date === null) return;

		const range = visibleColumnRange({
			scrollLeft: this.scroll.scrollLeft,
			viewWidth: this.scroll.clientWidth,
			pinnedWidth: pinned.getBoundingClientRect().width,
			columnWidth: date.getBoundingClientRect().width,
			total: this.columns.length,
		});
		if (range === null) return;

		const labels = this.columns.slice(range.first, range.last + 1).map(formatMonthYear);
		const label = captionLabel(labels, this.label, this.scroll.scrollLeft <= 0);
		if (label === this.label) return;

		this.label = label;
		renderPeriodCaption(this.captionCell, label);
	}

	/**
	 * A date column takes the height of a row as its width. The height comes from the
	 * theme — font, line spacing, checkbox — so it is measured, never assumed.
	 */
	private matchColumnToRow(): void {
		// Not the first row: it also carries the top edge of the grid and stands a
		// pixel taller than every row below it.
		const row =
			this.scroll.querySelector<HTMLElement>("tbody tr:nth-child(2)") ??
			this.scroll.querySelector<HTMLElement>("tbody tr");
		const table = this.scroll.querySelector<HTMLElement>(".process-tracker__table");
		if (row === null || table === null) return;

		const width = squareColumnWidth(row.getBoundingClientRect().height, this.columnWidth);
		if (width === null) return;

		this.columnWidth = width;
		table.style.setProperty("--pt-col-date", `${width}px`);
	}

	/** The table may live in a popout window, which has its own timers. */
	private get win(): Window & typeof globalThis {
		return this.scroll.ownerDocument.defaultView ?? window;
	}
}
