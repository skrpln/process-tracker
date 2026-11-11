// Unit tests for reading entry properties and indexing entries by day.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Entry } from "../src/model/types.ts";
import {
	buildEntryIndex,
	byId,
	cellMark,
	cellState,
	countedEntries,
	daysOf,
	entryId,
	entryKey,
	entryPreview,
	findEntries,
	readDate,
	readDays,
	readDone,
	readEntryId,
	readMark,
	readSoleSign,
	readTrackLink,
	readTrackLinks,
	standingIn,
} from "../src/entry/state.ts";
import { DEFAULT_PROPERTY_NAMES } from "../src/constants.ts";

function paths(entries: readonly Entry[]): string[] {
	return entries.map((entry) => entry.path);
}

/** The day the tests are about. */
const DAY = "2026-09-11";

/** A done entry made and closed on the day of the tests, unless told otherwise. */
function entry(overrides: Partial<Entry> & { path: string }): Entry {
	return {
		trackPath: "cleaning.md",
		created: DAY,
		closed: DAY,
		mark: null,
		record: null,
		...overrides,
	};
}

/** An entry made on the day of the tests and still open. */
function open(path: string): Entry {
	return entry({ path, closed: null });
}

describe("readDate", () => {
	it("reads a date written as text", () => {
		assert.equal(readDate("2026-09-11"), "2026-09-11");
	});

	it("keeps the day of a timestamp", () => {
		assert.equal(readDate("2026-09-11T07:30:00"), "2026-09-11");
		assert.equal(readDate("2026-11-10 14:30"), "2026-11-10");
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

	it("reads every readable item of a list as a link of its own", () => {
		assert.deepEqual(readTrackLinks([null, "[[cleaning]]", "", "water", 4]), ["cleaning", "water"]);
		assert.deepEqual(readTrackLinks("[[cleaning|уборка]]"), ["cleaning"]);
		assert.deepEqual(readTrackLinks(undefined), []);
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
			open("a.md"),
			entry({ path: "b.md" }),
		]);
		assert.deepEqual(paths(findEntries(index, "cleaning.md", "2026-09-11")), [
			"a.md",
			"b.md",
			"c.md",
		]);
	});

	it("finds an entry in the day it was made and in the day it was closed", () => {
		const index = buildEntryIndex([entry({ path: "a.md", created: "2026-09-05" })]);
		assert.deepEqual(paths(findEntries(index, "cleaning.md", "2026-09-05")), ["a.md"]);
		assert.deepEqual(paths(findEntries(index, "cleaning.md", DAY)), ["a.md"]);
		assert.deepEqual(findEntries(index, "cleaning.md", "2026-09-08"), []);
	});

	it("finds an entry made and closed on one day there once", () => {
		const index = buildEntryIndex([entry({ path: "a.md" })]);
		assert.deepEqual(paths(findEntries(index, "cleaning.md", DAY)), ["a.md"]);
	});

	it("gives every track and day a key of its own", () => {
		assert.notEqual(entryKey("cleaning.md", "2026-09-11"), entryKey("water.md", "2026-09-11"));
		assert.notEqual(entryKey("cleaning.md", "2026-09-11"), entryKey("cleaning.md", "2026-09-10"));
	});
});

describe("cellState", () => {
	it("names the three states of a day with one entry", () => {
		assert.equal(cellState([], DAY), "empty");
		assert.equal(cellState([open("a.md")], DAY), "draft");
		assert.equal(cellState([entry({ path: "a.md" })], DAY), "done");
	});

	it("checks the box only when every entry of the day is done", () => {
		const done = entry({ path: "a.md" });
		const draft = open("b.md");
		assert.equal(cellState([done, draft], DAY), "draft");
		assert.equal(cellState([draft, done], DAY), "draft");
		assert.equal(cellState([done, entry({ path: "c.md" })], DAY), "done");
	});

	it("leaves the day an entry was made in empty when it was closed on another", () => {
		const later = entry({ path: "a.md", closed: "2026-09-15" });
		assert.equal(cellState([later], DAY), "empty");
		assert.equal(cellState([later], "2026-09-15"), "done");
	});

	it("does not let a trace hold a day back or close it", () => {
		const trace = entry({ path: "a.md", closed: "2026-09-15" });
		assert.equal(cellState([trace, open("b.md")], DAY), "draft");
		assert.equal(cellState([trace, entry({ path: "b.md" })], DAY), "done");
	});
});

