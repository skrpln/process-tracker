// Process Tracker — one code block, drawn again in place when what it shows has changed.

import { MarkdownRenderChild } from "obsidian";
import type { Component } from "obsidian";

/**
 * The block as Obsidian holds it ([[architecture]]). A drawing adds children of its own — the
 * render child, the pointer — and they belong to the drawing, not to the block: drawn again,
 * the block unloads them first, so a table that has left the page takes its listeners with it.
 */
export class TrackerBlock extends MarkdownRenderChild {
	private parts: Component[] = [];

	/** Keeps a child of this drawing; it loads with the block, or at once if the block is loaded. */
	hold(part: Component): void {
		this.parts.push(this.addChild(part));
	}

	/** Unloads what the last drawing added and empties the block. */
	clear(): void {
		for (const part of this.parts) this.removeChild(part);
		this.parts = [];
		this.containerEl.empty();
	}
}
