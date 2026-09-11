// Process Tracker — lifecycle of one rendered code block.

import { MarkdownRenderChild } from "obsidian";
import { syncMonthLabels } from "./month-labels.ts";

/**
 * Follows horizontal scrolling and resizes of one table and repositions its month
 * captions. Obsidian unloads the child together with the rendered block, so the
 * listeners and the pending animation frame never outlive the table.
 */
export class TrackerRenderChild extends MarkdownRenderChild {
	private frame = 0;

	constructor(
		containerEl: HTMLElement,
		private readonly scroll: HTMLElement,
	) {
		super(containerEl);
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

	/** At most one repositioning per frame, however many scroll events arrive. */
	private schedule(): void {
		if (this.frame !== 0) return;
		this.frame = this.win.requestAnimationFrame(() => {
			this.frame = 0;
			syncMonthLabels(this.scroll);
		});
	}

	/** The table may live in a popout window, which has its own timers. */
	private get win(): Window & typeof globalThis {
		return this.scroll.ownerDocument.defaultView ?? window;
	}
}
