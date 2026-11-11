// Process Tracker — writing an entry: creating a note or a record, and switching its `done`.
// Adapter module: the only place in the plugin that changes entries.

import type { App, CachedMetadata, TFile } from "obsidian";
import { toDayTime } from "../dates/grid.ts";
import type { Entry, EntryDays, PropertyNames } from "../model/types.ts";
import { trackDisplayName } from "../tracks/select.ts";
import {
	composeEntry,
	entryFileName,
	entryPath,
	normalizeFolder,
	recordBody,
} from "./compose.ts";
import { insertRecord, setRecordDone } from "./journal.ts";
import { frontmatterLink, linkedJournal } from "./source.ts";
import { readDate, readDays, readEntryId } from "./state.ts";

/** How many names are tried before a folder is declared hopeless. */
const NAME_ATTEMPTS = 100;

/**
 * Creates the entry note behind one cell and returns it.
 *
 * The note is made on the day of the cell: `created` is that day, and an entry made done is
 * closed on it too, at the time of the click ([[expectation]] §6).
 *
 * Everything the note needs is written before the file appears, in one `create`: Templater
 * renders `<% %>` on the content it finds, so a second pass over the frontmatter would race
 * it for the same file.
 */
export async function createEntry(
	app: App,
	trackPath: string,
	date: string,
	done: boolean,
	folder: string,
	names: PropertyNames,
	now: Date = new Date(),
): Promise<TFile> {
	const card = app.vault.getFileByPath(trackPath);
	if (card === null) throw new Error(`the track card "${trackPath}" is gone`);

	const cache = app.metadataCache.getFileCache(card);
	const frontmatter = (cache?.frontmatter ?? {}) as Record<string, unknown>;
	const name = entryFileName(trackDisplayName(frontmatter, card.basename, names.trackName), date);
	const path = freePath(app, folder, name);
	const template = templateOf(app, card, cache, names.template);
	if (template?.file === null) {
		throw new Error(`the template "${template.link}" of "${card.basename}" is gone`);
	}
	const text = template === null ? null : await app.vault.cachedRead(template.file);

	// The link is generated the way this vault writes links, so the settings for wikilinks
	// and for relative paths hold in the note the plugin makes.
	const link = app.fileManager.generateMarkdownLink(card, path);

	const closed = done ? toDayTime(date, now) : null;
	await ensureFolder(app, folder);
	return await app.vault.create(
		path,
		composeEntry(text, { track: link, created: date, done, closed }, names),
	);
}

/**
 * Writes a new record into the journal of a track and returns it as an entry
 * ([[entry#Журнал трека|entry]]).
 *
 * The journal is the note the card links to in `journal`, or the card itself. A link that
 * leads nowhere yet is a journal still to be made: the note is created with `# Journal` and the
 * record under it.
 * The body is the template of the card without its properties and its Templater commands,
 * filled in for the day of the record by `fill` — the placeholders of a daily note, which only Obsidian's moment can read,
 * so the caller hands it in. A template that is named but missing is left out in silence:
 * here it would cost one line of text, not a vault of notes.
 *
 * The text is changed through `vault.process`, which hands over the file as it is on disk at
 * that moment, so the place of the record is counted from the text and not from the metadata
 * cache, which catches up later.
 */
export async function createRecord(
	app: App,
	trackPath: string,
	date: string,
	done: boolean,
	fill: (template: string, date: string) => string,
	names: PropertyNames,
): Promise<Entry> {
	const card = app.vault.getFileByPath(trackPath);
	if (card === null) throw new Error(`the track card "${trackPath}" is gone`);

	const cache = app.metadataCache.getFileCache(card);
	const template = templateOf(app, card, cache, names.template)?.file ?? null;
	const body =
		template === null ? "" : fill(recordBody(await app.vault.cachedRead(template)), date);

	const journal = linkedJournal(app, card, names);
	const file = journal.link === null ? card : journal.file;

	if (file === null) {
		const link = journal.link ?? "";
		if (app.metadataCache.getFirstLinkpathDest(link, card.path) !== null) {
			throw new Error(`the journal "${link}" of "${card.basename}" is not a note`);
		}
		const path = newJournalPath(app, card, link);
		const record = insertRecord("", date, done, body, true);
		await ensureFolder(app, path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "");
		const made = await app.vault.create(path, record.text);
		return recordEntry(made.path, trackPath, date, done, record);
	}

	let written = { nth: 0, line: 0 };
	await app.vault.process(file, (text) => {
		const record = insertRecord(text, date, done, body, file.path === card.path);
		written = record;
		return record.text;
	});
	return recordEntry(file.path, trackPath, date, done, written);
}

