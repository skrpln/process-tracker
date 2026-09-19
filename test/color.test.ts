// Unit tests for the colour of a track.
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { isCssColor, readCardColor, readColor, resolveTrackColor } from "../src/tracks/color.ts";

/**
 * In the plugin `CSS.supports` is answered by the browser; in Node there is nobody to ask, so
 * the tests put a stand-in that knows the handful of colours they use. The colour grammar is
 * not what is tested here — the trimming, the quotes and the precedence are.
 */
const COLORS = new Set(["#4CAF50", "green", "rgb(76 175 80)", "var(--color-red)"]);

const css = {
	supports: (property: string, value: string) => property === "color" && COLORS.has(value),
};

before(() => {
	(globalThis as Record<string, unknown>).CSS = css;
});

after(() => {
	delete (globalThis as Record<string, unknown>).CSS;
});

describe("isCssColor", () => {
	it("passes every form the browser knows", () => {
		for (const value of COLORS) assert.equal(isCssColor(value), true);
	});

	it("refuses what the browser does not call a colour", () => {
		for (const value of ["blurple", "12", "url(evil.png)", "green; background: red"]) {
			assert.equal(isCssColor(value), false);
		}
	});

	it("says no to everything where there is no browser to ask", () => {
		delete (globalThis as Record<string, unknown>).CSS;
		assert.equal(isCssColor("green"), false);
		(globalThis as Record<string, unknown>).CSS = css;
	});
});

describe("readColor", () => {
	it("reads a colour as it was written", () => {
		assert.equal(readColor("#4CAF50"), "#4CAF50");
	});

	it("trims the spaces around it", () => {
		assert.equal(readColor("  green  "), "green");
	});

	it("takes off the quotes a code block keeps and YAML does not", () => {
		assert.equal(readColor('"#4CAF50"'), "#4CAF50");
		assert.equal(readColor("'green'"), "green");
		assert.equal(readColor('" rgb(76 175 80) "'), "rgb(76 175 80)");
	});

	it("leaves a lone quote where it is, and so refuses the value", () => {
		assert.equal(readColor('"green'), null);
	});

	it("refuses an unreadable value", () => {
		assert.equal(readColor("blurple"), null);
	});

	it("refuses what is not a string at all", () => {
		for (const value of [undefined, null, 16, true, ["green"], { color: "green" }]) {
			assert.equal(readColor(value), null);
		}
	});

	it("refuses an empty value", () => {
		assert.equal(readColor("   "), null);
		assert.equal(readColor('""'), null);
	});
});

describe("readCardColor", () => {
	it("reads the property of the card", () => {
		assert.equal(readCardColor({ track_color: "var(--color-red)" }), "var(--color-red)");
	});

	it("answers with nothing when the card says nothing", () => {
		assert.equal(readCardColor({}), null);
		assert.equal(readCardColor({ track_name: "Cleaning" }), null);
	});

	it("answers with nothing when the card says something unreadable", () => {
		assert.equal(readCardColor({ track_color: "blurple" }), null);
	});
});

describe("resolveTrackColor", () => {
	it("gives the card the last word", () => {
		assert.equal(resolveTrackColor("green", "#4CAF50"), "green");
	});

	it("falls back to the colour of the block", () => {
		assert.equal(resolveTrackColor(null, "#4CAF50"), "#4CAF50");
	});

	it("leaves the colour to the theme when neither said anything", () => {
		assert.equal(resolveTrackColor(null, null), null);
	});
});