describe("readDays", () => {
	const names = DEFAULT_PROPERTY_NAMES;

	it("places a done note in the day it was made and the day it was closed", () => {
		const days = readDays(
			{ created: "2026-11-05", done: true, closed: "2026-11-10 14:30" },
			names,
		);
		assert.deepEqual(days, { created: "2026-11-05", closed: "2026-11-10" });
	});

	it("keeps an open note in the day it was made, whatever closed says", () => {
		const days = readDays({ created: "2026-11-05", done: false, closed: "2026-11-10" }, names);
		assert.deepEqual(days, { created: "2026-11-05", closed: null });
	});

	it("drops the time of created", () => {
		assert.deepEqual(readDays({ created: "2026-11-05T09:12", done: false }, names), {
			created: "2026-11-05",
			closed: null,
		});
	});

	it("closes a done note without closed on the day it was made", () => {
		assert.deepEqual(readDays({ created: "2026-11-05", done: true }, names), {
			created: "2026-11-05",
			closed: "2026-11-05",
		});
	});

	it("makes a note without created on the day it was closed", () => {
		assert.deepEqual(readDays({ done: true, closed: "2026-11-10 08:00" }, names), {
			created: "2026-11-10",
			closed: "2026-11-10",
		});
	});

	it("reads a note of an earlier version in its one day", () => {
		assert.deepEqual(readDays({ date: "2026-09-11", done: true }, names), {
			created: "2026-09-11",
			closed: "2026-09-11",
		});
		assert.deepEqual(readDays({ date: "2026-09-11", done: false }, names), {
			created: "2026-09-11",
			closed: null,
		});
	});

	it("reads a note of an earlier version without done as a draft, as it always did", () => {
		assert.deepEqual(readDays({ date: "2026-09-11" }, names), {
			created: "2026-09-11",
			closed: null,
		});
	});

	it("lets date stand in only for what is missing", () => {
		assert.deepEqual(readDays({ date: "2026-09-11", created: "2026-09-12", done: true }, names), {
			created: "2026-09-12",
			closed: "2026-09-11",
		});
		assert.deepEqual(readDays({ date: "2026-09-11", closed: "2026-09-14", done: true }, names), {
			created: "2026-09-11",
			closed: "2026-09-14",
		});
	});

	it("is no entry without done or date", () => {
		assert.equal(readDays({ created: "2026-11-05", closed: "2026-11-10" }, names), null);
	});

	it("is no entry without a day", () => {
		assert.equal(readDays({ done: true }, names), null);
		assert.equal(readDays({ done: false, created: "yesterday" }, names), null);
	});

	it("reads the properties under the names the settings give them", () => {
		const renamed = { done: "finished", created: "made", closed: "ended", date: "day" };
		assert.deepEqual(
			readDays({ finished: true, made: "2026-11-05", ended: "2026-11-06", done: false }, renamed),
			{ created: "2026-11-05", closed: "2026-11-06" },
		);
		assert.equal(readDays({ done: true, created: "2026-11-05" }, renamed), null);
	});
});

describe("days of an entry", () => {
	it("are one day for an open entry and for one closed on the day it was made", () => {
		assert.deepEqual(daysOf({ created: DAY, closed: null }), [DAY]);
		assert.deepEqual(daysOf({ created: DAY, closed: DAY }), [DAY]);
	});

	it("are two for an entry closed on another day", () => {
		assert.deepEqual(daysOf({ created: "2026-11-05", closed: "2026-11-10" }), [
			"2026-11-05",
			"2026-11-10",
		]);
	});

	it("tell how the entry stands in each of them", () => {
		const later = { created: "2026-11-05", closed: "2026-11-10" };
		assert.equal(standingIn(later, "2026-11-05"), "trace");
		assert.equal(standingIn(later, "2026-11-10"), "closed");
		assert.equal(standingIn({ created: DAY, closed: null }, DAY), "open");
		assert.equal(standingIn({ created: DAY, closed: DAY }, DAY), "closed");
	});

	it("leave the traces out of what a cell counts", () => {
		const trace = entry({ path: "a.md", closed: "2026-09-15" });
		assert.deepEqual(paths(countedEntries([trace, open("b.md")], DAY)), ["b.md"]);
		assert.deepEqual(paths(countedEntries([trace], "2026-09-15")), ["a.md"]);
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
		assert.equal(cellMark([entry({ path: "a.md", mark: "🔥" })], DAY), "🔥");
	});

	it("shows nothing for a day without a mark", () => {
		assert.equal(cellMark([], DAY), null);
		assert.equal(cellMark([entry({ path: "a.md" })], DAY), null);
	});

	it("keeps a draft a draft, mark or not", () => {
		assert.equal(cellMark([entry({ path: "a.md", closed: null, mark: "🔥" })], DAY), null);
	});

	it("shows no mark for a day of several entries", () => {
		const day = [entry({ path: "a.md", mark: "🔥" }), entry({ path: "b.md", mark: "4" })];
		assert.equal(cellMark(day, DAY), null);
	});

	it("shows the mark in the day of closing, not in the day the entry was made", () => {
		const later = entry({ path: "a.md", closed: "2026-09-15", mark: "🔥" });
		assert.equal(cellMark([later], "2026-09-15"), "🔥");
		assert.equal(cellMark([later], DAY), null);
	});

	it("counts no trace as a second entry of the day", () => {
		const trace = entry({ path: "a.md", closed: "2026-09-15", mark: "4" });
		assert.equal(cellMark([trace, entry({ path: "b.md", mark: "🔥" })], DAY), "🔥");
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
