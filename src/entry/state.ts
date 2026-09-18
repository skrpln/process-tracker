// Process Tracker — entry notes: reading their properties and indexing them by day.
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
 * by path, so it reads the same from render to render.
 */
export function buildEntryIndex(entries: Entry[]): EntryIndex {
	const index = new Map<string, Entry[]>();
	for (const entry of entries) {
		const key = entryKey(entry.trackPath, entry.date);
		const day = index.get(key);
		if (day === undefined) index.set(key, [entry]);
		else day.push(entry);
	}
	for (const day of index.values()) day.sort(byPath);
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

/** The order of a day: by path, because a path is the one thing two entries never share. */
export function byPath(left: Entry, right: Entry): number {
	if (left.path === right.path) return 0;
	return left.path < right.path ? -1 : 1;
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
