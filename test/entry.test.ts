// Unit tests for reading entry properties and indexing entries by day.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Entry } from "../src/model/types.ts";
import {
	buildEntryIndex,
	byId,
	cellMark,
	cellState,
	entryId,
	entryKey,
	entryPreview,
	findEntries,
	readDate,
	readDone,
	readEntryId,
	readMark,
	readSoleSign,
	readTrackLink,
} from "../src/entry/state.ts";

function paths(entries: readonly Entry[]): string[] {
	return entries.map((entry) => entry.path);
}

function entry(overrides: Partial<Entry> & { path: string }): Entry {
	return {
		trackPath: "cleaning.md",
		date: "2026-09-11",
		done: true,
		mark: null,
		record: null,
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
	it("finds the entry of a day by track and date", () => {
		const index = buildEntryIndex([entry({ path: "a.md" })]);
		assert.deepEqual(paths(findEntries(index, "cleaning.md", "2026-09-11")), ["a.md"]);
	});

	it("tells one track from another on the same day", () => {
		const index = buildEntryIndex([
			entry({ path: "a.md" }),
			entry({ path: "b.md", trackPath: "water.md" }),
		]);
		assert.deepEqual(paths(findEntries(index, "water.md", "2026-09-11")), ["b.md"]);
	});

	it("reports an empty day as an empty list", () => {
		const index = buildEntryIndex([entry({ path: "a.md" })]);
		assert.deepEqual(findEntries(index, "cleaning.md", "2026-09-10"), []);
	});

	it("keeps every entry of a day, in the order of their paths", () => {
		const index = buildEntryIndex([
			entry({ path: "c.md" }),
			entry({ path: "a.md", done: false }),
			entry({ path: "b.md" }),
		]);
		assert.deepEqual(paths(findEntries(index, "cleaning.md", "2026-09-11")), [
			"a.md",
			"b.md",
			"c.md",
		]);
	});

	it("gives every track and day a key of its own", () => {
		assert.notEqual(entryKey("cleaning.md", "2026-09-11"), entryKey("water.md", "2026-09-11"));
		assert.notEqual(entryKey("cleaning.md", "2026-09-11"), entryKey("cleaning.md", "2026-09-10"));
	});
});

describe("cellState", () => {
	it("names the three states of a day with one entry", () => {
		assert.equal(cellState([]), "empty");
		assert.equal(cellState([entry({ path: "a.md", done: false })]), "draft");
		assert.equal(cellState([entry({ path: "a.md", done: true })]), "done");
	});

	it("checks the box only when every entry of the day is done", () => {
		const done = entry({ path: "a.md", done: true });
		const draft = entry({ path: "b.md", done: false });
		assert.equal(cellState([done, draft]), "draft");
		assert.equal(cellState([draft, done]), "draft");
		assert.equal(cellState([done, entry({ path: "c.md", done: true })]), "done");
	});
});

describe("readMark", () => {
	it("keeps the first visible sign of a text", () => {
		assert.equal(readMark("🔥"), "🔥");
		assert.equal(readMark("4"), "4");
		assert.equal(readMark("ok"), "o");
		assert.equal(readMark("  😐 so-so "), "😐");
	});

	it("keeps a sign made of several characters whole", () => {
		assert.equal(readMark("👍🏽"), "👍🏽");
		assert.equal(readMark("👨‍👩‍👧 family"), "👨‍👩‍👧");
		assert.equal(readMark("🇷🇺"), "🇷🇺");
		assert.equal(readMark("1️⃣"), "1️⃣");
	});

	it("reads a number as it is written", () => {
		assert.equal(readMark(4), "4");
		assert.equal(readMark(10), "1");
		assert.equal(readMark(-2), "-");
	});

	it("reads the word true as a word", () => {
		assert.equal(readMark("true"), "t");
	});

	it("gives no sign for anything else", () => {
		assert.equal(readMark(""), null);
		assert.equal(readMark("   "), null);
		assert.equal(readMark(undefined), null);
		assert.equal(readMark(null), null);
		assert.equal(readMark(true), null);
		assert.equal(readMark(Number.NaN), null);
		assert.equal(readMark(["🔥"]), null);
		assert.equal(readMark({ mark: "🔥" }), null);
	});
});

describe("cellMark", () => {
	it("shows the mark of a closed day of one entry", () => {
		assert.equal(cellMark([entry({ path: "a.md", mark: "🔥" })]), "🔥");
	});

	it("shows nothing for a day without a mark", () => {
		assert.equal(cellMark([]), null);
		assert.equal(cellMark([entry({ path: "a.md" })]), null);
	});

	it("keeps a draft a draft, mark or not", () => {
		assert.equal(cellMark([entry({ path: "a.md", done: false, mark: "🔥" })]), null);
	});

	it("shows no mark for a day of several entries", () => {
		const day = [entry({ path: "a.md", mark: "🔥" }), entry({ path: "b.md", mark: "4" })];
		assert.equal(cellMark(day), null);
	});
});

describe("entry addresses", () => {
	const note = entry({ path: "notes/cleaning 2026-09-11.md" });
	const record = entry({
		path: "Cleaning.md",
		record: { nth: 1, heading: "2026-09-11 🔥", line: 4 },
	});

	it("addresses a note by its path, a record by its journal, date and number", () => {
		assert.equal(entryId(note), "notes/cleaning 2026-09-11.md");
		assert.equal(entryId(record), "Cleaning.md#2026-09-11#1");
	});

	it("reads an address back", () => {
		assert.deepEqual(readEntryId("Cleaning.md#2026-09-11#1"), {
			path: "Cleaning.md",
			record: { date: "2026-09-11", nth: 1 },
		});
		assert.deepEqual(readEntryId("notes/a#b.md"), { path: "notes/a#b.md", record: null });
	});

	it("previews a note as it is, a record as the section of its heading", () => {
		assert.equal(entryPreview(note), "notes/cleaning 2026-09-11.md");
		assert.equal(entryPreview(record), "Cleaning.md#2026-09-11 🔥");
	});

	it("orders the records of one journal as they stand, after the note of the same path", () => {
		const first = entry({ path: "J.md", record: { nth: 0, heading: "", line: 9 } });
		const second = entry({ path: "J.md", record: { nth: 1, heading: "", line: 2 } });
		assert.deepEqual([second, first, entry({ path: "A.md" })].sort(byId).map(entryId), [
			"A.md",
			"J.md#2026-09-11#0",
			"J.md#2026-09-11#1",
		]);
	});
});

describe("readSoleSign", () => {
	it("reads a text of one sign, however many characters it takes", () => {
		assert.equal(readSoleSign(" 🔥 "), "🔥");
		assert.equal(readSoleSign("👨‍👩‍👧"), "👨‍👩‍👧");
		assert.equal(readSoleSign("A"), "A");
	});

	it("reads nothing from a text of several signs or of none", () => {
		assert.equal(readSoleSign("10"), null);
		assert.equal(readSoleSign("Steps"), null);
		assert.equal(readSoleSign("  "), null);
	});
});
