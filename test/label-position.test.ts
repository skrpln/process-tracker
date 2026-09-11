// Unit tests for the month caption geometry.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { labelOffset } from "../src/render/label-position.ts";

// A view 300 px wide, starting at 100 (the pinned column occupies 0..100).
const view = { viewLeft: 100, viewRight: 400 };

describe("labelOffset", () => {
	it("centres the caption in a fully visible cell", () => {
		const offset = labelOffset({ cellLeft: 100, cellRight: 300, labelWidth: 80, ...view });
		// Cell centre is 200, caption is 80 wide: it starts at 160, i.e. 60 from the cell edge.
		assert.equal(offset, 60);
	});

	it("follows the visible part when the cell runs off the left edge", () => {
		const offset = labelOffset({ cellLeft: -100, cellRight: 300, labelWidth: 80, ...view });
		// Visible part is 100..300, its centre 200, caption starts at 160 → 260 from the cell edge.
		assert.equal(offset, 260);
	});

	it("follows the visible part when the cell runs off the right edge", () => {
		const offset = labelOffset({ cellLeft: 200, cellRight: 900, labelWidth: 80, ...view });
		// Visible part is 200..400, centre 300, caption starts at 260 → 60 from the cell edge.
		assert.equal(offset, 60);
	});

	it("never lets the caption leave its own cell", () => {
		const offset = labelOffset({ cellLeft: 350, cellRight: 900, labelWidth: 80, ...view });
		// Visible part is 350..400; centring would start the caption at 335, before the cell.
		assert.equal(offset, 0);
	});

	it("keeps the caption inside on the right side too", () => {
		const offset = labelOffset({ cellLeft: -500, cellRight: 120, labelWidth: 80, ...view });
		assert.equal(offset, 120 - 80 - -500);
	});

	it("returns zero for a cell out of sight", () => {
		assert.equal(labelOffset({ cellLeft: 500, cellRight: 700, labelWidth: 80, ...view }), 0);
		assert.equal(labelOffset({ cellLeft: -300, cellRight: 0, labelWidth: 80, ...view }), 0);
	});

	it("returns zero when the caption is wider than the cell", () => {
		assert.equal(labelOffset({ cellLeft: 150, cellRight: 200, labelWidth: 80, ...view }), 0);
	});
});
