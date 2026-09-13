// Unit tests for visible columns and the year they belong to.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { captionLabel, dominantLabel, visibleColumnRange } from "../src/render/visible.ts";

// A 400 px container, 100 px of it covered by the pinned column: 10 columns of 30 px fit.
const base = { viewWidth: 400, pinnedWidth: 100, columnWidth: 30, total: 50 };

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

	it("returns nothing when the pinned column covers the whole view", () => {
		assert.equal(visibleColumnRange({ ...base, scrollLeft: 0, pinnedWidth: 400 }), null);
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
			...Array<string>(older).fill("May 2026"),
			...Array<string>(10 - older).fill("June 2026"),
		];
		assert.equal(dominantLabel(visible(5), "June 2026"), "June 2026");
		assert.equal(dominantLabel(visible(6), "June 2026"), "May 2026");
	});

	it("keeps the current caption when three months share the view", () => {
		assert.equal(dominantLabel(["May", "June", "July"], "June"), "June");
	});

	it("keeps the current caption when nothing is visible", () => {
		assert.equal(dominantLabel([], "May 2026"), "May 2026");
	});
});

describe("captionLabel", () => {
	it("takes the first column at the left edge, whatever the majority says", () => {
		const labels = [...Array<string>(10).fill("June 2026"), ...Array<string>(10).fill("May 2026")];
		assert.equal(captionLabel(labels, "May 2026", true), "June 2026");
	});

	it("follows the majority once the table is scrolled", () => {
		assert.equal(captionLabel(["May", "May", "May", "June"], "June", false), "May");
	});

	it("keeps the current caption on a tie away from the edge", () => {
		assert.equal(captionLabel(["June", "June", "May", "May"], "May", false), "May");
	});

	it("keeps the current caption when nothing is visible at the edge", () => {
		assert.equal(captionLabel([], "June 2026", true), "June 2026");
	});
});
