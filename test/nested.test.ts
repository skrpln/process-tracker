// Unit tests for the entries below a track: gathering them, recounting them, the tree of a day.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { nestedBranches, nestedEntries, recountNested } from "../src/entry/nested.ts";
import { buildEntryIndex, cellMark, cellState } from "../src/entry/state.ts";
import type { Entry } from "../src/model/types.ts";
import { buildTrackTree } from "../src/tracks/tree.ts";

/** The day the tests are about. */
const DAY = "2026-11-10";

/** A done entry of `dusting` made and closed on the day of the tests, unless told otherwise. */
function entry(overrides: Partial<Entry> & { path: string }): Entry {
	return {
		trackPath: "dusting.md",
		created: DAY,
		closed: DAY,
		mark: null,
		record: null,
		...overrides,
	};
}

/** A record of the journal a track card keeps in itself. */
function record(trackPath: string, overrides: Partial<Entry> = {}): Entry {
	return entry({
		path: trackPath,
		trackPath,
		record: { nth: 0, heading: DAY, line: 3 },
		...overrides,
	});
}

function ids(entries: readonly Entry[]): string[] {
	return entries.map((item) => `${item.trackPath}:${item.path}`);
}

/** Home → harmony → bedding, dusting; Home → purchases. */
const TREE = buildTrackTree([
	{ path: "bedding.md", parents: ["harmony.md"] },
	{ path: "dusting.md", parents: ["harmony.md"] },
	{ path: "harmony.md", parents: ["home.md"] },
	{ path: "home.md", parents: [] },
	{ path: "purchases.md", parents: ["home.md"] },
]);

describe("nestedEntries", () => {
	const index = buildEntryIndex([
		entry({ path: "dust.md" }),
		entry({ path: "milk.md", trackPath: "purchases.md" }),
		entry({ path: "own.md", trackPath: "home.md" }),
		entry({ path: "other day.md", created: "2026-11-09", closed: "2026-11-09" }),
	]);

	it("gathers the entries of the descendants on the day, descendant by descendant", () => {
		const below = nestedEntries(index, ["purchases.md", "dusting.md"], DAY);
		assert.deepEqual(ids(below), ["purchases.md:milk.md", "dusting.md:dust.md"]);
	});

	it("leaves the track's own entries and the other days out", () => {
		const below = nestedEntries(index, ["dusting.md"], DAY);
		assert.deepEqual(ids(below), ["dusting.md:dust.md"]);
	});

	it("answers with nothing for a track with no descendants", () => {
		assert.deepEqual(nestedEntries(index, [], DAY), []);
	});

	it("finds an entry in the day it was made and in the day it was closed", () => {
		const late = buildEntryIndex([entry({ path: "task.md", created: "2026-11-05" })]);
		assert.equal(nestedEntries(late, ["dusting.md"], "2026-11-05").length, 1);
		assert.equal(nestedEntries(late, ["dusting.md"], DAY).length, 1);
	});
});

describe("a cell with entries below it", () => {
	const closed = entry({ path: "dust.md" });
	const open = entry({ path: "bed.md", closed: null });
	const trace = entry({ path: "task.md", closed: "2026-11-12" });

	it("is checked by one entry closed below, with nothing of its own", () => {
		assert.equal(cellState([], DAY, [closed]), "done");
		assert.equal(cellState([], DAY, [open, closed]), "done");
	});

	it("is checked by an entry closed below even while its own is open", () => {
		const own = entry({ path: "own.md", trackPath: "home.md", closed: null });
		assert.equal(cellState([own], DAY, [closed]), "done");
	});

	it("is not changed by the open entries below", () => {
		const own = entry({ path: "own.md", trackPath: "home.md", closed: null });
		assert.equal(cellState([], DAY, [open]), "empty");
		assert.equal(cellState([own], DAY, [open]), "draft");
	});

	it("is not changed by an entry below that was closed on another day", () => {
		assert.equal(cellState([], DAY, [trace]), "empty");
		assert.equal(cellState([], "2026-11-12", [trace]), "done");
	});

	it("keeps its own state where nothing is closed below", () => {
		const own = entry({ path: "own.md", trackPath: "home.md" });
		assert.equal(cellState([own], DAY, []), "done");
		assert.equal(cellState([own], DAY, [open]), "done");
	});
});

