// Process Tracker — the line the first column is dragged by ([[rendering]]).

import { MarkdownRenderChild } from "obsidian";
import type { App, MarkdownPostProcessorContext } from "obsidian";
import { rewriteWidth } from "../codeblock/width.ts";
import { MIN_WIDTH } from "../constants.ts";
import { setNamesWidth } from "./table.ts";
import { draggedWidth, screenScale } from "./visible.ts";

/** Class the frame wears while its first column is being dragged. */
const RESIZING_CLASS = "is-resizing";

/**
 * How far the pointer has to go, in screen pixels, before a press becomes a drag. A hand does
 * not hold still through a click, and a double click that moved the column by a pixel would
 * write that pixel into the note before it could take the width back.
 */
const DRAG_THRESHOLD = 3;

/**
 * Asked for when a drag ends or the line is double-clicked: keep this width in the code
 * block, or — for `null` — take the line out of it. Answers whether the note took it.
 */
export type WidthRequest = (width: number | null) => Promise<boolean>;

/** A drag in progress: where it began and how far it may go. */
interface Drag {
	pointer: number;
	/** Where the pointer was pressed, in screen pixels. */
	x: number;
	/** Width of the column at that moment, in CSS pixels. */
	start: number;
	/** Screen pixels per CSS pixel: the zoom of a canvas ([[rendering#Замеры|Замеры]]). */
	scale: number;
	/** The widest the column may get: one date column keeps its place. */
	max: number;
	/** Whether the pointer has gone far enough for the press to be a drag. */
	moving: boolean;
}

/**
 * Lets the reader set the width of the first column by hand ([[expectation]] §9).
 *
 * While the button is held, the column follows the pointer: every move writes a width into a
 * variable of the frame, and the stylesheet does the rest. Nothing is saved along the way.
 * When the button is let go, the width is handed over to be written into the code block as
 * `width: N`; Obsidian then draws the block again from its new source. A double click asks for
 * the line to be taken out, and the column goes back to the width of the stylesheet.
 *
 * Where the note cannot take the line — the table stands in a place Obsidian does not report
 * the lines of — the width stays as dragged until the block is drawn again.
 *
 * The line captures the pointer, so the drag goes on wherever the pointer wanders, and ends
 * with the button even outside the table. Obsidian unloads the child together with the block,
 * and the listeners go with it.
 */
export class ColumnResizeChild extends MarkdownRenderChild {
	private drag: Drag | null = null;
	/** The width the column wears now; `null` — the width of the stylesheet. */
	private shown: number | null;

	constructor(
		containerEl: HTMLElement,
		/** Both tables of the tracker; the width is a variable on it. */
		private readonly frame: HTMLElement,
		private readonly resizer: HTMLElement,
		/** The width the code block states; `null` — it has no `width` line. */
		private written: number | null,
		private readonly keep: WidthRequest,
	) {
		super(containerEl);
		this.shown = written;
	}

	onload(): void {
		this.registerDomEvent(this.resizer, "pointerdown", (event) => this.begin(event));
		this.registerDomEvent(this.resizer, "pointermove", (event) => this.follow(event));
		this.registerDomEvent(this.resizer, "pointerup", (event) => this.finish(event));
		this.registerDomEvent(this.resizer, "pointercancel", () => this.abandon());
		this.registerDomEvent(this.resizer, "dblclick", (event) => this.reset(event));
	}

	private begin(event: PointerEvent): void {
		const names = this.frame.querySelector<HTMLElement>(".process-tracker__names");
		if (event.button !== 0 || names === null) return;

		// The press belongs to the line: the browser must not start selecting text with it,
		// and neither the editor around the block nor a canvas may take it for their own.
		event.preventDefault();
		event.stopPropagation();
		this.resizer.setPointerCapture(event.pointerId);

		const date = this.frame.querySelector<HTMLElement>(".process-tracker__date");
		this.drag = {
			pointer: event.pointerId,
			x: event.clientX,
			start: names.offsetWidth,
			scale: screenScale(this.frame.getBoundingClientRect().width, this.frame.offsetWidth),
			max: this.frame.clientWidth - this.resizer.offsetWidth - (date?.offsetWidth ?? 0),
			moving: false,
		};
		this.frame.addClass(RESIZING_CLASS);
	}

	private follow(event: PointerEvent): void {
		const drag = this.drag;
		if (drag === null || event.pointerId !== drag.pointer) return;

		drag.moving ||= Math.abs(event.clientX - drag.x) >= DRAG_THRESHOLD;
		if (drag.moving) setNamesWidth(this.frame, widthAt(drag, event));
	}

	private finish(event: PointerEvent): void {
		const drag = this.drag;
		if (drag === null || event.pointerId !== drag.pointer) return;
		this.end(drag);

		// A press that went nowhere is a click, or half of a double click: nothing was dragged.
		if (!drag.moving) return;

		this.shown = widthAt(drag, event);
		setNamesWidth(this.frame, this.shown);
		void this.save(this.shown);
	}

	/** The drag was taken away — by the system, by a lost window: the column goes back. */
	private abandon(): void {
		if (this.drag === null) return;
		this.end(this.drag);
		setNamesWidth(this.frame, this.shown);
	}

	private end(drag: Drag): void {
		this.drag = null;
		this.frame.removeClass(RESIZING_CLASS);
		if (this.resizer.hasPointerCapture(drag.pointer)) {
			this.resizer.releasePointerCapture(drag.pointer);
		}
	}

	private reset(event: MouseEvent): void {
		event.preventDefault();
		event.stopPropagation();
		this.shown = null;
		setNamesWidth(this.frame, null);
		void this.save(null);
	}

	/** Asks for the width to be kept, unless the block states exactly that already. */
	private async save(width: number | null): Promise<void> {
		if (width === this.written) return;
		if (await this.keep(width)) this.written = width;
	}
}

function widthAt(drag: Drag, event: PointerEvent): number {
	return draggedWidth({
		start: drag.start,
		moved: event.clientX - drag.x,
		scale: drag.scale,
		min: MIN_WIDTH,
		max: drag.max,
	});
}

/**
 * Writes the width into the code block a table was drawn from, or takes it out; answers
 * whether the note took it ([[codeblock-syntax]]).
 *
 * Obsidian is asked where the block stands at the moment of writing, not at the render: the
 * lines move with every edit above the block. It answers in a note — in reading view and in
 * live preview — and in a note shown whole elsewhere: an embed, a hover preview, a card of a
 * canvas. It has no answer inside a Markdown table or a callout of live preview and for a
 * block another plugin renders, and a text card of a canvas has no note to write into; there
 * nothing is written.
 *
 * The answer is checked against the file before anything is written, inside the same
 * `process` that writes: `rewriteWidth` finds the block on those lines by its source and
 * refuses when it is not there — a note embedded by a heading counts its lines from that
 * heading, not from the top of the file.
 */
export async function writeWidth(
	app: App,
	context: MarkdownPostProcessorContext,
	element: HTMLElement,
	source: string,
	width: number | null,
): Promise<boolean> {
	const place = context.getSectionInfo(element);
	const file = app.vault.getFileByPath(context.sourcePath);
	if (place === null || file === null) return false;

	let kept = false;
	await app.vault.process(file, (text) => {
		const next = rewriteWidth(text, place, source, width);
		kept = next !== null;
		return next ?? text;
	});
	return kept;
}
