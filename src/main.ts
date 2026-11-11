// Process Tracker — plugin entry point.
// Wires the pure layers together: parse -> select -> date grid -> render.

import { Notice, Plugin, debounce } from "obsidian";
import type { EventRef, Events, MarkdownPostProcessorContext, TFile } from "obsidian";
import type {
	EntriesMode,
	Entry,
	EntryDays,
	PropertyNames,
	TrackCard,
	TrackerOptions,
} from "./model/types.ts";
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
import { recountNested } from "./entry/nested.ts";
import { belongsTo, recountDay, touchedDays } from "./entry/refresh.ts";
import type { CellRef } from "./entry/refresh.ts";
import {
	collectEntries,
	collectJournalEntries,
	entryAt,
	journalEntries,
	journalsOf,
	toEntries,
} from "./entry/source.ts";
import {
	buildEntryIndex,
	byId,
	countedEntries,
	entryId,
	findEntries,
	readEntryId,
} from "./entry/state.ts";
import { createEntry, createRecord, setEntryDone } from "./entry/write.ts";
import { TrackerBlock } from "./render/block.ts";
import { TrackerRenderChild } from "./render/child.ts";
import { CellPointerChild } from "./render/pointer.ts";
import type { CellTarget } from "./render/pointer.ts";
import { ColumnResizeChild, writeWidth } from "./render/resize.ts";
import {
	cellOf,
	cellsOfRow,
	cellsShowing,
	descendantsOfRow,
	dressDayCaption,
	entryIdsOf,
	nestedOf,
	paintCell,
	readCellRef,
	renderError,
	renderTracker,
	renderWarnings,
	rowsOfJournal,
	rowsWithDescendants,
} from "./render/table.ts";
import { ProcessTrackerSettingTab } from "./settings-tab.ts";
import { DEFAULT_SETTINGS, normalizeSettings } from "./settings.ts";
import type { ProcessTrackerSettings } from "./settings.ts";
import { applyTrackFilter, dataviewState } from "./tracks/dataview.ts";
import { trackParents } from "./tracks/links.ts";
import { selectTracks } from "./tracks/select.ts";
import { toTrackCard } from "./tracks/source.ts";
import { buildTrackTree, descendantsOf } from "./tracks/tree.ts";

/**
 * How long Dataview has to stay silent before a block drawn during indexing asks for its rows
 * again: long enough to sit out the stream of notes it reads at startup, short enough to go
 * unnoticed.
 */
const INDEX_QUIET_MS = 500;

/** One entry the plugin has just written: its address, and what it is after the write. */
interface Write {
	id: string;
	/** An entry for each track it belongs to; none when the note is no entry any more. */
	entries: readonly Entry[];
}

export default class ProcessTrackerPlugin extends Plugin {
	settings: ProcessTrackerSettings = { ...DEFAULT_SETTINGS };

	/** Tables the reader has on screen; each one leaves when Obsidian unloads its block. */
	private readonly tables = new Set<HTMLElement>();

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

	/** What the properties are called in this vault, as the settings say now. */
	private get names(): PropertyNames {
		return this.settings.properties;
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
		const block = new TrackerBlock(element);
		context.addChild(block);

		const draw = (): string | null => this.drawBlock(source, block, context);
		const shown = draw();
		if (shown !== null && dataviewState(this.app) === "indexing") {
			this.followIndexing(block, shown, () => this.rowsOf(source, context.sourcePath), draw);
		}
	}

