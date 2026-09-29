// Process Tracker — entries: reading their properties, addressing them, indexing them by day.
// Pure module: no Obsidian API, covered by test/entry.test.ts.

import { toIsoDate } from "../dates/grid.ts";
import type { CellState, Entry } from "../model/types.ts";

/** Entries of the vault, keyed by track card and date: one day can hold several. */
export type EntryIndex = ReadonlyMap<string, readonly Entry[]>;

/** The answer for a day nobody wrote about; shared, so a lookup allocates nothing. */
const NO_ENTRIES: readonly Entry[] = Object.freeze([]);

/**
 * Reads the `date` property as `YYYY-MM-DD`. A property written as a timestamp
 * (`2026-09-11T07:30`) keeps its day; anything else is not a date the table can place.
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
 * Reads the `track` property as a link path: `[[card]]`, `[[folder/card|alias]]` and a
 * bare name all give `card`. A list takes its first readable item. Resolving the path
 * against the vault is the adapter's job.
 */
export function readTrackLink(value: unknown): string | null {
	const raw = Array.isArray(value) ? value.find((item) => typeof item === "string") : value;
	if (typeof raw !== "string") return null;

	const text = raw.trim();
	const wikilink = /^\[\[(.*)\]\]$/.exec(text);
	const link = wikilink === null ? text : wikilink[1];
	const target = link.split("|")[0].split("#")[0].trim();
	return target === "" ? null : target;
}

export function entryKey(trackPath: string, date: string): string {
	return `${trackPath}\n${date}`;
}

/**
 * Indexes the entries of the vault by track and date.
 *
 * A day can hold several: a duplicate, a note made by hand, a copy brought by sync. None
 * of them is dropped and none is chosen over the others — the cell is counted from all of
 * them ([[expectation]] §7) and the popup lists them ([[rendering]]). The list is ordered
 * by address, so it reads the same from render to render.
 */
export function buildEntryIndex(entries: Entry[]): EntryIndex {
	const index = new Map<string, Entry[]>();
	for (const entry of entries) {
		const key = entryKey(entry.trackPath, entry.date);
		const day = index.get(key);
		if (day === undefined) index.set(key, [entry]);
		else day.push(entry);
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
	return entry.record === null ? entry.path : recordId(entry.path, entry.date, entry.record.nth);
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
 * checked only when every entry of the day is done, and one open entry keeps the day a
 * draft. Several entries are a state of affairs, not an error, so the cell carries no mark
 * of its own — the popup is where a day is taken apart ([[entry]]).
 */
export function cellState(entries: readonly Entry[]): CellState {
	if (entries.length === 0) return "empty";
	return entries.every((entry) => entry.done) ? "done" : "draft";
}

/**
 * The sign a day shows instead of its checkmark ([[expectation]] §7): the mark of a closed day
 * of one entry. A draft keeps its box, and a day of several keeps the checkmark or the draft
 * of the common rule — whose mark it would be is not the table's to choose.
 */
export function cellMark(entries: readonly Entry[]): string | null {
	if (entries.length !== 1 || !entries[0].done) return null;
	return entries[0].mark;
}
