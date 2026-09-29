// Unit tests for the records of a track journal: reading, placing and writing them.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	insertRecord,
	readRecords,
	recordLines,
	recordPlace,
	scanOutline,
	setRecordDone,
} from "../src/entry/journal.ts";

/** The records of a text, read the way a write reads them. */
function records(text: string) {
	return readRecords(scanOutline(text));
}

describe("readRecords", () => {
	it("reads a record: its date, its box, its mark", () => {
		const [record] = records("# Journal\n## 2026-09-28 evening\n- [x] done\n### 🔥\ntext");
		assert.equal(record.date, "2026-09-28");
		assert.equal(record.heading, "2026-09-28 evening");
		assert.equal(record.line, 1);
		assert.deepEqual(record.box, { line: 2, done: true });
		assert.equal(record.mark, "🔥");
		assert.equal(record.nth, 0);
	});

	it("takes no mark from the heading of the record", () => {
		assert.equal(records("## 2026-09-28 🔥\n- [x] done")[0].mark, null);
	});

	it("takes the first third-level heading of one sign for the mark", () => {
		const text = "## 2026-09-28\n### Steps\n### 10\n### 👍🏽\n### 4";
		assert.equal(records(text)[0].mark, "👍🏽");
	});

	it("takes no mark from other levels, or from the next record", () => {
		const text = "## 2026-09-28\n#### 4\n## 2026-09-27\n### 5";
		const [first, second] = records(text);
		assert.equal(first.mark, null);
		assert.equal(second.mark, "5");
	});

	it("takes only second-level headings that start with a date", () => {
		const text = "# 2026-09-01\n## Notes\n### 2026-09-02\n## 2026-09-03\n## 2026-09-040";
		assert.deepEqual(
			records(text).map((record) => record.date),
			["2026-09-03"],
		);
	});

	it("gives a record without a box no done", () => {
		assert.equal(records("## 2026-09-28\ntext")[0].box, null);
	});

	it("takes the first box, wherever it stands inside the record", () => {
		const text = "## 2026-09-28\ntext\n### Steps\n- [ ] one\n- [x] two";
		assert.deepEqual(records(text)[0].box, { line: 3, done: false });
	});

	it("does not take a box of the next record or section", () => {
		const text = "## 2026-09-28\n# 2026\n- [x] done\n## 2026-09-27\n- [ ] done";
		const [first, second] = records(text);
		assert.equal(first.box, null);
		assert.deepEqual(second.box, { line: 4, done: false });
	});

	it("reads any sign but a space as closed", () => {
		assert.equal(records("## 2026-09-28\n- [-] done")[0].box?.done, true);
		assert.equal(records("## 2026-09-28\n- [ ] done")[0].box?.done, false);
	});

	it("counts the records of one date in the order they stand", () => {
		const text = "## 2026-09-28\n## 2026-09-27\n## 2026-09-28 again";
		assert.deepEqual(
			records(text).map((record) => [record.date, record.nth]),
			[
				["2026-09-28", 0],
				["2026-09-27", 0],
				["2026-09-28", 1],
			],
		);
	});

	it("ends a record at the next heading of the first or second level", () => {
		const text = "## 2026-09-28\n### part\ntext\n# 2025\n## 2025-12-31";
		const [first, second] = records(text);
		assert.equal(first.end, 3);
		assert.equal(second.end, 5);
	});

	it("gives no mark to a record without one", () => {
		assert.equal(records("## 2026-09-28\n### Notes")[0].mark, null);
	});
});

