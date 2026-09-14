// Process Tracker — filtering and ordering of track cards.
// Pure module: no Obsidian API, covered by test/select.test.ts.

import { TRACK_NAME_KEY } from "../constants.ts";
import type { SortSpec, TrackCard } from "../model/types.ts";

/**
 * Keeps the cards marked with `tag` and orders them by `sort`.
 * Nested tags count as matches: `#process_tracker/health` matches `process_tracker`.
 */
export function selectTracks(cards: TrackCard[], tag: string, sort: SortSpec): TrackCard[] {
	return cards.filter((card) => hasTag(card, tag)).sort(makeComparator(sort));
}

/** Name shown in the table: the `track_name` property, or the file name. */
export function trackDisplayName(frontmatter: Record<string, unknown>, basename: string): string {
	const override = frontmatter[TRACK_NAME_KEY];
	if (typeof override === "string" && override.trim() !== "") return override.trim();
	return basename;
}

export function normalizeTag(tag: string): string {
	return tag.trim().replace(/^#/, "").toLowerCase();
}

export function hasTag(card: TrackCard, tag: string): boolean {
	const wanted = normalizeTag(tag);
	if (wanted === "") return false;
	return card.tags.some((raw) => {
		const own = normalizeTag(raw);
		return own === wanted || own.startsWith(`${wanted}/`);
	});
}

/** Cards without a value for the sort field always go last, in both directions. */
function makeComparator(sort: SortSpec): (a: TrackCard, b: TrackCard) => number {
	const sign = sort.direction === "desc" ? -1 : 1;
	return (a, b) => {
		const left = sortValue(a, sort.field);
		const right = sortValue(b, sort.field);
		const missing = compareMissing(left, right);
		if (missing !== 0) return missing;
		const result = compareValues(left, right);
		return result !== 0 ? sign * result : compareValues(a.basename, b.basename);
	};
}

function sortValue(card: TrackCard, field: string): unknown {
	if (field === "name") return card.basename;
	if (field === "ctime") return card.ctime;
	if (field === "mtime") return card.mtime;
	return card.frontmatter[field];
}

function isMissing(value: unknown): boolean {
	return value === undefined || value === null || value === "";
}

function compareMissing(left: unknown, right: unknown): number {
	if (isMissing(left) && isMissing(right)) return 0;
	if (isMissing(left)) return 1;
	if (isMissing(right)) return -1;
	return 0;
}

function compareValues(left: unknown, right: unknown): number {
	if (typeof left === "number" && typeof right === "number") return left - right;
	if (typeof left === "boolean" && typeof right === "boolean") {
		return Number(left) - Number(right);
	}
	return String(left).localeCompare(String(right), undefined, {
		numeric: true,
		sensitivity: "base",
	});
}
