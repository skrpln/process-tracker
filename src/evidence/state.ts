// Process Tracker — evidence notes: reading their properties and indexing them by day.
// Pure module: no Obsidian API, covered by test/evidence.test.ts.

import { toIsoDate } from "../dates/grid.ts";
import type { CellState, Evidence } from "../model/types.ts";

/** Evidence of the vault, keyed by track card and date. */
export type EvidenceIndex = ReadonlyMap<string, Evidence>;

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
 * `false` and anything unreadable leave the evidence a draft ([[expectation]] §7).
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

export function evidenceKey(trackPath: string, date: string): string {
	return `${trackPath}\n${date}`;
}

/**
 * Indexes evidence by track and date.
 *
 * Two notes can claim the same day — a duplicate, a note made by hand — and the cell
 * has room for one. Done wins over draft, so the cell shows the strongest claim the
 * vault makes; between equals the first path in alphabetical order stays, so the table
 * does not change from render to render.
 */
export function buildEvidenceIndex(evidence: Evidence[]): EvidenceIndex {
	const index = new Map<string, Evidence>();
	for (const candidate of evidence) {
		const key = evidenceKey(candidate.trackPath, candidate.date);
		const kept = index.get(key);
		if (kept === undefined || beats(candidate, kept)) index.set(key, candidate);
	}
	return index;
}

function beats(candidate: Evidence, kept: Evidence): boolean {
	if (candidate.done !== kept.done) return candidate.done;
	return candidate.path < kept.path;
}

export function findEvidence(
	index: EvidenceIndex,
	trackPath: string,
	date: string,
): Evidence | null {
	return index.get(evidenceKey(trackPath, date)) ?? null;
}

/** The three states of a cell, derived from the evidence behind it. */
export function cellState(evidence: Evidence | null): CellState {
	if (evidence === null) return "empty";
	return evidence.done ? "done" : "draft";
}
