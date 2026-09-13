// Process Tracker — lifecycle of one rendered code block.

import { MarkdownRenderChild } from "obsidian";
import type { DateColumn } from "../model/types.ts";
import { dominantYear, visibleColumnRange } from "./visible.ts";

/**
 * Keeps the year caption above the pinned column in step with horizontal scrolling.
 * Obsidian unloads the child together with the block, so the listeners and the
 * pending animation frame never outlive the table.
 */
export class TrackerRenderChild extends MarkdownRenderChild {
	private frame = 0;
	private year: number;

	constructor(
		containerEl: HTMLElement,
		private readonly scroll: HTMLElement,
		private readonly yearCell: HTMLElement,
		private readonly columns: DateColumn[],
	) {
		super(containerEl);
		this.year = columns[0]?.year ?? new Date().getFullYear();
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

		const years = this.columns.slice(range.first, range.last + 1).map((column) => column.year);
		const year = dominantYear(years, this.year);
		if (year === this.year) return;

		this.year = year;
		this.yearCell.setText(String(year));
	}

	/** The table may live in a popout window, which has its own timers. */
	private get win(): Window & typeof globalThis {
		return this.scroll.ownerDocument.defaultView ?? window;
	}
}
