// Unit tests for the name and the text of a new entry note.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_PROPERTY_NAMES } from "../src/constants.ts";
import {
	composeEntry as compose,
	entryFileName,
	entryPath,
	recordBody,
} from "../src/entry/compose.ts";
import type { EntryFields } from "../src/entry/compose.ts";

const fields: EntryFields = { track: "[[cleaning]]", created: "2026-09-13", done: false, closed: null };

/** Composes under the names the plugin uses until the settings rename them. */
function composeEntry(template: string | null, given: EntryFields): string {
	return compose(template, given, DEFAULT_PROPERTY_NAMES);
}

describe("composeEntry", () => {
	it("writes a bare note when the card names no template", () => {
		assert.equal(
			composeEntry(null, fields),
			'---\ntrack: "[[cleaning]]"\ncreated: 2026-09-13\ndone: false\n---\n',
		);
	});

	it("checks the box when the click asked for it, and closes it on the day of the cell", () => {
		const closed = { ...fields, done: true, closed: "2026-09-13 21:40" };
		assert.equal(
			composeEntry(null, closed),
			'---\ntrack: "[[cleaning]]"\ncreated: 2026-09-13\ndone: true\nclosed: 2026-09-13 21:40\n---\n',
		);
	});

	it("leaves the closed of a template alone when the entry is open", () => {
		assert.match(composeEntry("---\nclosed:\n---\n", fields), /^closed:$/m);
	});

	it("leaves the date of an older template alone and does not write one", () => {
		const text = composeEntry("---\ntrack:\ndate:\ndone: false\n---\n", fields);
		assert.equal(text, '---\ntrack: "[[cleaning]]"\ndate:\ndone: false\ncreated: 2026-09-13\n---\n');
	});

	it("writes the properties under the names the settings give them", () => {
		const names = { track: "project", created: "made", done: "finished", closed: "ended" };
		const text = compose(null, { ...fields, done: true, closed: "2026-09-13 08:00" }, names);
		assert.equal(
			text,
			'---\nproject: "[[cleaning]]"\nmade: 2026-09-13\nfinished: true\nended: 2026-09-13 08:00\n---\n',
		);
	});

	it("fills the empty properties of a template", () => {
		const template = "---\ntrack:\ncreated:\ndone: false\n---\n\nТело шаблона\n";
		assert.equal(
			composeEntry(template, fields),
			'---\ntrack: "[[cleaning]]"\ncreated: 2026-09-13\ndone: false\n---\n\nТело шаблона\n',
		);
	});

	it("keeps the other properties of a template, in their order", () => {
		const template = "---\nmood:\ntrack:\ntags:\n  - entry\n---\n";
		assert.equal(
			composeEntry(template, fields),
			'---\nmood:\ntrack: "[[cleaning]]"\ntags:\n  - entry\ncreated: 2026-09-13\ndone: false\n---\n',
		);
	});

	it("replaces a property written as a list, and the list with it", () => {
		const template = "---\ntrack:\n  - [[old]]\n  - [[older]]\nmood: ясно\n---\n";
		assert.equal(
			composeEntry(template, fields),
			'---\ntrack: "[[cleaning]]"\nmood: ясно\ncreated: 2026-09-13\ndone: false\n---\n',
		);
	});

	it("wins over a template that fills its properties itself", () => {
		const template = "---\ntrack: [[wrong]]\ncreated: <% tp.date.now() %>\ndone: true\n---\n";
		assert.equal(
			composeEntry(template, fields),
			'---\ntrack: "[[cleaning]]"\ncreated: 2026-09-13\ndone: false\n---\n',
		);
	});

	it("leaves the commands of the body to Templater", () => {
		const template = "---\ntrack:\n---\n\n<% tp.file.cursor() %>\n";
		assert.match(composeEntry(template, fields), /<% tp\.file\.cursor\(\) %>/);
	});

	it("gives frontmatter to a template that has none", () => {
		assert.equal(
			composeEntry("Просто текст\n", fields),
			'---\ntrack: "[[cleaning]]"\ncreated: 2026-09-13\ndone: false\n---\nПросто текст\n',
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

describe("recordBody", () => {
	it("leaves the properties of the template out", () => {
		assert.equal(recordBody("---\nmood:\n---\ntext\n"), "text\n");
	});

	it("takes out a line that held nothing but Templater commands", () => {
		assert.equal(
			recordBody('<%* await tp.file.move("x/" + tp.file.title) %>\ntext\n  <% tp.file.cursor() %>  \n'),
			"text\n",
		);
	});

	it("keeps the text of a line around a command", () => {
		assert.equal(recordBody("Started <% tp.date.now() %> sharp"), "Started  sharp");
	});

	it("takes out a command that runs over several lines, with its lines", () => {
		assert.equal(recordBody("a\n<%*\nconst x = 1;\ntR += x;\n%>\nb"), "a\nb");
	});

	it("keeps blank lines and a body without commands as they are", () => {
		assert.equal(recordBody("a\n\nb"), "a\n\nb");
	});
});
