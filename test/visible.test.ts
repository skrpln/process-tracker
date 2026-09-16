// Unit tests for visible columns and the year they belong to.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	captionLabel,
	dominantLabel,
	columnWidth,
	visibleColumnRange,
} from "../src/render/visible.ts";

// A 300 px frame: 10 columns of 30 px fit into it.
const base = { viewWidth: 300, columnWidth: 30, total: 50 };

describe("visibleColumnRange", () => {
	it("starts at the first column when nothing is scrolled", () => {
		assert.deepEqual(visibleColumnRange({ ...base, scrollLeft: 0 }), { first: 0, last: 9 });
	});

	it("moves with the scroll offset", () => {
		assert.deepEqual(visibleColumnRange({ ...base, scrollLeft: 300 }), { first: 10, last: 19 });
	});

	it("counts a partially visible column", () => {
		assert.deepEqual(visibleColumnRange({ ...base, scrollLeft: 15 }), { first: 0, last: 10 });
	});

	it("never runs past the last column", () => {
		const range = visibleColumnRange({ ...base, scrollLeft: 10_000 });
		assert.deepEqual(range, { first: 49, last: 49 });
	});

	it("returns nothing when the frame has no width to show columns in", () => {
		assert.equal(visibleColumnRange({ ...base, scrollLeft: 0, viewWidth: 0 }), null);
	});

	it("returns nothing for an unmeasured or empty table", () => {
		assert.equal(visibleColumnRange({ ...base, scrollLeft: 0, columnWidth: 0 }), null);
		assert.equal(visibleColumnRange({ ...base, scrollLeft: 0, total: 0 }), null);
	});
});

describe("dominantLabel", () => {
	it("takes the caption of more than half the visible columns", () => {
		assert.equal(dominantLabel(["May", "May", "May", "June"], "May"), "May");
		assert.equal(dominantLabel(["June", "June", "June", "May"], "May"), "June");
	});

	it("keeps the current caption on an exact half", () => {
		assert.equal(dominantLabel(["May", "May", "June", "June"], "May"), "May");
		assert.equal(dominantLabel(["May", "May", "June", "June"], "June"), "June");
	});

	it("switches as soon as the other one passes half", () => {
		const visible = (older: number) => [
			...Array<string>(older).fill("may 2026"),
			...Array<string>(10 - older).fill("june 2026"),
		];
		assert.equal(dominantLabel(visible(5), "june 2026"), "june 2026");
		assert.equal(dominantLabel(visible(6), "june 2026"), "may 2026");
	});

	it("keeps the current caption when three months share the view", () => {
		assert.equal(dominantLabel(["May", "June", "July"], "June"), "June");
	});

	it("keeps the current caption when nothing is visible", () => {
		assert.equal(dominantLabel([], "may 2026"), "may 2026");
	});
});

describe("captionLabel", () => {
	it("takes the first column at the left edge, whatever the majority says", () => {
		const labels = [...Array<string>(10).fill("june 2026"), ...Array<string>(10).fill("may 2026")];
		assert.equal(captionLabel(labels, "may 2026", true), "june 2026");
	});

	it("follows the majority once the table is scrolled", () => {
		assert.equal(captionLabel(["May", "May", "May", "June"], "June", false), "May");
	});

	it("keeps the current caption on a tie away from the edge", () => {
		assert.equal(captionLabel(["June", "June", "May", "May"], "May", false), "May");
	});

	it("keeps the current caption when nothing is visible at the edge", () => {
		assert.equal(captionLabel([], "june 2026", true), "june 2026");
	});
});

describe("columnWidth", () => {
	const square = { rowHeight: 26.4, checkbox: 20, caption: 22 };

	it("takes the height of a row when nothing else is wider", () => {
		assert.equal(columnWidth(square, null), 26.4);
	});

	it("widens the column for a checkbox the theme stretched", () => {
		assert.equal(columnWidth({ ...square, checkbox: 58 }, null), 58);
	});

	it("widens the column for a caption the theme padded", () => {
		assert.equal(columnWidth({ ...square, caption: 66 }, null), 66);
	});

	it("never goes below the height of a row", () => {
		assert.equal(columnWidth({ rowHeight: 26.4, checkbox: 8, caption: 10 }, null), 26.4);
	});

	it("ignores a change under half a pixel", () => {
		assert.equal(columnWidth(square, 26.4), null);
		assert.equal(columnWidth({ ...square, rowHeight: 26.7 }, 26.4), null);
	});

	it("reports a real change, in both directions", () => {
		assert.equal(columnWidth({ ...square, rowHeight: 31 }, 26.4), 31);
		assert.equal(columnWidth({ ...square, rowHeight: 20, caption: 8 }, 26.4), 20);
	});

	it("stays silent while the table has no layout yet", () => {
		assert.equal(columnWidth({ rowHeight: 0, checkbox: 0, caption: 0 }, null), null);
		assert.equal(
			columnWidth({ rowHeight: Number.NaN, checkbox: Number.NaN, caption: Number.NaN }, null),
			null,
		);
		assert.equal(columnWidth({ rowHeight: -5, checkbox: -2, caption: -1 }, 26), null);
	});

	it("ignores a measurement that has not arrived yet", () => {
		assert.equal(columnWidth({ rowHeight: 26.4, checkbox: 0, caption: Number.NaN }, null), 26.4);
	});
});
