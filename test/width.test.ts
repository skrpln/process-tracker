// Unit tests for the `width` line the plugin writes into a code block.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { rewriteWidth } from "../src/codeblock/width.ts";

/** A note: a line of text, the block, a line of text. The block stands on lines 2..N. */
function note(...block: string[]): string {
	return ["# Habits", "", ...block, "", "after"].join("\n");
}

/** Where `note` puts a block of this many lines. */
function place(lines: number): { lineStart: number; lineEnd: number } {
	return { lineStart: 2, lineEnd: 2 + lines - 1 };
}

describe("rewriteWidth", () => {
	it("adds the line to a block that has none", () => {
		const text = note("```process-tracker", "days: 30", "align: left", "```");
		assert.equal(
			rewriteWidth(text, place(4), "days: 30\nalign: left", 180),
			note("```process-tracker", "days: 30", "align: left", "width: 180", "```"),
		);
	});

	it("rewrites the line a block already has, and nothing else", () => {
		const text = note("```process-tracker", "# my table", "width: 120", "", "days:  30", "```");
		assert.equal(
			rewriteWidth(text, place(6), "# my table\nwidth: 120\n\ndays:  30", 200),
			note("```process-tracker", "# my table", "width: 200", "", "days:  30", "```"),
		);
	});

	it("removes the line", () => {
		const text = note("```process-tracker", "width: 120", "days: 30", "```");
		assert.equal(
			rewriteWidth(text, place(4), "width: 120\ndays: 30", null),
			note("```process-tracker", "days: 30", "```"),
		);
	});

	it("reads the key as the parser does: any case, spaces around it", () => {
		const text = note("```process-tracker", "  Width :  120", "```");
		assert.equal(
			rewriteWidth(text, place(3), "  Width :  120", 90),
			note("```process-tracker", "  width: 90", "```"),
		);
	});

	it("leaves a commented line alone", () => {
		const text = note("```process-tracker", "# width: 120", "// width: 130", "```");
		assert.equal(
			rewriteWidth(text, place(4), "# width: 120\n// width: 130", 90),
			note("```process-tracker", "# width: 120", "// width: 130", "width: 90", "```"),
		);
	});

	it("writes into the last of several lines, the one the parser obeys", () => {
		const text = note("```process-tracker", "width: 100", "days: 30", "width: 120", "```");
		const source = "width: 100\ndays: 30\nwidth: 120";
		assert.equal(
			rewriteWidth(text, place(5), source, 90),
			note("```process-tracker", "width: 100", "days: 30", "width: 90", "```"),
		);
	});

	it("removes every one of several lines", () => {
		const text = note("```process-tracker", "width: 100", "days: 30", "width: 120", "```");
		const source = "width: 100\ndays: 30\nwidth: 120";
		assert.equal(
			rewriteWidth(text, place(5), source, null),
			note("```process-tracker", "days: 30", "```"),
		);
	});

	it("adds the line into an empty block", () => {
		const text = note("```process-tracker", "```");
		assert.equal(
			rewriteWidth(text, place(2), "", 180),
			note("```process-tracker", "width: 180", "```"),
		);
	});

	it("adds the line above the blank lines a block ends with", () => {
		const text = note("```process-tracker", "days: 30", "", "```");
		assert.equal(
			rewriteWidth(text, place(4), "days: 30\n", 180),
			note("```process-tracker", "days: 30", "width: 180", "", "```"),
		);
	});

	it("answers the same text when there is nothing to change", () => {
		const text = note("```process-tracker", "days: 30", "```");
		assert.equal(rewriteWidth(text, place(3), "days: 30", null), text);

		const sized = note("```process-tracker", "width: 180", "```");
		assert.equal(rewriteWidth(sized, place(3), "width: 180", 180), sized);
	});

	it("does not mind a newline at the end of the source", () => {
		const text = note("```process-tracker", "days: 30", "```");
		assert.equal(
			rewriteWidth(text, place(3), "days: 30\n", 180),
			note("```process-tracker", "days: 30", "width: 180", "```"),
		);
	});

	it("reads a fence of tildes and a fence longer than three", () => {
		const tildes = note("~~~process-tracker", "days: 30", "~~~");
		assert.equal(
			rewriteWidth(tildes, place(3), "days: 30", 180),
			note("~~~process-tracker", "days: 30", "width: 180", "~~~"),
		);

		const long = note("````process-tracker", "days: 30", "````");
		assert.equal(
			rewriteWidth(long, place(3), "days: 30", 180),
			note("````process-tracker", "days: 30", "width: 180", "````"),
		);
	});

	it("reads a block the note ends in, left unclosed", () => {
		const text = "```process-tracker\ndays: 30";
		assert.equal(
			rewriteWidth(text, { lineStart: 0, lineEnd: 1 }, "days: 30", 180),
			"```process-tracker\ndays: 30\nwidth: 180",
		);
	});

	it("keeps the line ends of a file written with CRLF", () => {
		const text = "```process-tracker\r\ndays: 30\r\n```\r\n";
		assert.equal(
			rewriteWidth(text, { lineStart: 0, lineEnd: 2 }, "days: 30", 180),
			"```process-tracker\r\ndays: 30\r\nwidth: 180\r\n```\r\n",
		);
	});
});

