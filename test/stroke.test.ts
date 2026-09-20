// Unit tests for the thread under a streak of closed days.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MIN_STREAK, streakEdges, strokeMarks } from "../src/render/stroke.ts";
import type { StrokeMark } from "../src/render/stroke.ts";

/** Days of one september, oldest first; the table shows them in either direction. */
function days(from: number, count: number): string[] {
	return Array.from({ length: count }, (_, i) => `2026-09-${String(from + i).padStart(2, "0")}`);
}

/** A row read from a picture: `#` — a closed day, `.` — anything else. */
function row(picture: string, before = 0, after = 0): (StrokeMark | null)[] {
	const closed = Array.from(picture, (mark) => mark === "#");
	return strokeMarks(closed, { before, after });
}

describe("strokeMarks", () => {
	it("threads three closed days together", () => {
		assert.deepEqual(row("###"), ["start", "mid", "end"]);
	});

	it("leaves two days alone", () => {
		assert.deepEqual(row("##."), [null, null, null]);
	});

	it("leaves a row nobody closed alone", () => {
		assert.deepEqual(row("...."), [null, null, null, null]);
	});

	it("threads a long streak through every day of it", () => {
		assert.deepEqual(row("#####"), ["start", "mid", "mid", "mid", "end"]);
	});

	it("breaks a streak on an open day, and counts the halves apart", () => {
		// Two by two is no streak at all: the break costs both halves their thread.
		assert.deepEqual(row("##.##"), [null, null, null, null, null]);
	});

	it("threads several streaks of one row", () => {
		assert.deepEqual(row("###.###"), ["start", "mid", "end", null, "start", "mid", "end"]);
	});

	it("answers for an empty window", () => {
		assert.deepEqual(row(""), []);
	});
});

describe("a streak that runs past the window", () => {
	it("threads a single visible day of a long streak, off both edges", () => {
		assert.deepEqual(row("#", 2, 2), ["mid"]);
	});

	it("counts the days before the first column", () => {
		// Two visible days would be no streak on their own; one day before the window
		// makes three, and the thread leaves by the left edge.
		assert.deepEqual(row("##", 1), ["mid", "end"]);
	});

	it("counts the days after the last column", () => {
		assert.deepEqual(row("##", 0, 1), ["start", "mid"]);
	});

	it("gives the days outside to the runs that touch an edge, and to no others", () => {
		// The day at the left edge takes the streak coming from outside and ends it at its
		// own checkmark; the day at the right edge starts one that leaves the table. The run
		// in the middle keeps its own length: what lies beyond the window is no business of a
		// streak that ends inside it.
		assert.deepEqual(row("#.##.#", 2, 2), ["end", null, null, null, null, "start"]);
	});
});

describe("streakEdges", () => {
	/** The vault is a set of closed days; everything else is open. */
	function edges(shown: string[], order: "asc" | "desc", closed: string[]) {
		const vault = new Set(closed);
		return streakEdges({ days: shown, order, closed: (date) => vault.has(date) });
	}

	it("counts the closed days on both sides of the window", () => {
		assert.deepEqual(edges(days(12, 2), "asc", days(10, 6)), { before: 2, after: 2 });
	});

	it("counts nothing where the streak stops at the edge", () => {
		assert.deepEqual(edges(days(12, 2), "asc", days(12, 2)), { before: 0, after: 0 });
	});

	it("looks the other way round when the columns run the other way", () => {
		// Columns from the newest day back: the day beyond the left edge is a later one.
		assert.deepEqual(edges(["2026-09-13", "2026-09-12"], "desc", days(12, 3)), {
			before: 1,
			after: 0,
		});
	});

	it("crosses the end of a month like any other day", () => {
		const closed = ["2026-09-29", "2026-09-30", "2026-10-01"];
		assert.deepEqual(edges(["2026-10-01"], "asc", closed), { before: 2, after: 0 });
	});

	it("asks about the days beyond the edge and no further", () => {
		const asked: string[] = [];
		streakEdges({
			days: days(20, 1),
			order: "asc",
			closed: (date) => {
				asked.push(date);
				return true;
			},
		});
		// Nothing about a streak longer than the threshold changes the drawing.
		assert.equal(asked.length, MIN_STREAK * 2);
		assert.deepEqual(asked.slice(0, 2), ["2026-09-19", "2026-09-18"]);
	});

	it("answers for an empty window", () => {
		assert.deepEqual(edges([], "asc", days(10, 3)), { before: 0, after: 0 });
	});
});
