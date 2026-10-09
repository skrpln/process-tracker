// Unit tests for the corner title: placeholders and links.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_TITLE, fillTitle, followsScroll, titleParts } from "../src/codeblock/title.ts";

describe("followsScroll", () => {
	it("follows the scroll with a placeholder", () => {
		assert.equal(followsScroll(DEFAULT_TITLE), true);
		assert.equal(followsScroll("Morning · {{year}}"), true);
		assert.equal(followsScroll("{{ Month }}"), true);
	});

	it("stands still without one", () => {
		assert.equal(followsScroll("Morning"), false);
		assert.equal(followsScroll("[[Habits]]"), false);
		assert.equal(followsScroll(""), false);
		assert.equal(followsScroll("{{day}}"), false);
	});
});

describe("fillTitle", () => {
	it("fills the default title", () => {
		assert.equal(fillTitle(DEFAULT_TITLE, "october", "2026"), "october 2026");
	});

	it("fills every placeholder, in any case and with spaces inside", () => {
		assert.equal(
			fillTitle("Утро · {{MONTH}} {{ year }} / {{year}}", "may", "2025"),
			"Утро · may 2025 / 2025",
		);
	});

	it("fills a placeholder inside a link", () => {
		assert.equal(fillTitle("[[{{year}}]]", "may", "2025"), "[[2025]]");
	});

	it("leaves unknown placeholders and plain text alone", () => {
		assert.equal(fillTitle("{{day}} Morning", "may", "2025"), "{{day}} Morning");
	});
});

describe("titleParts", () => {
	it("keeps plain text whole", () => {
		assert.deepEqual(titleParts("Morning · may 2025"), [{ text: "Morning · may 2025" }]);
	});

	it("is empty for an empty title", () => {
		assert.deepEqual(titleParts(""), []);
	});

	it("cuts links out of the text", () => {
		assert.deepEqual(titleParts("Morning [[Habits]] may"), [
			{ text: "Morning " },
			{ text: "Habits", link: "Habits" },
			{ text: " may" },
		]);
	});

	it("shows the text after the bar", () => {
		assert.deepEqual(titleParts("[[Habits/Morning|morning]]"), [
			{ text: "morning", link: "Habits/Morning" },
		]);
	});

	it("shows a heading as Obsidian does", () => {
		assert.deepEqual(titleParts("[[Habits#Morning]]"), [
			{ text: "Habits > Morning", link: "Habits#Morning" },
		]);
	});

	it("reads two links side by side", () => {
		assert.deepEqual(titleParts("[[A]][[B]]"), [
			{ text: "A", link: "A" },
			{ text: "B", link: "B" },
		]);
	});

	it("leaves an empty or broken link as text", () => {
		assert.deepEqual(titleParts("[[ ]]"), [{ text: "[[ ]]" }]);
		assert.deepEqual(titleParts("[[Habits"), [{ text: "[[Habits" }]);
	});

	it("keeps the rest of markdown as written", () => {
		assert.deepEqual(titleParts("**Morning**"), [{ text: "**Morning**" }]);
	});
});
