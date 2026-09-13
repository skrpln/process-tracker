// Unit tests for visible columns and the year they belong to.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { dominantYear, visibleColumnRange } from "../src/render/visible.ts";

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

describe("dominantYear", () => {
	it("takes the year of more than half the visible columns", () => {
		assert.equal(dominantYear([2026, 2026, 2026, 2025], 2026), 2026);
		assert.equal(dominantYear([2025, 2025, 2025, 2026], 2026), 2025);
	});

	it("keeps the current year on an exact half", () => {
		assert.equal(dominantYear([2026, 2026, 2025, 2025], 2026), 2026);
		assert.equal(dominantYear([2026, 2026, 2025, 2025], 2025), 2025);
	});

	it("switches as soon as the other year passes half", () => {
		const visible = (older: number) => [
			...Array<number>(older).fill(2025),
			...Array<number>(10 - older).fill(2026),
		];
		assert.equal(dominantYear(visible(5), 2026), 2026);
		assert.equal(dominantYear(visible(6), 2026), 2025);
	});

	it("keeps the current year when three years share the view without a majority", () => {
		assert.equal(dominantYear([2026, 2025, 2024], 2026), 2026);
	});

	it("keeps the current year when nothing is visible", () => {
		assert.equal(dominantYear([], 2025), 2025);
	});
});