describe("scanOutline", () => {
	it("skips the frontmatter", () => {
		const outline = scanOutline("---\ntags: x\n# not a heading\n---\n# Journal");
		assert.deepEqual(outline.headings, [{ level: 1, line: 4, end: 4, text: "Journal" }]);
	});

	it("skips headings and boxes inside code blocks", () => {
		const outline = scanOutline("```\n## 2026-09-28\n- [x] done\n```\n~~~~\n# x\n~~~\n~~~~");
		assert.deepEqual(outline.headings, []);
		assert.deepEqual(outline.tasks, []);
	});

	it("does not take a tag for a heading", () => {
		assert.deepEqual(scanOutline("#tag\n#").headings, [{ level: 1, line: 1, end: 1, text: "" }]);
	});

	it("drops the closing hashes of a heading", () => {
		assert.equal(scanOutline("## 2026-09-28 🔥 ##").headings[0].text, "2026-09-28 🔥");
	});

	it("reads a heading underlined with --- or ===", () => {
		const outline = scanOutline("2026-09-28\n---\nTitle\n===");
		assert.deepEqual(outline.headings, [
			{ level: 2, line: 0, end: 1, text: "2026-09-28" },
			{ level: 1, line: 2, end: 3, text: "Title" },
		]);
	});

	it("reads --- under a list or a blank line as a rule, not a heading", () => {
		assert.deepEqual(scanOutline("- item\n---\n\n---").headings, []);
	});

	it("reads boxes of every list kind, in a quote too", () => {
		const outline = scanOutline("- [ ] a\n* [x] b\n1. [x] c\n> - [ ] d\n  - [/] e\n- [ ]f");
		assert.deepEqual(
			outline.tasks.map((task) => [task.line, task.mark]),
			[
				[0, " "],
				[1, "x"],
				[2, "x"],
				[3, " "],
				[4, "/"],
			],
		);
	});

	it("counts the lines of the text", () => {
		assert.equal(scanOutline("a\nb\n").lines, 3);
	});
});

describe("recordLines", () => {
	it("writes the heading, the box, the body without its blank edges, and a rule", () => {
		assert.deepEqual(recordLines("2026-09-28", false, "\n\ntext\n- [ ] step\n\n"), [
			"## 2026-09-28",
			"- [ ] done",
			"text",
			"- [ ] step",
			"",
			"---",
		]);
	});

	it("checks the box when asked to", () => {
		assert.deepEqual(recordLines("2026-09-28", true, ""), [
			"## 2026-09-28",
			"- [x] done",
			"",
			"---",
		]);
	});
});

describe("recordPlace", () => {
	const journal = "# Journal\n## 2026-09-28\n- [x] done\n## 2026-09-20\n- [ ] done";

	it("puts a new record before the nearest older one", () => {
		assert.deepEqual(recordPlace(scanOutline(journal), "2026-09-29", true), {
			line: 1,
			section: false,
		});
		assert.deepEqual(recordPlace(scanOutline(journal), "2026-09-25", true), {
			line: 3,
			section: false,
		});
	});

	it("puts a second record of one date after the first", () => {
		assert.equal(recordPlace(scanOutline(journal), "2026-09-28", true).line, 3);
	});

	it("finds the nearest older one in a journal out of order", () => {
		const text = "## 2026-09-01\n## 2026-09-20\n## 2026-09-10";
		assert.equal(recordPlace(scanOutline(text), "2026-09-15", false).line, 2);
	});

	it("puts a record older than all after the last one", () => {
		assert.equal(recordPlace(scanOutline(`${journal}\n# 2025\ntext`), "2026-01-01", true).line, 5);
	});

	it("puts the first record of a card right under # Journal", () => {
		const text = "---\ntags: x\n---\nsteps\n# Journal\n\n# After";
		assert.deepEqual(recordPlace(scanOutline(text), "2026-09-28", true), {
			line: 5,
			section: false,
		});
	});

	it("opens # Journal at the end of a card without one", () => {
		assert.deepEqual(recordPlace(scanOutline("steps\n"), "2026-09-28", true), {
			line: 2,
			section: true,
		});
	});

	it("puts the first record of a journal of its own at its end", () => {
		assert.deepEqual(recordPlace(scanOutline("# 2026\n"), "2026-09-28", false), {
			line: 2,
			section: false,
		});
	});
});

