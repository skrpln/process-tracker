// Process Tracker — reading entries out of the Obsidian metadata cache: entry notes, and the
// records of track journals. Adapter module: resolves links against the vault, reads no file.

import type { App, CachedMetadata, TFile } from "obsidian";
import type { Entry, PropertyNames } from "../model/types.ts";
import { readRecords } from "./journal.ts";
import type { JournalRecord, Outline } from "./journal.ts";
import { readDays, readEntryId, readMark, readTrackLinks } from "./state.ts";

/**
 * Every entry note of the vault, as an entry of each track it links to. A note counts as an
 * entry by its properties ([[expectation]] §6), however it was created: by the tracker, by a
 * template or by hand.
 */
export function collectEntries(app: App, names: PropertyNames): Entry[] {
	const entries: Entry[] = [];
	for (const file of app.vault.getMarkdownFiles()) {
		for (const entry of toEntries(app, file, names)) entries.push(entry);
	}
	return entries;
}

/**
 * The entry at this address as the metadata cache has it; `null` when it is gone or is no
 * entry of this track. A note can be an entry of several tracks, and a record belongs to the
 * track of the cell that names it: the address says where the entry stands, the cell says
 * whose it is.
 */
export function entryAt(
	app: App,
	id: string,
	trackPath: string,
	names: PropertyNames,
): Entry | null {
	const address = readEntryId(id);
	const file = app.vault.getFileByPath(address.path);
	if (file === null) return null;
	if (address.record === null) {
		return toEntries(app, file, names).find((entry) => entry.trackPath === trackPath) ?? null;
	}

	const { date, nth } = address.record;
	const records = recordsIn(app, file, trackPath);
	return records.find((entry) => entry.created === date && entry.record?.nth === nth) ?? null;
}

/**
 * One note as entries: one for each track card its `track` property links to — a single link
 * or a list of them — and none when the note is no entry
 * ([[entry#Что считается свидетельством|entry]]).
 *
 * The days are asked first: they are a few property lookups, and they turn away nearly every
 * note of the vault before a link is resolved.
 */
export function toEntries(app: App, file: TFile, names: PropertyNames): Entry[] {
	const cache = app.metadataCache.getFileCache(file);
	const frontmatter = cache?.frontmatter;
	if (cache === null || cache === undefined || frontmatter === undefined) return [];

	const days = readDays(frontmatter, names);
	if (days === null) return [];

	const mark = readMark(frontmatter[names.mark]);
	const entries: Entry[] = [];
	for (const link of frontmatterLinks(cache, frontmatter, names.track)) {
		// The link is resolved the way Obsidian resolves it in the note itself, so a bare
		// `[[cleaning]]` finds the card wherever it lies.
		const target = app.metadataCache.getFirstLinkpathDest(link, file.path);
		// A list that names one card twice is still one entry of that track.
		if (target === null || entries.some((entry) => entry.trackPath === target.path)) continue;
		entries.push({ path: file.path, trackPath: target.path, ...days, mark, record: null });
	}
	return entries;
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
export function collectJournalEntries(
	app: App,
	trackPaths: readonly string[],
	names: PropertyNames,
): Entry[] {
	return trackPaths.flatMap((trackPath) => journalEntries(app, trackPath, names));
}

/** The records of the journals of one track, the card's own first. */
export function journalEntries(app: App, trackPath: string, names: PropertyNames): Entry[] {
	return journalsOf(app, trackPath, names).flatMap((file) => recordsIn(app, file, trackPath));
}

/** The notes a track keeps records in: the card, and the note its `journal` links to. */
export function journalsOf(app: App, trackPath: string, names: PropertyNames): TFile[] {
	const card = app.vault.getFileByPath(trackPath);
	if (card === null) return [];

	const linked = linkedJournal(app, card, names).file;
	return linked === null || linked.path === card.path ? [card] : [card, linked];
}

/**
 * The journal a card links to: the link as written, and the note it leads to — `null` while
 * there is none yet, or when it leads to something that is not a note.
 */
export function linkedJournal(
	app: App,
	card: TFile,
	names: PropertyNames,
): { link: string | null; file: TFile | null } {
	const cache = app.metadataCache.getFileCache(card);
	const frontmatter = cache?.frontmatter;
	if (cache === null || cache === undefined || frontmatter === undefined) {
		return { link: null, file: null };
	}

	const link = frontmatterLink(cache, frontmatter, names.journal);
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

/** A record has one day, the date of its heading: it is made in it and closed in it. */
export function toRecordEntry(path: string, trackPath: string, record: JournalRecord): Entry {
	return {
		path,
		trackPath,
		created: record.date,
		closed: record.box?.done === true ? record.date : null,
		mark: record.mark,
		record: { nth: record.nth, heading: record.heading, line: record.line },
	};
}

/**
 * The links written in a frontmatter property: one, or a list of them. Obsidian parses links
 * inside frontmatter itself and lists them in `frontmatterLinks` (`track.0` for a list item);
 * the raw property value is the fallback for a vault whose cache carries no such list.
 */
export function frontmatterLinks(
	cache: CachedMetadata,
	frontmatter: Record<string, unknown>,
	key: string,
): string[] {
	const own = (cache.frontmatterLinks ?? []).filter(
		(link) => link.key === key || link.key.startsWith(`${key}.`),
	);
	if (own.length > 0) return readTrackLinks(own.map((link) => link.link));
	return readTrackLinks(frontmatter[key]);
}

/** The link of a property that names one note: the first of `frontmatterLinks`. */
export function frontmatterLink(
	cache: CachedMetadata,
	frontmatter: Record<string, unknown>,
	key: string,
): string | null {
	return frontmatterLinks(cache, frontmatter, key)[0] ?? null;
}
