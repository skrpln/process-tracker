// Unit tests for the recount of the days a changed entry touches.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { belongsTo, recountDay, sameCell, touchedDays } from "../src/entry/refresh.ts";
import type { CellRef } from "../src/entry/refresh.ts";
import type { Entry } from "../src/model/types.ts";

const day: CellRef = { trackPath: "cleaning.md", date: "2026-09-14" };

/** A done entry made and closed on the day of the tests, unless told otherwise. */
function entry(overrides: Partial<Entry> & { path: string }): Entry {
	return {
		trackPath: "cleaning.md",
		created: "2026-09-14",
		closed: "2026-09-14",
		mark: null,
		record: null,
		...overrides,
	};
}

describe("touchedDays", () => {
	it("keeps the day of a note that stayed where it was", () => {
		assert.deepEqual(touchedDays([day], [entry({ path: "a.md" })]), [day]);
	});

	it("adds the day a note has just claimed", () => {
		assert.deepEqual(touchedDays([], [entry({ path: "a.md" })]), [day]);
	});

	it("takes both days of a note that moved", () => {
		const moved = entry({ path: "a.md", created: "2026-09-15", closed: "2026-09-15" });
		assert.deepEqual(touchedDays([day], [moved]), [day, { ...day, date: "2026-09-15" }]);
	});

	it("takes both days of a note that changed its track", () => {
		const moved = entry({ path: "a.md", trackPath: "water.md" });
		assert.deepEqual(touchedDays([day], [moved]), [day, { ...day, trackPath: "water.md" }]);
	});

	it("takes the day a note was made and the day it was closed", () => {
		const closed = entry({ path: "a.md", created: "2026-09-10" });
		assert.deepEqual(touchedDays([], [closed]), [
			{ ...day, date: "2026-09-10" },
			day,
		]);
	});

	it("takes the days of every track a note links to", () => {
		const both = [entry({ path: "a.md" }), entry({ path: "a.md", trackPath: "water.md" })];
		assert.deepEqual(touchedDays([], both), [day, { ...day, trackPath: "water.md" }]);
	});

	it("leaves only the days of a note that is no longer an entry", () => {
		assert.deepEqual(touchedDays([day], []), [day]);
	});

	it("asks for nothing when a note nobody showed stopped being an entry", () => {
		assert.deepEqual(touchedDays([], []), []);
	});
});

describe("recountDay", () => {
	it("counts the changed note into its day", () => {
		const changed = entry({ path: "b.md" });
		assert.deepEqual(recountDay(day, [entry({ path: "a.md" })], [changed]), [
			entry({ path: "a.md" }),
			changed,
		]);
	});

	it("keeps the day in the order of the paths", () => {
		const changed = entry({ path: "a.md" });
		const known = [entry({ path: "c.md" }), entry({ path: "b.md" })];
		assert.deepEqual(
			recountDay(day, known, [changed]).map((found) => found.path),
			["a.md", "b.md", "c.md"],
		);
	});

	it("drops the note that left the day", () => {
		const moved = entry({ path: "b.md", created: "2026-09-15", closed: "2026-09-15" });
		assert.deepEqual(recountDay(day, [entry({ path: "a.md" })], [moved]), [
			entry({ path: "a.md" }),
		]);
	});

	it("keeps a note closed elsewhere in the day it was made", () => {
		const trace = entry({ path: "b.md", closed: "2026-09-20" });
		assert.deepEqual(recountDay(day, [], [trace]), [trace]);
	});

	it("drops a note of the day that stopped being an entry", () => {
		assert.deepEqual(recountDay(day, [entry({ path: "a.md" })], []), [entry({ path: "a.md" })]);
	});

	it("empties a day whose only note is gone", () => {
		assert.deepEqual(recountDay(day, [], []), []);
	});

	it("drops a note the cell was showing that no longer belongs to the day", () => {
		const known = [entry({ path: "a.md" }), entry({ path: "b.md", trackPath: "water.md" })];
		assert.deepEqual(recountDay(day, known, []), [entry({ path: "a.md" })]);
	});
});

describe("belongsTo", () => {
	it("tells the entries of a day from the rest", () => {
		assert.equal(belongsTo(entry({ path: "a.md" }), day), true);
		assert.equal(belongsTo(entry({ path: "a.md", created: "2026-09-15", closed: null }), day), false);
		assert.equal(belongsTo(entry({ path: "a.md", trackPath: "water.md" }), day), false);
	});

	it("places an entry in the day it was made and in the day it was closed", () => {
		const late = entry({ path: "a.md", created: "2026-09-10" });
		assert.equal(belongsTo(late, day), true);
		assert.equal(belongsTo(late, { ...day, date: "2026-09-10" }), true);
		assert.equal(belongsTo(late, { ...day, date: "2026-09-12" }), false);
	});
});

describe("sameCell", () => {
	it("tells one cell from another", () => {
		assert.equal(sameCell(day, { ...day }), true);
		assert.equal(sameCell(day, { ...day, date: "2026-09-15" }), false);
		assert.equal(sameCell(day, { ...day, trackPath: "water.md" }), false);
	});
});

describe("touchedDays with tracks above the entry", () => {
	const home = { trackPath: "home.md", descendants: ["harmony.md", "cleaning.md"] };
	const garden = { trackPath: "garden.md", descendants: ["watering.md"] };

	it("names the day in the row of every track the entry stands below", () => {
		assert.deepEqual(touchedDays([], [entry({ path: "a.md" })], [home, garden]), [
			day,
			{ ...day, trackPath: "home.md" },
		]);
	});

	it("names both days of an entry closed on another day, in the rows above too", () => {
		const closed = entry({ path: "a.md", created: "2026-09-10" });
		assert.deepEqual(touchedDays([], [closed], [home]), [
			{ ...day, date: "2026-09-10" },
			{ trackPath: "home.md", date: "2026-09-10" },
			day,
			{ ...day, trackPath: "home.md" },
		]);
	});

	it("leaves the rows alone when the entry stands below none of them", () => {
		assert.deepEqual(touchedDays([], [entry({ path: "a.md" })], [garden]), [day]);
	});

	it("keeps the cells that showed an entry which is none any more", () => {
		const above = { ...day, trackPath: "home.md" };
		assert.deepEqual(touchedDays([day, above], [], [home]), [day, above]);
	});
});