	/**
	 * Draws the table of a block in place of whatever it showed. Answers with the rows it drew,
	 * as a key, when the rows depend on Dataview — a `track` filter — and `null` otherwise.
	 */
	private drawBlock(
		source: string,
		block: TrackerBlock,
		context: MarkdownPostProcessorContext,
	): string | null {
		block.clear();
		const element = block.containerEl;
		const sourcePath = context.sourcePath;
		try {
			const { options, warnings } = parseCodeBlock(source);

			const { cards, notes } = this.scanVault();
			const tagged = selectTracks(cards, this.settings.trackTag, options.sort);
			const tracks = applyTrackFilter(this.app, tagged, options.track, sourcePath, warnings);
			const descendants = this.descendantsOf(tracks, tagged);
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

			// Notes are found wherever they lie; records only in the journals of these tracks
			// and of the tracks below them, whose entries count in the cells of the rows.
			const journals = new Set(tracks.map((track) => track.path));
			for (const below of descendants.values()) {
				for (const path of below) journals.add(path);
			}
			const entries = [
				...notes,
				...collectJournalEntries(this.app, Array.from(journals), this.names),
			];

			const elements = renderTracker(element, {
				tracks,
				columns,
				entries: buildEntryIndex(entries),
				descendants,
				dailyNotes: place === null ? new Map() : findDailyNotes(this.app, place, days),
				dailyNotesCreatable: place !== null,
				trackColor: options.trackColor,
				stroke: options.stroke,
				dates: options.dates,
				title: options.title,
				// The block decides for itself; where it says nothing, the settings do.
				align: options.align ?? this.settings.align,
				width: options.width,
				trackTag: this.settings.trackTag,
				trackFilter: options.track,
			});
			renderWarnings(element, warnings);

			if (elements !== null) {
				// The day captions carry no month, so the corner caption follows the scroll.
				block.hold(
					new TrackerRenderChild(
						element,
						elements.frame,
						elements.scroll,
						elements.captionCell,
						elements.probe,
						columns,
						options.title,
						this.tables,
					),
				);
				block.hold(
					new CellPointerChild(
						element,
						elements.frame,
						this.app,
						sourcePath,
						(target, mod) => {
							void this.runCellAction(target, mod, options.entries);
						},
						{
							toggle: (entry, done, date) => this.toggleEntry(entry, done, date),
							open: (entry) => {
								void this.openEntry(entryId(entry), entry.trackPath);
							},
						},
						(caption, date) => {
							void this.newDailyNote(caption, date, options.dailyNoteDir);
						},
						this.names,
					),
				);
				block.hold(
					new ColumnResizeChild(
						element,
						elements.frame,
						elements.resizer,
						options.width,
						(width) => this.keepWidth(context, element, source, width),
					),
				);
			}
			return options.track === null ? null : rowKey(tracks);
		} catch (error) {
			renderError(element, error instanceof Error ? error.message : String(error));
			return null;
		}
	}

	/**
	 * The rows of a block: cards with the plugin tag, in order, narrowed by `track`. The tag
	 * filter comes first: the `track` expression then works on a handful of track cards instead
	 * of the whole vault.
	 */
	private filterTracks(
		cards: TrackCard[],
		options: TrackerOptions,
		sourcePath: string,
		warnings: string[],
	): TrackCard[] {
		const tagged = selectTracks(cards, this.settings.trackTag, options.sort);
		return applyTrackFilter(this.app, tagged, options.track, sourcePath, warnings);
	}

	/**
	 * The tracks below each row that has any ([[nested-tracks]]): its children, their children
	 * and so on, whether the block shows them as rows or not.
	 *
	 * The tree is built over every card with the plugin tag, in the order of the block's `sort`:
	 * a track below a row need not pass the `track` filter of the block, and the popup lists
	 * what stands below a track in the order the table lists its rows. Only the tagged cards
	 * are asked for their parents — a handful of lookups in the metadata cache.
	 */
	private descendantsOf(rows: TrackCard[], tagged: TrackCard[]): Map<string, string[]> {
		const names = this.names;
		const tree = buildTrackTree(
			tagged.map((card) => ({ path: card.path, parents: trackParents(this.app, card.path, names) })),
		);

		const descendants = new Map<string, string[]>();
		if (tree.children.size === 0) return descendants;
		for (const row of rows) {
			const below = descendantsOf(tree, row.path);
			if (below.length > 0) descendants.set(row.path, below);
		}
		return descendants;
	}

	/** The rows a block would draw now, as a key; `null` when the block cannot be read. */
	private rowsOf(source: string, sourcePath: string): string | null {
		try {
			const { options } = parseCodeBlock(source);
			const cards = this.app.vault
				.getMarkdownFiles()
				.map((file) => toTrackCard(this.app, file, this.names));
			return rowKey(this.filterTracks(cards, options, sourcePath, []));
		} catch {
			return null;
		}
	}

