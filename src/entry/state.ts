// Process Tracker — entries: reading their properties, addressing them, indexing them by day.
// Pure module: no Obsidian API, covered by test/entry.test.ts.

import { toIsoDate } from "../dates/grid.ts";
import type { CellState, Entry, EntryDays, PropertyNames, Standing } from "../model/types.ts";

/** Entries of the vault, keyed by track card and date: one day can hold several. */
export type EntryIndex = ReadonlyMap<string, readonly Entry[]>;

/** The answer for a day nobody wrote about; shared, so a lookup allocates nothing. */
const NO_ENTRIES: readonly Entry[] = Object.freeze([]);

/**
 * Reads a property that names a day — `created`, `closed`, `date` — as `YYYY-MM-DD`. A value
 * with a time (`2026-09-11T07:30`, `2026-11-10 14:30`) keeps its day; anything else is not a
 * date the table can place.
 */
export function readDate(value: unknown): string | null {
	if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : toIsoDate(value);
	if (typeof value !== "string") return null;
	const match = /^\d{4}-\d{2}-\d{2}/.exec(value.trim());
	return match === null ? null : match[0];
}

/**
 * Reads the `done` property. Only a true value checks the box: a missing property, a
 * `false` and anything unreadable leave the entry a draft ([[expectation]] §7).
 * Strings are accepted because a property typed by hand can arrive as text.
 */
export function readDone(value: unknown): boolean {
	if (typeof value === "boolean") return value;
	if (typeof value === "string") {
		const text = value.trim().toLowerCase();
		return text === "true" || text === "yes";
	}
	return false;
}

/** The properties that say whether a note is an entry and which days it stands in. */
export type DayNames = Pick<PropertyNames, "done" | "created" | "closed" | "date">;

/**
 * The days of an entry note, read from its properties; `null` — the note is no entry
 * ([[entry#Что считается свидетельством|entry]]).
 *
 * A note is an entry by its `done`: a vault is full of notes that carry a `created` and link
 * somewhere in `track`, and those two alone make no entry. A note with the `date` of an
 * earlier version is one without `done` too — it was a draft then, and it is read as it was.
 *
 * The note is made on `created` and closed on `closed`, and the time in either is dropped.
 * Where one of them is missing, `date` stands in for it: a note that has nothing but `date`
 * stands in that one day, as it always did. A note with neither `created` nor `date` is made
 * on the day it was closed, and a done note with no `closed` is closed on the day it was made,
 * so no entry is left without a day and a done entry always has one to be closed in.
 */
export function readDays(frontmatter: Record<string, unknown>, names: DayNames): EntryDays | null {
	const date = readDate(frontmatter[names.date]);
	if (date === null && !Object.prototype.hasOwnProperty.call(frontmatter, names.done)) return null;

	const closed = readDate(frontmatter[names.closed]);
	const created = readDate(frontmatter[names.created]) ?? date ?? closed;
	if (created === null) return null;

	const done = readDone(frontmatter[names.done]);
	return { created, closed: done ? (closed ?? date ?? created) : null };
}

/** The days an entry stands in: the day it was made, and the day it was closed when that is another. */
export function daysOf(entry: EntryDays): string[] {
	return entry.closed === null || entry.closed === entry.created
		? [entry.created]
		: [entry.created, entry.closed];
}

/**
 * How an entry stands in one of its days ([[expectation]] §6, §7).
 *
 * An entry closed on another day leaves a trace in the day it was made: the list of that day
 * shows it with an open box — the work of that day — and the cell does not count it, or every
 * day a task was started on would stay a draft for good.
 */
export function standingIn(entry: EntryDays, date: string): Standing {
	if (entry.closed === null) return "open";
	return entry.closed === date ? "closed" : "trace";
}

/** The entries of a day its cell counts: all of them but the traces. */
export function countedEntries(entries: readonly Entry[], date: string): Entry[] {
	return entries.filter((entry) => standingIn(entry, date) !== "trace");
}

/** Splits a text into what a reader sees as single signs, not into UTF-16 units. */
const GRAPHEMES = new Intl.Segmenter(undefined, { granularity: "grapheme" });

/**
 * Reads the `mark` property as the one sign a cell has room for ([[expectation]] §6): the
 * first grapheme of the text, so `👍🏽` and `👨‍👩‍👧` stay whole while `10` gives `1`. A number is
 * read as it is written. A boolean, a list, an object and an empty text give no mark, and the
 * day keeps its checkmark.
 */
export function readMark(value: unknown): string | null {
	let text: string;
	if (typeof value === "string") text = value.trim();
	else if (typeof value === "number" && Number.isFinite(value)) text = String(value);
	else return null;

	for (const { segment } of GRAPHEMES.segment(text)) return segment;
	return null;
}

/**
 * The one sign a text consists of, or `null` when it holds none or more than one: `🔥`, `👍🏽`,
 * `4` and `A` are signs, `10` and `Steps` are not. The spaces around it do not count.
 */
export function readSoleSign(text: string): string | null {
	const signs = Array.from(GRAPHEMES.segment(text.trim()), ({ segment }) => segment);
	return signs.length === 1 ? signs[0] : null;
}

/**
 * Reads a property that links to notes as link paths: `[[card]]`, `[[folder/card|alias]]` and
 * a bare name all give `card`, and a list gives the path of every readable item. Resolving the
 * paths against the vault is the adapter's job.
 */