describe("the mark of a cell with entries below it", () => {
	const fire = entry({ path: "dust.md", mark: "🔥" });

	it("is the mark of the one entry closed below", () => {
		assert.equal(cellMark([], DAY, [fire]), "🔥");
	});

	it("is not shown when the one entry closed below has none", () => {
		assert.equal(cellMark([], DAY, [entry({ path: "dust.md" })]), null);
	});

	it("gives way to the checkmark when two are closed below", () => {
		assert.equal(cellMark([], DAY, [fire, entry({ path: "bed.md", mark: "4" })]), null);
	});

	it("is not counted off the open entries below", () => {
		const open = entry({ path: "bed.md", closed: null, mark: "4" });
		assert.equal(cellMark([], DAY, [fire, open]), "🔥");
		assert.equal(cellMark([], DAY, [open]), null);
	});

	it("gives way to the checkmark when the track has an entry of its own too", () => {
		const own = entry({ path: "own.md", trackPath: "home.md", mark: "A" });
		assert.equal(cellMark([own], DAY, [fire]), null);
		assert.equal(cellMark([{ ...own, closed: null }], DAY, [fire]), null);
	});

	it("stays the track's own where nothing is closed below", () => {
		const own = entry({ path: "own.md", trackPath: "home.md", mark: "A" });
		assert.equal(cellMark([own], DAY, []), "A");
		assert.equal(cellMark([own], DAY, [entry({ path: "bed.md", closed: null })]), "A");
	});

	it("counts a note that is an entry of two tracks below once", () => {
		const twice = [fire, { ...fire, trackPath: "bedding.md" }];
		assert.equal(cellMark([], DAY, twice), "🔥");
	});
});

describe("recountNested", () => {
	const below = ["bedding.md", "dusting.md"];

	it("keeps the known entries and adds the changed ones", () => {
		const known = [entry({ path: "dust.md" })];
		const changed = [entry({ path: "bed.md", trackPath: "bedding.md" })];
		const day = recountNested(DAY, below, known, changed);
		assert.deepEqual(ids(day), ["bedding.md:bed.md", "dusting.md:dust.md"]);
	});

	it("drops an entry whose track is not below any more", () => {
		const moved = entry({ path: "dust.md", trackPath: "purchases.md" });
		assert.deepEqual(recountNested(DAY, below, [], [moved]), []);
	});

	it("drops an entry that left the day", () => {
		const moved = entry({ path: "dust.md", created: "2026-11-11", closed: "2026-11-11" });
		assert.deepEqual(recountNested(DAY, below, [moved], []), []);
	});

	it("takes an entry in the day it was made and in the day it was closed", () => {
		const late = entry({ path: "task.md", created: "2026-11-05" });
		assert.equal(recountNested("2026-11-05", below, [], [late]).length, 1);
		assert.equal(recountNested(DAY, below, [], [late]).length, 1);
		assert.equal(recountNested("2026-11-07", below, [], [late]).length, 0);
	});

	it("orders the entries of one track by address", () => {
		const day = recountNested(DAY, below, [entry({ path: "b.md" })], [entry({ path: "a.md" })]);
		assert.deepEqual(ids(day), ["dusting.md:a.md", "dusting.md:b.md"]);
	});
});

/** A branch as the tests read it: the child, the entry on its own line, the entries under it. */
function shape(branches: ReturnType<typeof nestedBranches>): unknown[] {
	return branches.map((branch) => [
		branch.trackPath,
		branch.own === null ? null : `${branch.own.trackPath}:${branch.own.path}`,
		ids(branch.entries),
	]);
}

