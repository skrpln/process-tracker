// Process Tracker — plugin entry point.
// Wires the pure layers together: parse -> select -> date grid -> render.

import { Notice, Plugin } from "obsidian";
import type { MarkdownPostProcessorContext, TFile } from "obsidian";
import { parseCodeBlock } from "./codeblock/parse.ts";
import { CODE_BLOCK_LANGUAGE, DEFAULT_DAYS, HOVER_SOURCE } from "./constants.ts";
import { buildDateColumns } from "./dates/grid.ts";
import { cellAction } from "./entry/actions.ts";
import { collectEntries, toEntry } from "./entry/source.ts";
import { buildEntryIndex, findEntry } from "./entry/state.ts";
import { createEntry, setEntryDone } from "./entry/write.ts";
import { TrackerRenderChild } from "./render/child.ts";
import { CellPointerChild } from "./render/pointer.ts";
import type { CellTarget } from "./render/pointer.ts";
import {
	SCROLL_CLASS,
	paintCell,
	refreshEntry,
	renderError,
	renderTracker,
	renderWarnings,
} from "./render/table.ts";
import { wheelScroll } from "./render/wheel.ts";
import { ProcessTrackerSettingTab } from "./settings-tab.ts";
import { DEFAULT_SETTINGS, normalizeSettings } from "./settings.ts";
import type { ProcessTrackerSettings } from "./settings.ts";
import { applyTrackFilter } from "./tracks/dataview.ts";
import { selectTracks } from "./tracks/select.ts";
import { collectTrackCards } from "./tracks/source.ts";

export default class ProcessTrackerPlugin extends Plugin {
	settings: ProcessTrackerSettings = { ...DEFAULT_SETTINGS };

	/** Tables the reader has on screen; each one leaves when Obsidian unloads its block. */
	private readonly tables = new Set<HTMLElement>();

	/** Documents already listening for the wheel: the main window, popout windows. */
	private readonly wheelDocuments = new WeakSet<Document>();

