// Unit tests for the recount of a day after one note changed.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { belongsTo, recountDay, sameCell, touchedDays } from "../src/entry/refresh.ts";
import type { CellRef } from "../src/entry/refresh.ts";
import type { Entry } from "../src/model/types.ts";

const day: CellRef = { trackPath: "cleaning.md", date: "2026-09-14" };

function entry(overrides: Partial<Entry> & { path: string }): Entry {
	return { trackPath: "cleaning.md", date: "2026-09-14", done: true, ...overrides };
}

describe("touchedDays", () => {
	it("keeps the day of a note that stayed where it was", () => {
		assert.deepEqual(touchedDays([day], entry({ path: "a.md" })), [day]);
	});

	it("adds the day a note has just claimed", () => {
		assert.deepEqual(touchedDays([], entry({ path: "a.md" })), [day]);
	});

	it("takes both days of a note that moved", () => {
		const moved = entry({ path: "a.md", date: "2026-09-15" });
		assert.deepEqual(touchedDays([day], moved), [day, { ...day, date: "2026-09-15" }]);
	});

	it("takes both days of a note that changed its track", () => {
		const moved = entry({ path: "a.md", trackPath: "water.md" });
		assert.deepEqual(touchedDays([day], moved), [day, { ...day, trackPath: "water.md" }]);
	});

	it("leaves only the days of a note that is no longer an entry", () => {
		assert.deepEqual(touchedDays([day], null), [day]);
	});

	it("asks for nothing when a note nobody showed stopped being an entry", () => {
		assert.deepEqual(touchedDays([], null), []);
	});
});

describe("recountDay", () => {
	it("counts the changed note into its day", () => {
		const changed = entry({ path: "b.md" });
		assert.deepEqual(recountDay(day, [entry({ path: "a.md" })], changed), [
			entry({ path: "a.md" }),
			changed,
		]);
	});

	it("keeps the day in the order of the paths", () => {
		const changed = entry({ path: "a.md" });
		const known = [entry({ path: "c.md" }), entry({ path: "b.md" })];
		assert.deepEqual(
			recountDay(day, known, changed).map((found) => found.path),
			["a.md", "b.md", "c.md"],
		);
	});

	it("drops the note that left the day", () => {
		const moved = entry({ path: "b.md", date: "2026-09-15" });
		assert.deepEqual(recountDay(day, [entry({ path: "a.md" })], moved), [
			entry({ path: "a.md" }),
		]);
	});

	it("drops a note of the day that stopped being an entry", () => {
		assert.deepEqual(recountDay(day, [entry({ path: "a.md" })], null), [entry({ path: "a.md" })]);
	});

	it("empties a day whose only note is gone", () => {
		assert.deepEqual(recountDay(day, [], null), []);
	});

	it("drops a note the cell was showing that no longer belongs to the day", () => {
		const known = [entry({ path: "a.md" }), entry({ path: "b.md", trackPath: "water.md" })];
		assert.deepEqual(recountDay(day, known, null), [entry({ path: "a.md" })]);
	});
});

describe("belongsTo", () => {
	it("tells the entries of a day from the rest", () => {
		assert.equal(belongsTo(entry({ path: "a.md" }), day), true);
		assert.equal(belongsTo(entry({ path: "a.md", date: "2026-09-15" }), day), false);
		assert.equal(belongsTo(entry({ path: "a.md", trackPath: "water.md" }), day), false);
	});
});

describe("sameCell", () => {
	it("tells one cell from another", () => {
		assert.equal(sameCell(day, { ...day }), true);
		assert.equal(sameCell(day, { ...day, date: "2026-09-15" }), false);
		assert.equal(sameCell(day, { ...day, trackPath: "water.md" }), false);
	});
});
