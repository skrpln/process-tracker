// Unit tests for reading entry properties and indexing entries by day.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Entry } from "../src/model/types.ts";
import {
	buildEntryIndex,
	cellState,
	entryKey,
	findEntry,
	readDate,
	readDone,
	readTrackLink,
} from "../src/entry/state.ts";

function entry(overrides: Partial<Entry> & { path: string }): Entry {
	return {
		trackPath: "cleaning.md",
		date: "2026-09-11",
		done: true,
		...overrides,
	};
}

describe("readDate", () => {
	it("reads a date written as text", () => {
		assert.equal(readDate("2026-09-11"), "2026-09-11");
	});

	it("keeps the day of a timestamp", () => {
		assert.equal(readDate("2026-09-11T07:30:00"), "2026-09-11");
	});

	it("trims the value", () => {
		assert.equal(readDate("  2026-09-11  "), "2026-09-11");
	});

	it("reads a date the cache parsed into a Date", () => {
		assert.equal(readDate(new Date(2026, 8, 11)), "2026-09-11");
	});

	it("rejects another way of writing a date", () => {
		assert.equal(readDate("11.09.2026"), null);
	});

	it("rejects a missing or non-textual property", () => {
		assert.equal(readDate(undefined), null);
		assert.equal(readDate(null), null);
		assert.equal(readDate(20260911), null);
		assert.equal(readDate(new Date(Number.NaN)), null);
	});
});

describe("readDone", () => {
	it("checks the box only for a true value", () => {
		assert.equal(readDone(true), true);
		assert.equal(readDone(false), false);
	});

	it("reads a value typed as text", () => {
		assert.equal(readDone("true"), true);
		assert.equal(readDone(" Yes "), true);
		assert.equal(readDone("false"), false);
		assert.equal(readDone("done"), false);
	});

	it("treats a missing property as a draft", () => {
		assert.equal(readDone(undefined), false);
		assert.equal(readDone(null), false);
		assert.equal(readDone(1), false);
	});
});

describe("readTrackLink", () => {
	it("reads a wikilink", () => {
		assert.equal(readTrackLink("[[cleaning]]"), "cleaning");
	});

	it("reads a link with a folder", () => {
		assert.equal(readTrackLink("[[tracks/cleaning]]"), "tracks/cleaning");
	});

	it("drops an alias and a subpath", () => {
		assert.equal(readTrackLink("[[cleaning|Уборка]]"), "cleaning");
		assert.equal(readTrackLink("[[cleaning#Протокол]]"), "cleaning");
	});

	it("reads a bare name", () => {
		assert.equal(readTrackLink("cleaning"), "cleaning");
	});

	it("takes the first readable item of a list", () => {
		assert.equal(readTrackLink([null, "[[cleaning]]", "[[water]]"]), "cleaning");
	});

	it("rejects an empty or missing property", () => {
		assert.equal(readTrackLink("   "), null);
		assert.equal(readTrackLink("[[]]"), null);
		assert.equal(readTrackLink(undefined), null);
		assert.equal(readTrackLink(42), null);
	});
});

describe("buildEntryIndex", () => {
	it("finds an entry by track and date", () => {
		const index = buildEntryIndex([entry({ path: "a.md" })]);
		assert.equal(findEntry(index, "cleaning.md", "2026-09-11")?.path, "a.md");
	});

	it("tells one track from another on the same day", () => {
		const index = buildEntryIndex([
			entry({ path: "a.md" }),
			entry({ path: "b.md", trackPath: "water.md" }),
		]);
		assert.equal(findEntry(index, "water.md", "2026-09-11")?.path, "b.md");
	});

	it("reports nothing for a day without an entry", () => {
		const index = buildEntryIndex([entry({ path: "a.md" })]);
		assert.equal(findEntry(index, "cleaning.md", "2026-09-10"), null);
	});

	it("lets done win over a draft for the same day", () => {
		const draft = entry({ path: "a.md", done: false });
		const done = entry({ path: "b.md", done: true });
		assert.equal(findEntry(buildEntryIndex([draft, done]), "cleaning.md", "2026-09-11"), done);
		assert.equal(findEntry(buildEntryIndex([done, draft]), "cleaning.md", "2026-09-11"), done);
	});

	it("keeps the first path when two notes claim the day alike", () => {
		const first = entry({ path: "a.md" });
		const second = entry({ path: "b.md" });
		assert.equal(findEntry(buildEntryIndex([second, first]), "cleaning.md", "2026-09-11"), first);
	});

	it("gives every track and day a key of its own", () => {
		assert.notEqual(entryKey("cleaning.md", "2026-09-11"), entryKey("water.md", "2026-09-11"));
		assert.notEqual(entryKey("cleaning.md", "2026-09-11"), entryKey("cleaning.md", "2026-09-10"));
	});
});

describe("cellState", () => {
	it("names the three states", () => {
		assert.equal(cellState(null), "empty");
		assert.equal(cellState(entry({ path: "a.md", done: false })), "draft");
		assert.equal(cellState(entry({ path: "a.md", done: true })), "done");
	});
});