	/**
	 * Draws a block again once Dataview has read the notes it was still reading when the block
	 * was drawn ([[track-selection]]).
	 *
	 * Until a note is read, Dataview leaves it out of `pages`, so a `track` filter asked early
	 * comes back short — or empty. Reading view draws a block once and keeps it, and a canvas card
	 * or a note open at startup went on showing "nothing matches" long after.
	 *
	 * Dataview says that it has read everything only once every note has come back; one note that
	 * never does, and the word never comes. What it does say, every time, is that it has read one
	 * more note. So the block waits for those to fall quiet, asks for its rows again, and is drawn
	 * again only if they have changed. Rows that stayed the same end the wait — and so does the
	 * word that the index is ready.
	 */
	private followIndexing(
		block: TrackerBlock,
		shown: string,
		rows: () => string | null,
		draw: () => string | null,
	): void {
		// Dataview speaks on the metadata cache, under names Obsidian does not type.
		const cache: Events = this.app.metadataCache;
		const refs: EventRef[] = [];
		const stop = (): void => {
			for (const ref of refs) cache.offref(ref);
		};
		const settle = (): void => {
			const now = rows();
			if (now === null || now === shown) {
				stop();
				return;
			}
			shown = draw() ?? now;
			if (dataviewState(this.app) !== "indexing") stop();
		};

		const quiet = debounce(settle, INDEX_QUIET_MS, true);
		refs.push(cache.on("dataview:metadata-change", () => quiet()));
		refs.push(
			cache.on("dataview:index-ready", () => {
				quiet.cancel();
				settle();
				stop();
			}),
		);
		for (const ref of refs) block.registerEvent(ref);
		block.register(() => quiet.cancel());
	}

