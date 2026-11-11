// Unit tests for visible columns and the year they belong to.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	captionLabel,
	dominantLabel,
	columnWidth,
	draggedWidth,
	layoutHeight,
	screenScale,
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
	const square = { rowHeight: 26.4, checkbox: 20, caption: 22, mark: 0 };

	it("takes the height of a row when nothing else is wider", () => {
		assert.equal(columnWidth(square, null), 26.4);
	});

	it("widens the column for a checkbox the theme stretched", () => {
		assert.equal(columnWidth({ ...square, checkbox: 58 }, null), 58);
	});

	it("widens the column for a caption the theme padded", () => {
		assert.equal(columnWidth({ ...square, caption: 66 }, null), 66);
	});

	it("widens the column for a mark wider than the box it replaces", () => {
		assert.equal(columnWidth({ ...square, mark: 34 }, null), 34);
	});

	it("never goes below the height of a row", () => {
		assert.equal(columnWidth({ rowHeight: 26.4, checkbox: 8, caption: 10, mark: 0 }, null), 26.4);
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
		assert.equal(columnWidth({ rowHeight: 0, checkbox: 0, caption: 0, mark: 0 }, null), null);
		assert.equal(
			columnWidth({
				rowHeight: Number.NaN,
				checkbox: Number.NaN,
				caption: Number.NaN,
				mark: Number.NaN,
			}, null),
			null,
		);
		assert.equal(columnWidth({ rowHeight: -5, checkbox: -2, caption: -1, mark: -1 }, 26), null);
	});

	it("ignores a measurement that has not arrived yet", () => {
		assert.equal(columnWidth({ rowHeight: 26.4, checkbox: 0, caption: Number.NaN, mark: 0 }, null), 26.4);
	});
});

describe("screenScale", () => {
	it("is one in a note, where nothing is transformed", () => {
		assert.equal(screenScale(500, 500), 1);
	});

	it("follows a canvas zoomed out", () => {
		assert.equal(screenScale(475, 500), 0.95);
	});

	it("follows a canvas zoomed in", () => {
		assert.equal(screenScale(1000, 500), 2);
	});

	it("is one for a table without a layout", () => {
		assert.equal(screenScale(0, 0), 1);
		assert.equal(screenScale(475, 0), 1);
		assert.equal(screenScale(Number.NaN, 500), 1);
	});
});

describe("layoutHeight", () => {
	it("takes the computed height, which no canvas zoom touches", () => {
		assert.equal(layoutHeight("26.5px", 25.175, 0.95), 26.5);
	});

	it("falls back to the screen height over the scale when the style gives no number", () => {
		assert.equal(layoutHeight("auto", 50, 2), 25);
		assert.equal(layoutHeight("", 24, 0.75), 32);
	});

	it("does not take a zero height for an answer", () => {
		assert.equal(layoutHeight("0px", 30, 1), 30);
	});
});

describe("draggedWidth", () => {
	// A column of 180 px in a note, free to move between 40 and 500.
	const drag = { start: 180, moved: 0, scale: 1, min: 40, max: 500 };

	it("follows the pointer both ways", () => {
		assert.equal(draggedWidth({ ...drag, moved: 30 }), 210);
		assert.equal(draggedWidth({ ...drag, moved: -30 }), 150);
		assert.equal(draggedWidth(drag), 180);
	});

	it("answers in whole pixels", () => {
		assert.equal(draggedWidth({ ...drag, start: 180.4, moved: 10.3 }), 191);
	});

	it("divides the way of the pointer by the zoom of a canvas", () => {
		assert.equal(draggedWidth({ ...drag, moved: 30, scale: 0.5 }), 240);
		assert.equal(draggedWidth({ ...drag, moved: 30, scale: 2 }), 195);
	});

	it("takes a scale it cannot read as none", () => {
		assert.equal(draggedWidth({ ...drag, moved: 30, scale: 0 }), 210);
		assert.equal(draggedWidth({ ...drag, moved: 30, scale: Number.NaN }), 210);
	});

	it("stops at the narrowest and at the widest the column may be", () => {
		assert.equal(draggedWidth({ ...drag, moved: -1000 }), 40);
		assert.equal(draggedWidth({ ...drag, moved: 1000 }), 500);
	});

	it("keeps the lower limit where the frame leaves no room for both", () => {
		assert.equal(draggedWidth({ ...drag, max: 20 }), 40);
		assert.equal(draggedWidth({ ...drag, moved: 300, max: 20 }), 40);
	});
});
