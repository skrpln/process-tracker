// Unit tests for the wheel over the table.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { wheelScroll } from "../src/render/wheel.ts";

const pixels = { deltaX: 0, deltaY: 0, deltaMode: 0 };

describe("wheelScroll", () => {
	it("scrolls the columns by a sideways gesture", () => {
		assert.equal(wheelScroll({ ...pixels, deltaX: 120 }, 600), 120);
		assert.equal(wheelScroll({ ...pixels, deltaX: -40 }, 600), -40);
	});

	it("turns a vertical wheel into the same sideways scrolling", () => {
		assert.equal(wheelScroll({ ...pixels, deltaY: 100 }, 600), 100);
		assert.equal(wheelScroll({ ...pixels, deltaY: -100 }, 600), -100);
	});

	it("follows the stronger axis of a diagonal gesture", () => {
		assert.equal(wheelScroll({ ...pixels, deltaX: 30, deltaY: 4 }, 600), 30);
		assert.equal(wheelScroll({ ...pixels, deltaX: 4, deltaY: 30 }, 600), 30);
	});

	it("counts a gesture measured in lines as pixels", () => {
		assert.equal(wheelScroll({ deltaX: 0, deltaY: 3, deltaMode: 1 }, 600), 48);
	});

	it("counts a gesture measured in pages as the width of the view", () => {
		assert.equal(wheelScroll({ deltaX: 0, deltaY: 2, deltaMode: 2 }, 600), 1200);
		assert.equal(wheelScroll({ deltaX: 0, deltaY: 2, deltaMode: 2 }, -10), 0);
	});

	it("stands still for a gesture that says nothing", () => {
		assert.equal(wheelScroll(pixels, 600), 0);
		assert.equal(wheelScroll({ ...pixels, deltaY: Number.NaN }, 600), 0);
	});
});