	/**
	 * Track cards and entry notes in one pass over the vault: both are read off the same
	 * metadata cache, and a render must not walk thousands of notes twice.
	 */
	private scanVault(): { cards: TrackCard[]; notes: Entry[] } {
		const cards: TrackCard[] = [];
		const notes: Entry[] = [];
		const names = this.names;
		for (const file of this.app.vault.getMarkdownFiles()) {
			cards.push(toTrackCard(this.app, file, names));
			for (const entry of toEntries(this.app, file, names)) notes.push(entry);
		}
		return { cards, notes };
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
	 * that keeps its own journal is a journal to this handler. Nor is the link of a card to its
	 * parent watched: which tracks stand below a row is the word of the render
	 * ([[nested-tracks]]).
	 */
	private refresh(file: TFile, gone = false): void {
		if (this.tables.size === 0) return;

		const entries = gone ? [] : toEntries(this.app, file, this.names);
		this.repaint([{ id: file.path, entries }]);

		// Whether a track keeps the changed note as its journal is asked of each track once,
		// however many rows and tables have it below them.
		const answers = new Map<string, boolean>();
		const keeps = (trackPath: string): boolean => {
			let answer = answers.get(trackPath);
			if (answer === undefined) {
				answer = journalsOf(this.app, trackPath, this.names).some(
					(journal) => journal.path === file.path,
				);
				answers.set(trackPath, answer);
			}
			return answer;
		};
		for (const table of this.tables) this.recountJournal(table, file.path, keeps);
	}

	/**
	 * Recounts, in one table, every row the changed journal can change: the rows of the tracks
	 * that keep the note as their journal, and the rows that have such a track below them
	 * ([[nested-tracks]]).
	 *
	 * The records of the row are read again from the metadata cache — the headings and the boxes
	 * of two notes at most — and the notes the cells name are read as `paint` reads them. Lines
	 * move with every record written above them, so the whole row is repainted, not the day the
	 * change was in: the addresses in the cells have to follow.
	 *
	 * Below the row the same is done for the tracks that keep the journal: their records are
	 * read again, the records the cells showed of them — and of the changed note, whoever kept
	 * it — are dropped, and every other entry from below is read by its address.
	 */
	private recountJournal(
		table: HTMLElement,
		path: string,
		keeps: (trackPath: string) => boolean,
	): void {
		for (const row of rowsOfJournal(table, path, keeps)) {
			const trackPath = row.dataset.track ?? "";
			const records = journalEntries(this.app, trackPath, this.names);
			const below = descendantsOfRow(row);
			const keepers = below.filter(keeps);
			const recordsBelow = collectJournalEntries(this.app, keepers, this.names);

			for (const cell of cellsOfRow(row)) {
				const day = readCellRef(cell);
				if (day === null) continue;

				const entries = records.filter((record) => belongsTo(record, day));
				for (const id of entryIdsOf(cell)) {
					if (readEntryId(id).record !== null) continue;
					const note = entryAt(this.app, id, trackPath, this.names);
					if (note !== null && belongsTo(note, day)) entries.push(note);
				}

				const nested: Entry[] = [];
				for (const ref of nestedOf(cell)) {
					const address = readEntryId(ref.id);
					const reread = address.path === path || keepers.includes(ref.trackPath);
					if (address.record !== null && reread) continue;
					const entry = entryAt(this.app, ref.id, ref.trackPath, this.names);
					if (entry !== null) nested.push(entry);
				}
				paintCell(
					cell,
					entries.sort(byId),
					recountNested(day.date, below, nested, recordsBelow),
				);
			}
		}
	}

	/**
	 * Recounts, in every table on screen, the days the changed entries touch: the days whose
	 * cells show them and the days they claim now ([[entry]]). An entry closed elsewhere
	 * appears in the day of its closing, and the day it was made keeps it as a trace. The same
	 * days are recounted in the rows of the tracks above the entry's own, whose cells it closes
	 * too ([[nested-tracks]]).
	 *
	 * A day is counted, not guessed: the cell names the entries behind it, and each of them is
	 * read again from the metadata cache — a lookup in memory, no disk — save the changed ones,
	 * which are taken as given. So a day that holds two entries answers for both, and an entry
	 * that left the day leaves the rest of it standing. The work is bounded by the entries of
	 * the days touched, not by the size of the vault.
	 */
	private repaint(writes: readonly Write[]): void {
		const ids = writes.map((write) => write.id);
		const changed = writes.flatMap((write) => write.entries);

		for (const table of this.tables) {
			const shown: CellRef[] = [];
			for (const id of ids) {
				for (const cell of cellsShowing(table, id)) {
					const day = readCellRef(cell);
					if (day !== null) shown.push(day);
				}
			}

			// The rows with tracks below them are asked for only where an entry stands to be
			// placed: an event about a note that is no entry stops here.
			const above = changed.length === 0 ? [] : rowsWithDescendants(table);
			for (const day of touchedDays(shown, changed, above)) {
				const cell = cellOf(table, day);
				if (cell !== null) this.paint(cell, day, ids, changed);
			}
		}
	}

	/**
	 * Repaints one cell from the entries of its day: every entry the cell names is read again
	 * from the metadata cache, and the entries the caller knows better are taken as given — as
	 * the event brought them, or as a write has just left them. The entries below the track of
	 * the cell are counted the same way, each read as an entry of the track the cell names for
	 * it ([[nested-tracks]]).
	 */
	private paint(
		cell: HTMLElement,
		day: CellRef,
		known: readonly string[],
		changed: readonly Entry[],
	): void {
		const rest: Entry[] = [];
		for (const id of entryIdsOf(cell)) {
			if (known.includes(id)) continue;
			const entry = entryAt(this.app, id, day.trackPath, this.names);
			if (entry !== null) rest.push(entry);
		}

		const restBelow: Entry[] = [];
		for (const ref of nestedOf(cell)) {
			if (known.includes(ref.id)) continue;
			const entry = entryAt(this.app, ref.id, ref.trackPath, this.names);
			if (entry !== null) restBelow.push(entry);
		}

		const below = descendantsOfRow(cell.parentElement);
		paintCell(
			cell,
			recountDay(day, rest, changed),
			recountNested(day.date, below, restBelow, changed),
		);
	}

	/**
	 * An entry as a write has just left it, as an entry of every track it belongs to.
	 *
	 * The metadata cache catches up a moment after the write, so the days are taken as the
	 * write answered them; the tracks and the mark, which the write does not touch, are read
	 * from the cache, where they have been all along — a draft closed by a click shows its mark
	 * at once. An entry the cache has not read yet is an entry of the track clicked, with no
	 * mark to show until it has.
	 */
	private afterWrite(id: string, trackPath: string, days: EntryDays | null): Entry[] {
		if (days === null) return [];

		const address = readEntryId(id);
		if (address.record !== null) {
			const known = entryAt(this.app, id, trackPath, this.names);
			const record = known?.record ?? {
				nth: address.record.nth,
				heading: address.record.date,
				line: 0,
			};
			return [{ path: address.path, trackPath, ...days, mark: known?.mark ?? null, record }];
		}

		const file = this.app.vault.getFileByPath(address.path);
		const known = file === null ? [] : toEntries(this.app, file, this.names);
		if (known.length === 0) {
			return [{ path: address.path, trackPath, ...days, mark: null, record: null }];
		}
		return known.map((entry) => ({ ...entry, ...days }));
	}

	/**
	 * Closes or opens one entry on the day of the list it was pressed in — the list a day opens
	 * on hover ([[expectation]] §8).
	 *
	 * The days it touches are repainted at once, with the entry taken as the write left it: the
	 * file is written, but the metadata cache catches up a moment later, and reading it here
	 * would answer with the state before the write. The answer says whether the file took the
	 * change, so the box of the list can follow it.
	 */
	private async toggleEntry(entry: Entry, done: boolean, date: string): Promise<boolean> {
		const id = entryId(entry);
		let days: EntryDays | null;
		try {
			days = await setEntryDone(this.app, id, done, date, this.names);
		} catch (error) {
			new Notice(`Process Tracker: ${message(error)}`);
			return false;
		}

		this.repaint([{ id, entries: this.afterWrite(id, entry.trackPath, days) }]);
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
	 * Keeps the width the first column was dragged to in the code block of its table, or takes
	 * the line out after a double click ([[rendering]]). Answers whether the note took it: where
	 * it could not, the column stays as dragged until the block is drawn again, and nothing is
	 * said — a failure to write is the only thing worth a `Notice`.
	 */
	private async keepWidth(
		context: MarkdownPostProcessorContext,
		element: HTMLElement,
		source: string,
		width: number | null,
	): Promise<boolean> {
		try {
			return await writeWidth(this.app, context, element, source, width);
		} catch (error) {
			new Notice(`Process Tracker: ${message(error)}`);
			return false;
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

		const line = entryAt(this.app, id, trackPath, this.names)?.record?.line;
		const state = line === undefined ? undefined : { eState: { line } };
		await this.app.workspace.getLeaf("tab").openFile(file, state);
	}

	/**
	 * Performs what a click asks for ([[expectation]] §8) and repaints the days that changed:
	 * the cell clicked, and the other day of an entry closed or opened there. Only those: a
	 * table redrawn on every click would lose its scroll position, and noticing changes made
	 * elsewhere in the vault is the business of the subscription to `metadataCache`.
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
				const days = await setEntryDone(this.app, id, action.done, target.date, this.names);
				this.repaint([{ id, entries: this.afterWrite(id, target.trackPath, days) }]);
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
		const cardMode = card === null ? null : toTrackCard(this.app, card, this.names).entries;
		const mode = resolveEntriesMode(cardMode, blockMode, this.settings.entries);

		if (mode === "journal") {
			const record = await createRecord(
				this.app,
				target.trackPath,
				target.date,
				done,
				fillDayTemplate,
				this.names,
			);
			this.repaint([{ id: entryId(record), entries: [record] }]);
			return;
		}

		const file = await createEntry(
			this.app,
			target.trackPath,
			target.date,
			done,
			this.settings.entryFolder,
			this.names,
		);
		// Made on the day of the cell, and closed on it when the click asked for that.
		const made: Entry = {
			path: file.path,
			trackPath: target.trackPath,
			created: target.date,
			closed: done ? target.date : null,
			mark: null,
			record: null,
		};
		this.repaint([{ id: file.path, entries: [made] }]);
	}

	/**
	 * Closes or opens every entry the day counts, at once ([[expectation]] §8). An entry that
	 * only left a trace here, closed on another day, is not among them.
	 *
	 * A note that will not take the change does not stop the others, and it does not pass in
	 * silence either: the count and the first reason go into a `Notice`. The days are repainted
	 * from the writes that went through; the notes that refused are read from the vault as they
	 * are, unchanged.
	 */
	private async toggleDay(target: CellTarget, done: boolean): Promise<void> {
		const writes: Write[] = [];
		const refused: string[] = [];
		for (const id of target.entryIds) {
			try {
				const days = await setEntryDone(this.app, id, done, target.date, this.names);
				writes.push({ id, entries: this.afterWrite(id, target.trackPath, days) });
			} catch (error) {
				refused.push(message(error));
			}
		}

		this.repaint(writes);
		if (refused.length === 0) return;
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

		const index = buildEntryIndex(collectEntries(this.app, this.names));
		const day = countedEntries(findEntries(index, target.trackPath, target.date), target.date);
		return day.length === 1 ? entryId(day[0]) : null;
	}
}

/** The rows of a table as one string, to tell whether two drawings show the same tracks. */
function rowKey(tracks: TrackCard[]): string {
	return tracks.map((track) => track.path).join("\n");
}

function message(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