describe("rewriteWidth inside a larger section", () => {
	it("finds the block in a callout and quotes the line it adds", () => {
		const text = note("> [!note] Morning", "> ```process-tracker", "> days: 30", "> ```");
		assert.equal(
			rewriteWidth(text, place(4), "days: 30", 180),
			note("> [!note] Morning", "> ```process-tracker", "> days: 30", "> width: 180", "> ```"),
		);
	});

	it("finds the block in a list and indents the line it adds", () => {
		const text = note("- trackers", "\t```process-tracker", "\tdays: 30", "\t```");
		assert.equal(
			rewriteWidth(text, place(4), "days: 30", 180),
			note("- trackers", "\t```process-tracker", "\tdays: 30", "\twidth: 180", "\t```"),
		);
	});

	it("rewrites a quoted line and keeps its quote", () => {
		const text = note("> ```process-tracker", "> width: 120", "> ```");
		assert.equal(
			rewriteWidth(text, place(3), "width: 120", 90),
			note("> ```process-tracker", "> width: 90", "> ```"),
		);
	});

	it("tells two blocks of one section apart by their source", () => {
		const text = note(
			"> ```process-tracker",
			"> days: 7",
			"> ```",
			"> ```process-tracker",
			"> days: 30",
			"> ```",
		);
		assert.equal(
			rewriteWidth(text, place(6), "days: 30", 180),
			note(
				"> ```process-tracker",
				"> days: 7",
				"> ```",
				"> ```process-tracker",
				"> days: 30",
				"> width: 180",
				"> ```",
			),
		);
	});
});

describe("rewriteWidth refuses", () => {
	it("lines that hold no tracker block", () => {
		const text = note("```dataview", "days: 30", "```");
		assert.equal(rewriteWidth(text, place(3), "days: 30", 180), null);
		assert.equal(rewriteWidth("just a paragraph", { lineStart: 0, lineEnd: 0 }, "", 180), null);
	});

	it("a block with another source: the place is not the place of this block", () => {
		const text = note("```process-tracker", "days: 7", "```");
		assert.equal(rewriteWidth(text, place(3), "days: 30", 180), null);
	});

	it("a place counted from the start of a fragment, not of the file", () => {
		const text = ["# One", "text", "# Two", "```process-tracker", "days: 30", "```"].join("\n");
		// The lines of the block inside the section `# Two`, as an embed of it reports them.
		assert.equal(rewriteWidth(text, { lineStart: 0, lineEnd: 2 }, "days: 30", 180), null);
	});

	it("a place that cuts a block short", () => {
		const text = note("```process-tracker", "days: 30", "```");
		assert.equal(rewriteWidth(text, { lineStart: 2, lineEnd: 2 }, "", 180), null);
	});

	it("a place past the end of the file", () => {
		const text = note("```process-tracker", "days: 30", "```");
		assert.equal(rewriteWidth(text, { lineStart: 40, lineEnd: 43 }, "days: 30", 180), null);
	});

	it("a tracker block shown as an example inside another code block", () => {
		const text = note("````markdown", "```process-tracker", "days: 30", "```", "````");
		assert.equal(rewriteWidth(text, place(5), "days: 30", 180), null);
	});

	it("two blocks of one section with the same source", () => {
		const text = note(
			"> ```process-tracker",
			"> days: 30",
			"> ```",
			"> ```process-tracker",
			"> days: 30",
			"> ```",
		);
		assert.equal(rewriteWidth(text, place(6), "days: 30", 180), null);
	});
});