describe("nestedBranches", () => {
	it("draws a branch for each child that has entries of the day", () => {
		const entries = [
			entry({ path: "dust.md" }),
			entry({ path: "milk.md", trackPath: "purchases.md" }),
		];
		assert.deepEqual(shape(nestedBranches(TREE, "home.md", entries)), [
			["harmony.md", null, ["dusting.md:dust.md"]],
			["purchases.md", null, ["purchases.md:milk.md"]],
		]);
	});

	it("leaves out a child with nothing on the day", () => {
		const branches = nestedBranches(TREE, "home.md", [entry({ path: "dust.md" })]);
		assert.deepEqual(branches.map((branch) => branch.trackPath), ["harmony.md"]);
	});

	it("lists the child's own notes first, then the entries of what stands below it", () => {
		const entries = [
			entry({ path: "dust.md" }),
			entry({ path: "bed.md", trackPath: "bedding.md" }),
			entry({ path: "long task.md", trackPath: "harmony.md" }),
		];
		assert.deepEqual(shape(nestedBranches(TREE, "home.md", entries)), [
			["harmony.md", null, ["harmony.md:long task.md", "bedding.md:bed.md", "dusting.md:dust.md"]],
		]);
	});

	it("puts the record of a child on the line of the child, not under it", () => {
		const entries = [record("dusting.md"), record("bedding.md", { closed: null })];
		assert.deepEqual(shape(nestedBranches(TREE, "harmony.md", entries)), [
			["bedding.md", "bedding.md:bedding.md", []],
			["dusting.md", "dusting.md:dusting.md", []],
		]);
	});

	it("keeps what stands below a child under its line when the child has a record too", () => {
		const entries = [record("harmony.md", { closed: null }), record("dusting.md")];
		assert.deepEqual(shape(nestedBranches(TREE, "home.md", entries)), [
			["harmony.md", "harmony.md:harmony.md", ["dusting.md:dusting.md"]],
		]);
	});

	it("keeps the notes of a child under its line when the child has a record too", () => {
		const entries = [
			record("purchases.md"),
			entry({ path: "milk.md", trackPath: "purchases.md" }),
		];
		assert.deepEqual(shape(nestedBranches(TREE, "home.md", entries)), [
			["purchases.md", "purchases.md:purchases.md", ["purchases.md:milk.md"]],
		]);
	});

	it("lists the record of a track below a child under the child, by the track", () => {
		const [harmony] = nestedBranches(TREE, "home.md", [record("dusting.md")]);
		assert.equal(harmony.own, null);
		assert.deepEqual(ids(harmony.entries), ["dusting.md:dusting.md"]);
	});

	it("leaves a child with two records of one day a plain line, the records under it", () => {
		const first = record("dusting.md");
		const second = record("dusting.md", { record: { nth: 1, heading: DAY, line: 9 } });
		const [dusting] = nestedBranches(TREE, "harmony.md", [first, second]);
		assert.equal(dusting.own, null);
		assert.equal(dusting.entries.length, 2);
	});

	it("does not take a note of the child for its own line", () => {
		const [purchases] = nestedBranches(TREE, "home.md", [
			entry({ path: "milk.md", trackPath: "purchases.md" }),
		]);
		assert.equal(purchases.own, null);
		assert.deepEqual(ids(purchases.entries), ["purchases.md:milk.md"]);
	});

	it("lists a track that stands under two children under both", () => {
		const tree = buildTrackTree([
			{ path: "a.md", parents: ["root.md"] },
			{ path: "b.md", parents: ["root.md"] },
			{ path: "root.md", parents: [] },
			{ path: "shared.md", parents: ["a.md", "b.md"] },
		]);
		const branches = nestedBranches(tree, "root.md", [record("shared.md")]);
		assert.deepEqual(branches.map((branch) => branch.trackPath), ["a.md", "b.md"]);
	});

	it("lists a note that is an entry of two tracks of one branch once", () => {
		const note = entry({ path: "both.md" });
		const entries = [note, { ...note, trackPath: "bedding.md" }];
		const [harmony] = nestedBranches(TREE, "home.md", entries);
		assert.deepEqual(ids(harmony.entries), ["bedding.md:both.md"]);
	});

	it("does not list the track under its own child where the links run in a circle", () => {
		const tree = buildTrackTree([
			{ path: "a.md", parents: ["b.md"] },
			{ path: "b.md", parents: ["a.md"] },
		]);
		const entries = [record("a.md"), record("b.md")];
		assert.deepEqual(shape(nestedBranches(tree, "a.md", entries)), [["b.md", "b.md:b.md", []]]);
	});

	it("answers with nothing for a track with no children", () => {
		assert.deepEqual(nestedBranches(TREE, "dusting.md", [entry({ path: "dust.md" })]), []);
	});
});
