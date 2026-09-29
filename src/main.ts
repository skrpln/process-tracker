// Process Tracker — plugin entry point.
// Wires the pure layers together: parse -> select -> date grid -> render.

import { Notice, Plugin } from "obsidian";
import type { MarkdownPostProcessorContext, TFile } from "obsidian";
import type { EntriesMode, Entry } from "./model/types.ts";
import { parseCodeBlock } from "./codeblock/parse.ts";
import { CODE_BLOCK_LANGUAGE, DEFAULT_DAYS, HOVER_SOURCE } from "./constants.ts";
import { confirmDailyNote } from "./daily/confirm.ts";
import {
	createDailyNote,
	dailyNotePathOf,
	dailyNotePlace,
	fillDayTemplate,
	findDailyNotes,
} from "./daily/notes.ts";
import { buildDateColumns } from "./dates/grid.ts";
import { cellAction } from "./entry/actions.ts";
import { resolveEntriesMode } from "./entry/mode.ts";
import { belongsTo, recountDay, touchedDays } from "./entry/refresh.ts";
import type { CellRef } from "./entry/refresh.ts";
import {
	collectEntries,
	collectJournalEntries,
	entryAt,
	journalEntries,
	journalsOf,
	toEntry,
} from "./entry/source.ts";
import { buildEntryIndex, byId, entryId, findEntries, readEntryId } from "./entry/state.ts";
import { createEntry, createRecord, setEntryDone } from "./entry/write.ts";
import { TrackerRenderChild } from "./render/child.ts";
import { CellPointerChild } from "./render/pointer.ts";
import type { CellTarget } from "./render/pointer.ts";
import {
	SCROLL_CLASS,
	cellOf,
	cellsOfRow,
	cellsShowing,
	dressDayCaption,
	entryIdsOf,
	paintCell,
	readCellRef,
	renderError,
	renderTracker,
	renderWarnings,
	rowsOfJournal,
} from "./render/table.ts";
import { wheelScroll } from "./render/wheel.ts";
import { ProcessTrackerSettingTab } from "./settings-tab.ts";
import { DEFAULT_SETTINGS, normalizeSettings } from "./settings.ts";
import type { ProcessTrackerSettings } from "./settings.ts";
import { applyTrackFilter } from "./tracks/dataview.ts";
import { selectTracks } from "./tracks/select.ts";
import { collectTrackCards, toTrackCard } from "./tracks/source.ts";

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

			// The daily notes are looked up once per render, and a day that gets one elsewhere
			// waits for the next render: a caption is dressed where it is drawn
			// ([[daily-notes]]).
			const place = dailyNotePlace(this.app, options.dailyNoteDir, warnings);
			const days = columns.map((column) => column.iso);

			// Notes are found wherever they lie; records only in the journals of these tracks.
			const entries = [
				...collectEntries(this.app),
				...collectJournalEntries(this.app, tracks.map((track) => track.path)),
			];

			const elements = renderTracker(element, {
				tracks,
				columns,
				entries: buildEntryIndex(entries),
				dailyNotes: place === null ? new Map() : findDailyNotes(this.app, place, days),
				dailyNotesCreatable: place !== null,
				trackColor: options.trackColor,
				stroke: options.stroke,
				dates: options.dates,
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
						elements.probe,
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
							void this.runCellAction(target, mod, options.entries);
						},
						{
							toggle: (entry, done) => this.toggleEntry(entry, done),
							open: (entry) => {
								void this.openEntry(entryId(entry), entry.trackPath);
							},
						},
						(caption, date) => {
							void this.newDailyNote(caption, date, options.dailyNoteDir);
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
	 * Recounts the days of one changed note in every table on screen ([[expectation]] §9).
	 *
	 * This is the whole of the subscription to the vault: the handler reads the properties of
	 * the one file that changed and hands them to the tables, which recount the days that note
	 * touches. No index is rebuilt and no table is redrawn, so the cost does not grow with the
	 * vault; with no table on screen the handler returns before it reads anything at all.
	 *
	 * A journal is a note of many entries, so a change to it recounts the rows of the tracks that
	 * keep it, not a day ([[entry#Журнал трека|entry]]).
	 *
	 * Track cards are not watched as cards. A tag taken off a card changes the rows of the table,
	 * not a cell in it, and that is the business of the next render ([[architecture]]); a card
	 * that keeps its own journal is a journal to this handler.
	 */
	private refresh(file: TFile, gone = false): void {
		if (this.tables.size === 0) return;

		const entry = gone ? null : toEntry(this.app, file);
		for (const table of this.tables) {
			this.recount(table, file.path, entry);
			this.recountJournal(table, file.path);
		}
	}

	/**
	 * Recounts, in one table, every row whose track keeps the changed note as its journal.
	 *
	 * The records of the row are read again from the metadata cache — the headings and the boxes
	 * of two notes at most — and the notes the cells name are read as `paint` reads them. Lines
	 * move with every record written above them, so the whole row is repainted, not the day the
	 * change was in: the addresses in the cells have to follow.
	 */
	private recountJournal(table: HTMLElement, path: string): void {
		const keeps = (trackPath: string): boolean =>
			journalsOf(this.app, trackPath).some((journal) => journal.path === path);

		for (const row of rowsOfJournal(table, path, keeps)) {
			const trackPath = row.dataset.track ?? "";
			const records = journalEntries(this.app, trackPath);

			for (const cell of cellsOfRow(row)) {
				const day = readCellRef(cell);
				if (day === null) continue;

				const entries = records.filter((record) => record.date === day.date);
				for (const id of entryIdsOf(cell)) {
					if (readEntryId(id).record !== null) continue;
					const note = entryAt(this.app, id, trackPath);
					if (note !== null && belongsTo(note, day)) entries.push(note);
				}
				paintCell(cell, entries.sort(byId));
			}
		}
	}

	/**
	 * Recounts, in one table, every day the changed note touches: the days whose cells show
	 * it and the day it claims now ([[entry]]).
	 *
	 * A day is counted, not guessed: the cell names the notes behind it, and each of them is
	 * read again from the metadata cache — a lookup in memory, no disk. So a day that holds
	 * two entries answers for both, and a note that left the day leaves the rest of it
	 * standing. The work is bounded by the notes of one day, not by the size of the vault.
	 */
	private recount(table: HTMLElement, path: string, changed: Entry | null): void {
		const shown: CellRef[] = [];
		for (const cell of cellsShowing(table, path)) {
			const day = readCellRef(cell);
			if (day !== null) shown.push(day);
		}

		for (const day of touchedDays(shown, changed)) {
			const cell = cellOf(table, day);
			if (cell !== null) this.paint(cell, day, path, changed);
		}
	}

	/**
	 * Repaints one cell from the entries of its day: every note the cell names is read again
	 * from the metadata cache, and the one note the caller knows better is taken as given —
	 * as the event brought it, or as a write has just left it.
	 */
	private paint(cell: HTMLElement, day: CellRef, known: string, changed: Entry | null): void {
		const rest: Entry[] = [];
		for (const id of entryIdsOf(cell)) {
			if (id === known) continue;
			const entry = entryAt(this.app, id, day.trackPath);
			if (entry !== null) rest.push(entry);
		}

		paintCell(cell, recountDay(day, rest, changed));
	}

	/**
	 * An entry as a write has just left it. The metadata cache catches up a moment after the
	 * write, so `done` is taken as it was asked; the mark, which the write does not touch, is
	 * read from the cache, where it has been all along — a draft closed by a click shows its
	 * mark at once. An entry the cache has not read yet has no mark to show until it has.
	 */
	private written(id: string, day: CellRef, done: boolean): Entry {
		const known = entryAt(this.app, id, day.trackPath);
		if (known !== null) return { ...known, done };

		const address = readEntryId(id);
		const record =
			address.record === null
				? null
				: { nth: address.record.nth, heading: day.date, line: 0 };
		return { path: address.path, trackPath: day.trackPath, date: day.date, done, mark: null, record };
	}

	/**
	 * Switches one entry of a day, asked for by the list the day opens on hover.
	 *
	 * The cells showing that entry are repainted at once, with the entry taken as it was just
	 * asked to be: the file is written, but the metadata cache catches up a moment later, and
	 * reading it here would answer with the state before the write. The answer says whether
	 * the file took the change, so the box of the list can follow it.
	 */
	private async toggleEntry(entry: Entry, done: boolean): Promise<boolean> {
		const id = entryId(entry);
		try {
			await setEntryDone(this.app, id, done);
		} catch (error) {
			new Notice(`Process Tracker: ${message(error)}`);
			return false;
		}

		for (const table of this.tables) {
			for (const cell of cellsShowing(table, id)) {
				const day = readCellRef(cell);
				if (day === null) continue;
				this.paint(cell, day, id, this.written(id, day, done));
			}
		}
		return true;
	}

	/**
	 * Makes the daily note of a day, asked for by a click on its caption ([[daily-notes]]).
	 *
	 * The place is asked again here, not taken from the render: the settings or the folder may
	 * have changed since the table was drawn. The reader is asked first, with the path shown —
	 * a click on a number is easy to make by accident, and the daily note is a note of their own.
	 * A daily note that has appeared at that path in the meantime is opened without the question.
	 * The caption becomes a link at once: the table knows the path, and a render would draw it
	 * the same way. The daily note opens in a new tab, as a note made by a click on a cell does:
	 * the table the reader clicked in stays where it was.
	 */
	private async newDailyNote(caption: HTMLElement, date: string, dir: string | null): Promise<void> {
		try {
			const place = dailyNotePlace(this.app, dir);
			if (place === null) throw new Error("the daily notes are off, or their folder is gone");

			const path = dailyNotePathOf(place, date);
			if (this.app.vault.getFileByPath(path) === null) {
				if (!(await confirmDailyNote(this.app, path))) return;
			}

			const file = await createDailyNote(this.app, place, date);
			dressDayCaption(caption, file.path);
			await this.app.workspace.getLeaf("tab").openFile(file);
		} catch (error) {
			new Notice(`Process Tracker: ${message(error)}`);
		}
	}

	/**
	 * Opens one entry in a new tab, as a click on a cell of one entry does: a note as it is, a
	 * record as its journal scrolled to the heading. The line is asked of the metadata cache at
	 * the moment of the click; a record the cache has not read yet opens its journal at the top.
	 */
	private async openEntry(id: string, trackPath: string): Promise<void> {
		const path = readEntryId(id).path;
		const file = this.app.vault.getFileByPath(path);
		if (file === null) {
			new Notice(`Process Tracker: the entry note "${path}" is gone`);
			return;
		}

		const line = entryAt(this.app, id, trackPath)?.record?.line;
		const state = line === undefined ? undefined : { eState: { line } };
		await this.app.workspace.getLeaf("tab").openFile(file, state);
	}

	/**
	 * Performs what a click asks for ([[expectation]] §8) and repaints the one cell that
	 * changed. Only that cell: a table redrawn on every click would lose its scroll
	 * position, and noticing changes made elsewhere in the vault is the business of the
	 * subscription to `metadataCache`.
	 */
	private async runCellAction(
		target: CellTarget,
		mod: boolean,
		blockMode: EntriesMode | null,
	): Promise<void> {
		const action = cellAction(target.state, target.entryIds.length, mod);
		if (action.kind === "nothing") return;

		try {
			if (action.kind === "create") {
				await this.createFor(target, action.done, blockMode);
				return;
			}

			if (action.kind === "toggleDay") {
				await this.toggleDay(target, action.done);
				return;
			}

			const id = this.liveEntryId(target);
			if (id === null) {
				throw new Error(`the entry of ${target.date} is no longer where the table left it`);
			}

			if (action.kind === "toggle") {
				await setEntryDone(this.app, id, action.done);
				paintCell(target.cell, [this.written(id, target, action.done)]);
				return;
			}
			await this.openEntry(id, target.trackPath);
		} catch (error) {
			new Notice(`Process Tracker: ${message(error)}`);
		}
	}

	/**
	 * Makes the entry of an empty day — a note, or a record in the journal of the track — by
	 * the mode of the track: its card first, then the code block, then the settings
	 * ([[entry#Журнал трека|entry]]). The card is read at the click, not at the render, so a
	 * mode just changed in it counts at once.
	 */
	private async createFor(
		target: CellTarget,
		done: boolean,
		blockMode: EntriesMode | null,
	): Promise<void> {
		const card = this.app.vault.getFileByPath(target.trackPath);
		const cardMode = card === null ? null : toTrackCard(this.app, card).entries;
		const mode = resolveEntriesMode(cardMode, blockMode, this.settings.entries);

		if (mode === "journal") {
			const record = await createRecord(
				this.app,
				target.trackPath,
				target.date,
				done,
				fillDayTemplate,
			);
			paintCell(target.cell, [record]);
			return;
		}

		const file = await createEntry(
			this.app,
			target.trackPath,
			target.date,
			done,
			this.settings.entryFolder,
		);
		paintCell(target.cell, [this.written(file.path, target, done)]);
	}

	/**
	 * Closes or opens every entry of one day at once ([[expectation]] §8).
	 *
	 * A note that will not take the change does not stop the others, and it does not pass in
	 * silence either: the count and the first reason go into a `Notice`. The cell is repainted
	 * from what was asked only when every note took it; otherwise it is left to the
	 * subscription, which recounts the day from the vault as the writes land.
	 */
	private async toggleDay(target: CellTarget, done: boolean): Promise<void> {
		const refused: string[] = [];
		for (const id of target.entryIds) {
			try {
				await setEntryDone(this.app, id, done);
			} catch (error) {
				refused.push(message(error));
			}
		}

		if (refused.length === 0) {
			paintCell(
				target.cell,
				target.entryIds.map((id) => this.written(id, target, done)),
			);
			return;
		}
		throw new Error(
			`${refused.length} of ${target.entryIds.length} entries of ${target.date} ` +
				`did not take the change: ${refused[0]}`,
		);
	}

	/**
	 * The address of the one entry behind a cell — asked for only where the cell holds one.
	 *
	 * The path written into the cell can go stale between renders — Templater moves a new
	 * note while it renders it — so a path that leads nowhere is answered by looking the day
	 * up in the vault again, not by opening a link, which would quietly create an empty note
	 * at the old address. A day that has meanwhile grown a second entry is not chosen from:
	 * the click reports that the day moved on, and the next render draws it as it is.
	 *
	 * A record is taken as the cell names it: its address holds no line to go stale, and the
	 * write finds it again in the text of the journal.
	 */
	private liveEntryId(target: CellTarget): string | null {
		const written = target.entryIds[0];
		if (written !== undefined) {
			const address = readEntryId(written);
			if (address.record !== null) return written;
			if (this.app.vault.getFileByPath(address.path) !== null) return written;
		}

		const index = buildEntryIndex(collectEntries(this.app));
		const day = findEntries(index, target.trackPath, target.date);
		return day.length === 1 ? day[0].path : null;
	}
}

function message(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