export function readTrackLinks(value: unknown): string[] {
	const links: string[] = [];
	for (const raw of Array.isArray(value) ? value : [value]) {
		if (typeof raw !== "string") continue;

		const text = raw.trim();
		const wikilink = /^\[\[(.*)\]\]$/.exec(text);
		const link = wikilink === null ? text : wikilink[1];
		const target = link.split("|")[0].split("#")[0].trim();
		if (target !== "") links.push(target);
	}
	return links;
}

/** Reads a property that links to one note: the first readable link of `readTrackLinks`. */
export function readTrackLink(value: unknown): string | null {
	return readTrackLinks(value)[0] ?? null;
}

export function entryKey(trackPath: string, date: string): string {
	return `${trackPath}\n${date}`;
}

/**
 * Indexes the entries of the vault by track and date. An entry is found under each of its
 * days: the day it was made and the day it was closed.
 *
 * A day can hold several: a duplicate, a note made by hand, a copy brought by sync. None
 * of them is dropped and none is chosen over the others — the cell is counted from all of
 * them ([[expectation]] §7) and the popup lists them ([[rendering]]). The list is ordered
 * by address, so it reads the same from render to render.
 */
export function buildEntryIndex(entries: readonly Entry[]): EntryIndex {
	const index = new Map<string, Entry[]>();
	for (const entry of entries) {
		for (const date of daysOf(entry)) {
			const key = entryKey(entry.trackPath, date);
			const day = index.get(key);
			if (day === undefined) index.set(key, [entry]);
			else day.push(entry);
		}
	}
	for (const day of index.values()) day.sort(byId);
	return index;
}

/** The entries of one day of one track, in the order the popup lists them. */
export function findEntries(
	index: EntryIndex,
	trackPath: string,
	date: string,
): readonly Entry[] {
	return index.get(entryKey(trackPath, date)) ?? NO_ENTRIES;
}

/**
 * The order of a day: by path, and the records of one journal in the order they stand there —
 * the address is the one thing two entries never share.
 */
export function byId(left: Entry, right: Entry): number {
	if (left.path !== right.path) return left.path < right.path ? -1 : 1;
	return (left.record?.nth ?? -1) - (right.record?.nth ?? -1);
}

/**
 * The address of an entry, as a cell writes it into `data-entry`: the path of a note, and for
 * a record the path of its journal, its date and which record of that date it is —
 * `Cleaning.md#2026-09-28#0`. A line would be shorter and would not last: the newest record
 * goes on top, and every one below it moves down a line ([[entry#Журнал трека|entry]]).
 */
export function entryId(entry: Entry): string {
	return entry.record === null
		? entry.path
		: recordId(entry.path, entry.created, entry.record.nth);
}

export function recordId(path: string, date: string, nth: number): string {
	return `${path}#${date}#${nth}`;
}

/**
 * What the core Page preview plugin is asked to show for an entry: the note, or the section of
 * a record — `Cleaning.md#2026-09-28`, the record alone.
 *
 * The heading of such a section is drawn as its caption and cannot be edited in the preview;
 * the body can, and the mark lives there, in a `###` heading. The whole journal scrolled to
 * the record was tried and given up: Obsidian scrolls it once, before a theme has settled the
 * height of the text above, and a click that turns the preview into an editor puts the caret
 * elsewhere ([[entry#Переключение и открытие|entry]]).
 */
export function entryPreview(entry: Entry): string {
	return entry.record === null ? entry.path : `${entry.path}#${entry.record.heading}`;
}

/** What an address names: a note, or a record of a journal. */
export interface EntryAddress {
	path: string;
	/** `null` — the address is a note of its own. */
	record: { date: string; nth: number } | null;
}

/**
 * Reads an address back. A note path ends with its extension, so it never reads as a record,
 * whatever signs its name holds.
 */
export function readEntryId(id: string): EntryAddress {
	const match = /^(.*)#(\d{4}-\d{2}-\d{2})#(\d+)$/.exec(id);
	if (match === null) return { path: id, record: null };
	return { path: match[1], record: { date: match[2], nth: Number(match[3]) } };
}

/**
 * The three states of a cell, counted over the whole day ([[expectation]] §7): the box is
 * checked only when every entry of the day is closed in it, and one open entry keeps the day a
 * draft. Several entries are a state of affairs, not an error, so the cell carries no mark
 * of its own — the popup is where a day is taken apart ([[entry]]).
 *
 * A trace does not count: a day that holds nothing but entries closed on other days is empty.
 */
export function cellState(entries: readonly Entry[], date: string): CellState {
	let closed = 0;
	for (const entry of entries) {
		const standing = standingIn(entry, date);
		if (standing === "open") return "draft";
		if (standing === "closed") closed++;
	}
	return closed === 0 ? "empty" : "done";
}

/**
 * The sign a day shows instead of its checkmark ([[expectation]] §7): the mark of a closed day
 * of one entry. A draft keeps its box, and a day of several keeps the checkmark or the draft
 * of the common rule — whose mark it would be is not the table's to choose. Traces are not
 * counted here either.
 */
export function cellMark(entries: readonly Entry[], date: string): string | null {
	const counted = countedEntries(entries, date);
	if (counted.length !== 1 || counted[0].closed === null) return null;
	return counted[0].mark;
}
