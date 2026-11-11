// Process Tracker — the entries below a track: what its descendants did on a day
// ([[nested-tracks]]). Pure module: no Obsidian API, covered by test/nested.test.ts.

import type { Entry } from "../model/types.ts";
import { childrenOf, descendantsOf } from "../tracks/tree.ts";
import type { TrackTree } from "../tracks/tree.ts";
import { byId, daysOf, entryId, findEntries } from "./state.ts";
import type { EntryIndex } from "./state.ts";

/** The answer for a track with nothing below it; shared, so a lookup allocates nothing. */
const NO_ENTRIES: readonly Entry[] = Object.freeze([]);

/**
 * The entries of the descendants of a track on one day: each descendant's own entries, in the
 * order the descendants are given and, within one, in the order of its day.
 *
 * The index is asked once per descendant, so a row of a track with nothing below it costs
 * nothing, and a row of a parent costs as many lookups as it has descendants — the vault is
 * not walked for it.
 */
export function nestedEntries(
	index: EntryIndex,
	descendants: readonly string[],
	date: string,
): readonly Entry[] {
	if (descendants.length === 0) return NO_ENTRIES;
	return descendants.flatMap((trackPath) => findEntries(index, trackPath, date));
}

/**
 * The entries below a track on one day after some of them changed ([[entry]]).
 *
 * `known` are the entries the cell was naming, read again from the vault; `changed` are the
 * changed ones as they are now. Either is taken only while it still stands below the track in
 * this day: its track is one of `descendants`, and the day is the one it was made or closed in.
 * The order is the one a render writes: by descendant, then by address.
 */
export function recountNested(
	date: string,
	descendants: readonly string[],
	known: readonly Entry[],
	changed: readonly Entry[],
): Entry[] {
	const place = (entry: Entry): number => descendants.indexOf(entry.trackPath);
	return [...known, ...changed]
		.filter((entry) => place(entry) !== -1 && daysOf(entry).includes(date))
		.sort((left, right) => place(left) - place(right) || byId(left, right));
}

/** One child of a track in the tree of a day, and the entries of the day that stand under it. */
export interface NestedBranch {
	/** The child: a track that links straight to the track of the cell. */
	trackPath: string;
	/**
	 * The record the child itself has for the day: the line of the child is the box of this
	 * record. `null` — the child has no record of its own for the day, or several, and its line
	 * is a plain name.
	 */
	own: Entry | null;
	/** What is listed under the child: its other entries, then those of everything below it. */
	entries: Entry[];
}

/**
 * The tree the popup of a day draws ([[expectation]] §12): a branch for each child of the
 * track, and under it the entries of the day — the child's own and those of its descendants.
 *
 * A record of a journal is the mark of its track for the day and has no name but the track's.
 * So the record of a child is not a line under the child — that would say the same name twice
 * — but the box on the line of the child itself ([[nested-tracks#Дерево дня|Дерево дня]]). A
 * track whose children have nothing but a record each is thus a flat list of boxes. A child
 * with several records of one day keeps a plain line, and the records stand under it: one box
 * cannot answer for two.
 *
 * A child with no entry of the day gets no branch. A track that stands under two children is
 * listed under both, and a note that is an entry of two tracks of one branch is listed there
 * once. The branches come in the order of the tree, and so do the tracks within a branch: the
 * child first, then what stands below it; the entries of one track keep the order they came in.
 *
 * Where the links run in a circle the track itself turns up below its own child; its entries
 * are its own, not a branch of its tree, and are passed over.
 */
export function nestedBranches(
	tree: TrackTree,
	trackPath: string,
	entries: readonly Entry[],
): NestedBranch[] {
	const branches: NestedBranch[] = [];
	for (const child of childrenOf(tree, trackPath)) {
		const listed = new Set<string>();
		const below: Entry[] = [];
		for (const track of [child, ...descendantsOf(tree, child)]) {
			if (track === trackPath) continue;
			for (const entry of entries) {
				const id = entryId(entry);
				if (entry.trackPath !== track || listed.has(id)) continue;
				listed.add(id);
				below.push(entry);
			}
		}
		if (below.length === 0) continue;

		const records = below.filter((entry) => entry.trackPath === child && entry.record !== null);
		const own = records.length === 1 ? records[0] : null;
		branches.push({
			trackPath: child,
			own,
			entries: own === null ? below : below.filter((entry) => entry !== own),
		});
	}
	return branches;
}
