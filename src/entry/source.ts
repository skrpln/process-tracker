// Process Tracker — reading entries out of the Obsidian metadata cache: entry notes, and the
// records of track journals. Adapter module: resolves links against the vault, reads no file.

import type { App, CachedMetadata, TFile } from "obsidian";
import {
	ENTRY_DATE_KEY,
	ENTRY_DONE_KEY,
	ENTRY_MARK_KEY,
	ENTRY_TRACK_KEY,
	TRACK_JOURNAL_KEY,
} from "../constants.ts";
import type { Entry } from "../model/types.ts";
import { readRecords } from "./journal.ts";
import type { JournalRecord, Outline } from "./journal.ts";
import { readDate, readDone, readEntryId, readMark, readTrackLink } from "./state.ts";

/**
 * Every entry note of the vault. A note counts as an entry when it names a track
 * card and a date — the two properties the plugin identifies it by ([[expectation]] §6)
 * — however it was created: by the tracker, by a template or by hand.
 */
export function collectEntries(app: App): Entry[] {
	const entries: Entry[] = [];
	for (const file of app.vault.getMarkdownFiles()) {
		const entry = toEntry(app, file);
		if (entry !== null) entries.push(entry);
	}
	return entries;
}

/**
 * The entry at this address as the metadata cache has it; `null` when it is gone or is no
 * entry. A record belongs to the track of the cell that names it: the address says where the
 * record stands, the cell says whose journal that is.
 */
export function entryAt(app: App, id: string, trackPath: string): Entry | null {
	const address = readEntryId(id);
	const file = app.vault.getFileByPath(address.path);
	if (file === null) return null;
	if (address.record === null) return toEntry(app, file);

	const { date, nth } = address.record;
	const records = recordsIn(app, file, trackPath);
	return records.find((entry) => entry.date === date && entry.record?.nth === nth) ?? null;
}

export function toEntry(app: App, file: TFile): Entry | null {
	const cache = app.metadataCache.getFileCache(file);
	const frontmatter = cache?.frontmatter;
	if (cache === null || cache === undefined || frontmatter === undefined) return null;

	const date = readDate(frontmatter[ENTRY_DATE_KEY]);
	if (date === null) return null;

	const link = frontmatterLink(cache, frontmatter, ENTRY_TRACK_KEY);
	if (link === null) return null;

	// The link is resolved the way Obsidian resolves it in the note itself, so a bare
	// `[[cleaning]]` finds the card wherever it lies.
	const target = app.metadataCache.getFirstLinkpathDest(link, file.path);
	if (target === null) return null;

	return {
		path: file.path,
		trackPath: target.path,
		date,
		done: readDone(frontmatter[ENTRY_DONE_KEY]),
		mark: readMark(frontmatter[ENTRY_MARK_KEY]),
		record: null,
	};
}

/**
 * The records of the journals of these tracks ([[entry#Журнал трека|entry]]). Only the tracks of
 * the table are asked, and each of them has two places at most: the card and the note its
 * `journal` links to. Nothing is walked, and no file is read — the headings and the boxes are
 * in the metadata cache already.
 *
 * Both places are asked whatever the mode of the track: the mode decides how an entry is made,
 * and a track that changed its mind keeps the history it has.
 */
export function collectJournalEntries(app: App, trackPaths: readonly string[]): Entry[] {
	return trackPaths.flatMap((trackPath) => journalEntries(app, trackPath));
}

/** The records of the journals of one track, the card's own first. */
export function journalEntries(app: App, trackPath: string): Entry[] {
	return journalsOf(app, trackPath).flatMap((file) => recordsIn(app, file, trackPath));
}

/** The notes a track keeps records in: the card, and the note its `journal` links to. */
export function journalsOf(app: App, trackPath: string): TFile[] {
	const card = app.vault.getFileByPath(trackPath);
	if (card === null) return [];

	const linked = linkedJournal(app, card).file;
	return linked === null || linked.path === card.path ? [card] : [card, linked];
}

/**
 * The journal a card links to: the link as written, and the note it leads to — `null` while
 * there is none yet, or when it leads to something that is not a note.
 */
export function linkedJournal(app: App, card: TFile): { link: string | null; file: TFile | null } {
	const cache = app.metadataCache.getFileCache(card);
	const frontmatter = cache?.frontmatter;
	if (cache === null || cache === undefined || frontmatter === undefined) {
		return { link: null, file: null };
	}

	const link = frontmatterLink(cache, frontmatter, TRACK_JOURNAL_KEY);
	if (link === null) return { link: null, file: null };
	const file = app.metadataCache.getFirstLinkpathDest(link, card.path);
	return { link, file: file !== null && file.extension === "md" ? file : null };
}

/** The records of one note, as entries of this track. */
function recordsIn(app: App, file: TFile, trackPath: string): Entry[] {
	const cache = app.metadataCache.getFileCache(file);
	if (cache === null) return [];
	return readRecords(outlineOf(cache)).map((record) => toRecordEntry(file.path, trackPath, record));
}

/** The headings and the boxes of a note, as the metadata cache lists them. */
export function outlineOf(cache: CachedMetadata): Outline {
	const headings = (cache.headings ?? []).map((heading) => ({
		level: heading.level,
		line: heading.position.start.line,
		end: heading.position.end.line,
		text: heading.heading,
	}));
	const tasks = [];
	for (const item of cache.listItems ?? []) {
		if (item.task !== undefined) tasks.push({ line: item.position.start.line, mark: item.task });
	}
	// The cache does not say how long the note is, and a reader does not need it: nothing lies
	// past the end of a note, so the last record simply runs on. Only a write counts the lines.
	return { headings, tasks, lines: Number.POSITIVE_INFINITY };
}

export function toRecordEntry(path: string, trackPath: string, record: JournalRecord): Entry {
	return {
		path,
		trackPath,
		date: record.date,
		done: record.box?.done ?? false,
		mark: record.mark,
		record: { nth: record.nth, heading: record.heading, line: record.line },
	};
}

/**
 * The link written in a frontmatter property. Obsidian parses links inside frontmatter
 * itself and lists them in `frontmatterLinks` (`track.0` for a list item); the raw
 * property value is the fallback for a vault whose cache carries no such list.
 */
export function frontmatterLink(
	cache: CachedMetadata,
	frontmatter: Record<string, unknown>,
	key: string,
): string | null {
	const own = (cache.frontmatterLinks ?? []).find(
		(link) => link.key === key || link.key.startsWith(`${key}.`),
	);
	if (own !== undefined) return readTrackLink(own.link);
	return readTrackLink(frontmatter[key]);
}