describe("insertRecord", () => {
	it("writes a record at the top of the journal of a card, set apart by blank lines", () => {
		const written = insertRecord(
			"# Journal\n\n## 2026-09-28\n- [x] done\n\n---\n",
			"2026-09-29",
			false,
			"",
			true,
		);
		assert.equal(
			written.text,
			"# Journal\n\n## 2026-09-29\n- [ ] done\n\n---\n\n## 2026-09-28\n- [x] done\n\n---\n",
		);
		assert.equal(written.line, 2);
		assert.equal(written.nth, 0);
	});

	it("sets apart a record written into a tight journal", () => {
		const written = insertRecord("# Journal\n## 2026-09-28\n", "2026-09-29", false, "", true);
		assert.equal(
			written.text,
			"# Journal\n\n## 2026-09-29\n- [ ] done\n\n---\n\n## 2026-09-28\n",
		);
		assert.equal(written.line, 2);
	});

	it("opens # Journal in a card, set apart from the text above", () => {
		const written = insertRecord("---\ntags: x\n---\nsteps\n", "2026-09-28", true, "body", true);
		assert.equal(
			written.text,
			"---\ntags: x\n---\nsteps\n\n# Journal\n\n## 2026-09-28\n- [x] done\nbody\n\n---\n",
		);
		assert.equal(written.line, 7);
	});

	it("writes the first record of an empty journal", () => {
		const written = insertRecord("", "2026-09-28", false, "", false);
		assert.equal(written.text, "## 2026-09-28\n- [ ] done\n\n---\n");
	});

	it("writes an older record after the rule of the last one", () => {
		const written = insertRecord("## 2026-09-20\n- [x] done\n\n---\n", "2026-09-10", false, "", false);
		assert.equal(
			written.text,
			"## 2026-09-20\n- [x] done\n\n---\n\n## 2026-09-10\n- [ ] done\n\n---\n",
		);
		assert.equal(written.line, 5);
	});

	it("keeps a text that ends without a newline as it is", () => {
		assert.equal(
			insertRecord("## 2026-09-20", "2026-09-10", false, "", false).text,
			"## 2026-09-20\n\n## 2026-09-10\n- [ ] done\n\n---",
		);
	});

	it("counts the new record after the records of its date above it", () => {
		const written = insertRecord("## 2026-09-28\n## 2026-09-20\n", "2026-09-28", false, "", false);
		assert.equal(written.nth, 1);
		assert.equal(written.line, 2);
	});

	it("reads back what it wrote: the rule is no heading and the boxes stay with their records", () => {
		let text = "";
		text = insertRecord(text, "2026-09-20", true, "text", false).text;
		text = insertRecord(text, "2026-09-28", false, "text", false).text;
		assert.deepEqual(
			records(text).map((record) => [record.date, record.box?.done]),
			[
				["2026-09-28", false],
				["2026-09-20", true],
			],
		);
	});
});

describe("setRecordDone", () => {
	const journal = "# Journal\n## 2026-09-28 🔥\ntext\n- [ ] done\n- [ ] step\n## 2026-09-28\n";

	it("checks the first box of the record and nothing else", () => {
		assert.equal(
			setRecordDone(journal, "2026-09-28", 0, true),
			"# Journal\n## 2026-09-28 🔥\ntext\n- [x] done\n- [ ] step\n## 2026-09-28\n",
		);
	});

	it("unchecks a box closed with any sign", () => {
		assert.equal(
			setRecordDone("## 2026-09-28\n> * [-] done", "2026-09-28", 0, false),
			"## 2026-09-28\n> * [ ] done",
		);
	});

	it("keeps a sign of its own when asked to close what is closed", () => {
		const text = "## 2026-09-28\n- [>] done";
		assert.equal(setRecordDone(text, "2026-09-28", 0, true), text);
	});

	it("gives a record without a box one, right under its heading", () => {
		assert.equal(
			setRecordDone(journal, "2026-09-28", 1, true),
			`${journal.slice(0, -1)}\n- [x] done\n`,
		);
	});

	it("puts the box under an underlined heading, not inside it", () => {
		assert.equal(
			setRecordDone("2026-09-28\n---\ntext", "2026-09-28", 0, true),
			"2026-09-28\n---\n- [x] done\ntext",
		);
	});

	it("says so when the record is gone", () => {
		assert.throws(() => setRecordDone(journal, "2026-09-27", 0, true), /no longer in the journal/);
	});
});
