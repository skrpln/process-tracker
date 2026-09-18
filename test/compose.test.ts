// Unit tests for the name and the text of a new entry note.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { composeEntry, entryFileName, entryPath } from "../src/entry/compose.ts";

const fields = { track: "[[cleaning]]", date: "2026-09-13", done: false };

describe("composeEntry", () => {
	it("writes a bare note when the card names no template", () => {
		assert.equal(
			composeEntry(null, fields),
			'---\ntrack: "[[cleaning]]"\ndate: 2026-09-13\ndone: false\n---\n',
		);
	});

	it("checks the box when the click asked for it", () => {
		assert.match(composeEntry(null, { ...fields, done: true }), /^done: true$/m);
	});

	it("fills the empty properties of a template", () => {
		const template = "---\ntrack:\ndate:\ndone: false\n---\n\nТело шаблона\n";
		assert.equal(
			composeEntry(template, fields),
			'---\ntrack: "[[cleaning]]"\ndate: 2026-09-13\ndone: false\n---\n\nТело шаблона\n',
		);
	});

	it("keeps the other properties of a template, in their order", () => {
		const template = "---\nmood:\ntrack:\ntags:\n  - entry\n---\n";
		assert.equal(
			composeEntry(template, fields),
			'---\nmood:\ntrack: "[[cleaning]]"\ntags:\n  - entry\ndate: 2026-09-13\ndone: false\n---\n',
		);
	});

	it("replaces a property written as a list, and the list with it", () => {
		const template = "---\ntrack:\n  - [[old]]\n  - [[older]]\nmood: ясно\n---\n";
		assert.equal(
			composeEntry(template, fields),
			'---\ntrack: "[[cleaning]]"\nmood: ясно\ndate: 2026-09-13\ndone: false\n---\n',
		);
	});

	it("wins over a template that fills the three properties itself", () => {
		const template = "---\ntrack: [[wrong]]\ndate: <% tp.date.now() %>\ndone: true\n---\n";
		assert.equal(
			composeEntry(template, fields),
			'---\ntrack: "[[cleaning]]"\ndate: 2026-09-13\ndone: false\n---\n',
		);
	});

	it("leaves the commands of the body to Templater", () => {
		const template = "---\ntrack:\n---\n\n<% tp.file.cursor() %>\n";
		assert.match(composeEntry(template, fields), /<% tp\.file\.cursor\(\) %>/);
	});

	it("gives frontmatter to a template that has none", () => {
		assert.equal(
			composeEntry("Просто текст\n", fields),
			'---\ntrack: "[[cleaning]]"\ndate: 2026-09-13\ndone: false\n---\nПросто текст\n',
		);
	});

	it("treats an unclosed fence as a body, not as properties", () => {
		const text = composeEntry("---\ntrack:\nбез закрывающей черты\n", fields);
		assert.match(text, /^---\ntrack: "\[\[cleaning\]\]"/);
		assert.match(text, /без закрывающей черты/);
	});

	it("quotes a link and escapes what would break the quotes", () => {
		assert.match(composeEntry(null, { ...fields, track: '[[a "b"]]' }), /^track: "\[\[a \\"b\\"\]\]"$/m);
	});
});

describe("entryFileName", () => {
	it("names a note after its track and day", () => {
		assert.equal(entryFileName("cleaning", "2026-09-13"), "cleaning 2026-09-13");
	});

	it("drops the characters a file name cannot keep", () => {
		assert.equal(entryFileName('10/10 : "чистота"', "2026-09-13"), "10 10 чистота 2026-09-13");
	});

	it("falls back to the day alone when nothing is left of the name", () => {
		assert.equal(entryFileName("///", "2026-09-13"), "2026-09-13");
	});
});

describe("entryPath", () => {
	it("puts a note into the root when no folder is set", () => {
		assert.equal(entryPath("", "cleaning 2026-09-13"), "cleaning 2026-09-13.md");
	});

	it("puts a note into the folder of the settings", () => {
		assert.equal(entryPath("Журнал/Свидетельства", "e"), "Журнал/Свидетельства/e.md");
	});

	it("tolerates slashes around the folder", () => {
		assert.equal(entryPath("/Журнал/", "e"), "Журнал/e.md");
	});
});