	async onload(): Promise<void> {
		this.settings = normalizeSettings(await this.loadData());
		this.addSettingTab(new ProcessTrackerSettingTab(this.app, this));

		// Makes the table a source of hover previews for the core Page preview plugin, and
		// gives the reader a switch for it in its settings.
		this.registerHoverLinkSource(HOVER_SOURCE, {
			display: "Process Tracker",
			defaultMod: false,
		});

		this.registerMarkdownCodeBlockProcessor(
			CODE_BLOCK_LANGUAGE,
			(source, element, context) => this.renderBlock(source, element, context),
		);

		// An entry written outside the table — in another tab, in a hover popover, by hand.
		// The cell repaints itself; the table is not rebuilt and nothing is recounted.
		this.registerEvent(this.app.metadataCache.on("changed", (file) => this.refresh(file)));
		this.registerEvent(this.app.metadataCache.on("deleted", (file) => this.refresh(file, true)));
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	/**
	 * Renders one code block. State is never cached: the table is rebuilt from
	 * the metadata cache on every render.
	 */
	private renderBlock(
		source: string,
		element: HTMLElement,
		context: MarkdownPostProcessorContext,
	): void {
		element.empty();
		this.watchWheel(element.ownerDocument);
		try {
			const { options, warnings } = parseCodeBlock(source);

			// The tag filter comes first: the `track` expression then works on a handful
			// of track cards instead of the whole vault.
			const cards = collectTrackCards(this.app);
			const tagged = selectTracks(cards, this.settings.trackTag, options.sort);
			const tracks = applyTrackFilter(
				this.app,
				tagged,
				options.track,
				context.sourcePath,
				warnings,
			);
			const columns = buildDateColumns({
				start: options.start,
				today: new Date(),
				days: options.days ?? DEFAULT_DAYS,
				order: options.dates,
			});

			const elements = renderTracker(element, {
				tracks,
				columns,
				entries: buildEntryIndex(collectEntries(this.app)),
				trackTag: this.settings.trackTag,
				trackFilter: options.track,
			});
			renderWarnings(element, warnings);

			if (elements !== null) {
				// The day captions carry no month, so the corner caption follows the scroll.
				context.addChild(
						new TrackerRenderChild(
						element,
						elements.frame,
						elements.scroll,
						elements.captionCell,
						columns,
						this.tables,
					),
				);
				context.addChild(
					new CellPointerChild(
						element,
						elements.frame,
						this.app,
						context.sourcePath,
						(target, mod) => {
							void this.runCellAction(target, mod);
						},
					),
				);
			}
		} catch (error) {
			renderError(element, error instanceof Error ? error.message : String(error));
		}
	}

	/**
	 * Starts listening for the wheel in the document a table has just rendered in — the main
	 * window, or a popout one. One listener serves every table of that document; a document
	 * without a tracker never gets one.
	 */
	private watchWheel(doc: Document): void {
		if (this.wheelDocuments.has(doc)) return;
		this.wheelDocuments.add(doc);

		this.registerDomEvent(doc, "wheel", (event: WheelEvent) => this.onWheel(event), {
			capture: true,
			passive: false,
		});
	}

	/**
	 * Scrolls the columns while the pointer stands over a table ([[rendering]]).
	 *
	 * The listener belongs to the document, not to the table, and catches the event on its way
	 * down: over a table the wheel would otherwise go to whoever holds it — a canvas pans the
	 * board, a note scrolls away — and a mouse, with one wheel and no sideways gesture, would
	 * have no way to reach the columns at all.
	 *
	 * What the wheel landed on decides nothing; where the pointer stands decides everything,
	 * and `elementFromPoint` answers that honestly: a table clipped by a small canvas card
	 * counts only where the card shows it, and a card that is not focused answers with the
	 * overlay the canvas lays over its content — so an unfocused card stays still, as a card
	 * that is not focused should.
	 *
	 * A wheel with Ctrl or Cmd held is left alone: that is a pinch on a trackpad, and the
	 * canvas zooms the board by it.
	 */
	private onWheel(event: WheelEvent): void {
		if (event.ctrlKey || event.metaKey) return;

		const doc = (event.currentTarget ?? event.target) as Document;
		const top = doc.elementFromPoint?.(event.clientX, event.clientY) ?? null;
		// Over the track names too: they are a table of their own now, outside the
		// scrolling frame, and the wheel over them still belongs to the columns.
		const frame = top === null ? null : top.closest<HTMLElement>(".process-tracker__frame");
		const scroll = frame === null ? null : frame.querySelector<HTMLElement>(`.${SCROLL_CLASS}`);
		if (scroll === null) return;

		event.preventDefault();
		event.stopPropagation();
		scroll.scrollLeft += wheelScroll(event, scroll.clientWidth);
	}

	/**
	 * Repaints the cells of one note in every table on screen ([[expectation]] §9).
	 *
	 * This is the whole of the subscription to the vault: the handler reads the properties of
	 * the one file that changed and hands them to the tables, which repaint a cell each. No
	 * index is rebuilt and no table is redrawn, so the cost does not grow with the vault; with
	 * no table on screen the handler returns before it reads anything at all.
	 *
	 * Track cards are not watched. A tag taken off a card changes the rows of the table, not a
	 * cell in it, and that is the business of the next render ([[architecture]]).
	 */
	private refresh(file: TFile, gone = false): void {
		if (this.tables.size === 0) return;

		const entry = gone ? null : toEntry(this.app, file);
		for (const table of this.tables) refreshEntry(table, file.path, entry);
	}

	/**
	 * Performs what a click asks for ([[expectation]] §8) and repaints the one cell that
	 * changed. Only that cell: a table redrawn on every click would lose its scroll
	 * position, and noticing changes made elsewhere in the vault is the business of the
	 * subscription that arrives in Phase 6.
	 */
	private async runCellAction(target: CellTarget, mod: boolean): Promise<void> {
		const action = cellAction(target.state, mod);
		try {
			if (action.kind === "create") {
				const file = await createEntry(
					this.app,
					target.trackPath,
					target.date,
					action.done,
					this.settings.entryFolder,
				);
				paintCell(target.cell, action.done ? "done" : "draft", file.path);
				return;
			}

			const file = this.entryFile(target);
			if (file === null) throw new Error(`the entry note of ${target.date} is gone`);

			if (action.kind === "toggle") {
				await setEntryDone(this.app, file.path, action.done);
				paintCell(target.cell, action.done ? "done" : "draft", file.path);
				return;
			}
			await this.app.workspace.getLeaf("tab").openFile(file);
		} catch (error) {
			new Notice(
				`Process Tracker: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}

	/**
	 * The note behind a cell. The path written into the cell can go stale between renders
	 * — Templater moves a new note while it renders it — so a path that leads nowhere is
	 * answered by looking the entry up in the vault again, not by opening a link, which
	 * would quietly create an empty note at the old address.
	 */
	private entryFile(target: CellTarget): TFile | null {
		if (target.entryPath !== null) {
			const file = this.app.vault.getFileByPath(target.entryPath);
			if (file !== null) return file;
		}

		const index = buildEntryIndex(collectEntries(this.app));
		const found = findEntry(index, target.trackPath, target.date);
		return found === null ? null : this.app.vault.getFileByPath(found.path);
	}
}
