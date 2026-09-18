// Unit tests for the repaint plan of a changed entry note.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { planRefresh, sameCell } from "../src/entry/refresh.ts";
import type { CellRef } from "../src/entry/refresh.ts";
import type { Entry } from "../src/model/types.ts";

const entry: Entry = {
	path: "entry/cleaning 2026-09-14.md",
	trackPath: "tracks/cleaning.md",
	date: "2026-09-14",
	done: true,
};

const own: CellRef = { trackPath: "tracks/cleaning.md", date: "2026-09-14" };

describe("planRefresh", () => {
	it("checks the box of the cell the note already holds", () => {
		const plan = planRefresh(entry, [own]);
		assert.deepEqual(plan.clear, []);
		assert.deepEqual(plan.paint, {
			cell: own,
			state: "done",
			entryPath: "entry/cleaning 2026-09-14.md",
		});
	});

	it("takes the mark back when the note says it is not done", () => {
		const plan = planRefresh({ ...entry, done: false }, [own]);
		assert.equal(plan.paint?.state, "draft");
		assert.deepEqual(plan.clear, []);
	});

	it("paints a cell the table does not show yet", () => {
		const plan = planRefresh(entry, []);
		assert.deepEqual(plan.clear, []);
		assert.equal(plan.paint?.cell.date, "2026-09-14");
	});

	it("empties the old cell when the note moves to another day", () => {
		const plan = planRefresh({ ...entry, date: "2026-09-15" }, [own]);
		assert.deepEqual(plan.clear, [own]);
		assert.deepEqual(plan.paint?.cell, { trackPath: "tracks/cleaning.md", date: "2026-09-15" });
	});

	it("empties the old cell when the note moves to another track", () => {
		const plan = planRefresh({ ...entry, trackPath: "tracks/sport.md" }, [own]);
		assert.deepEqual(plan.clear, [own]);
		assert.equal(plan.paint?.cell.trackPath, "tracks/sport.md");
	});

	it("empties every cell of a note that is no longer an entry", () => {
		const other: CellRef = { trackPath: "tracks/sport.md", date: "2026-09-14" };
		const plan = planRefresh(null, [own, other]);
		assert.deepEqual(plan.clear, [own, other]);
		assert.equal(plan.paint, null);
	});

	it("asks for nothing when a gone note was showing nowhere", () => {
		const plan = planRefresh(null, []);
		assert.deepEqual(plan, { clear: [], paint: null });
	});
});

describe("sameCell", () => {
	it("tells cells apart by track and by date", () => {
		assert.equal(sameCell(own, { ...own }), true);
		assert.equal(sameCell(own, { ...own, date: "2026-09-15" }), false);
		assert.equal(sameCell(own, { ...own, trackPath: "tracks/sport.md" }), false);
	});
});