/**
 * Closes or opens the entry at this address on one day — the day of the cell or of the list
 * the click was made in — and answers with the days the entry stands in after the write:
 * `null` when the note is no entry any more.
 *
 * A record has its box switched and nothing else ([[entry#Переключение и открытие|entry]]). A
 * note gets `done`, and with it `closed`: a note closed is closed on that day at the time of
 * the click, `YYYY-MM-DD HH:mm`, and a note opened loses its `closed`. A click on a day means
 * "done on this day", so a mark set for yesterday is closed yesterday, and an entry closed on
 * another day moves its closing to this one ([[expectation]] §8).
 *
 * A note with the `date` of an earlier version gets `done` alone: it stands in that day and
 * needs no `closed` to say so. Every other property of the note — a status of a task among
 * them — is left as it is.
 */
export async function setEntryDone(
	app: App,
	id: string,
	done: boolean,
	day: string,
	names: PropertyNames,
	now: Date = new Date(),
): Promise<EntryDays | null> {
	const address = readEntryId(id);
	const record = address.record;
	const file = app.vault.getFileByPath(address.path);
	if (file === null) {
		throw new Error(`the ${record === null ? "entry note" : "journal"} "${address.path}" is gone`);
	}

	if (record !== null) {
		await app.vault.process(file, (text) => setRecordDone(text, record.date, record.nth, done));
		return { created: record.date, closed: done ? record.date : null };
	}

	let days: EntryDays | null = null;
	await app.fileManager.processFrontMatter(file, (frontmatter: Record<string, unknown>) => {
		frontmatter[names.done] = done;
		if (readDate(frontmatter[names.date]) === null) {
			if (done) frontmatter[names.closed] = toDayTime(day, now);
			else delete frontmatter[names.closed];
		}
		days = readDays(frontmatter, names);
	});
	return days;
}

/**
 * The template the track card names: the link, and the note it leads to — `null` when the
 * link leads nowhere. No template named at all is `null` for the whole answer.
 */
function templateOf(
	app: App,
	card: TFile,
	cache: CachedMetadata | null,
	key: string,
): { link: string; file: TFile | null } | null {
	if (cache === null) return null;

	const frontmatter = (cache.frontmatter ?? {}) as Record<string, unknown>;
	const link = frontmatterLink(cache, frontmatter, key);
	if (link === null) return null;
	return { link, file: app.metadataCache.getFirstLinkpathDest(link, card.path) };
}

/**
 * Where a journal the card links to is made, when the link leads nowhere yet. A link with a
 * folder in it is a path from the vault root; a bare name goes where Obsidian puts a note made
 * from a link in that card — the place a click on the unresolved link would have made it.
 */
function newJournalPath(app: App, card: TFile, link: string): string {
	const name = normalizeFolder(link.toLowerCase().endsWith(".md") ? link : `${link}.md`);
	if (name.includes("/")) return name;
	const parent = normalizeFolder(app.fileManager.getNewFileParent(card.path, name).path);
	return parent === "" ? name : `${parent}/${name}`;
}

function recordEntry(
	path: string,
	trackPath: string,
	date: string,
	done: boolean,
	written: { nth: number; line: number },
): Entry {
	return {
		path,
		trackPath,
		created: date,
		closed: done ? date : null,
		// The heading the plugin writes is the date alone: a new record has no mark.
		mark: null,
		record: { nth: written.nth, heading: date, line: written.line },
	};
}

/** The first free path: `name.md`, then `name 2.md`, `name 3.md`. */
function freePath(app: App, folder: string, name: string): string {
	for (let attempt = 1; attempt <= NAME_ATTEMPTS; attempt++) {
		const path = entryPath(folder, attempt === 1 ? name : `${name} ${attempt}`);
		if (app.vault.getAbstractFileByPath(path) === null) return path;
	}
	throw new Error(`"${name}" is taken, and so are ${NAME_ATTEMPTS} names after it`);
}

async function ensureFolder(app: App, folder: string): Promise<void> {
	const clean = normalizeFolder(folder);
	if (clean === "" || app.vault.getFolderByPath(clean) !== null) return;
	await app.vault.createFolder(clean);
}
