// Unit tests for the code block parser.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseCodeBlock, parseSort } from "../src/codeblock/parse.ts";
import { MAX_DAYS } from "../src/constants.ts";

describe("parseCodeBlock", () => {
	it("returns defaults for an empty block", () => {
		const { options, warnings } = parseCodeBlock("");
		assert.deepEqual(options, { track: null, days: null, sort: { field: "name", direction: "asc" } });
		assert.deepEqual(warnings, []);
	});

	it("reads all three parameters", () => {
		const { options, warnings } = parseCodeBlock(
			'track: FROM "folder"\ndays: 30\nsort: priority asc',
		);
		assert.equal(options.track, 'FROM "folder"');
		assert.equal(options.days, 30);
		assert.deepEqual(options.sort, { field: "priority", direction: "asc" });
		assert.deepEqual(warnings, []);
	});

	it("keeps colons inside a value", () => {
		const { options } = parseCodeBlock('track: FROM #tag AND priority: 1');
		assert.equal(options.track, "FROM #tag AND priority: 1");
	});

	it("ignores blank lines and comments", () => {
		const { options, warnings } = parseCodeBlock("\n# comment\n// comment\ndays: 3\n");
		assert.equal(options.days, 3);
		assert.deepEqual(warnings, []);
	});

	it("is case insensitive for keys and trims spaces", () => {
		const { options } = parseCodeBlock("  DAYS :  5  ");
		assert.equal(options.days, 5);
	});

	it("warns about an unknown parameter", () => {
		const { warnings } = parseCodeBlock("color: red");
		assert.equal(warnings.length, 1);
		assert.match(warnings[0], /color/);
	});

	it("warns about a line without a colon", () => {
		const { warnings } = parseCodeBlock("days 7");
		assert.equal(warnings.length, 1);
	});

	it("rejects non-positive and fractional days", () => {
		for (const value of ["0", "-5", "2.5", "week"]) {
			const { options, warnings } = parseCodeBlock(`days: ${value}`);
			assert.equal(options.days, null, `days: ${value}`);
			assert.equal(warnings.length, 1, `days: ${value}`);
		}
	});

	it("trims days to the limit", () => {
		const { options, warnings } = parseCodeBlock(`days: ${MAX_DAYS + 1}`);
		assert.equal(options.days, MAX_DAYS);
		assert.equal(warnings.length, 1);
	});

	it("warns when a parameter repeats and keeps the last value", () => {
		const { options, warnings } = parseCodeBlock("days: 3\ndays: 9");
		assert.equal(options.days, 9);
		assert.equal(warnings.length, 1);
	});

	it("falls back to the default when a value is empty", () => {
		const { options, warnings } = parseCodeBlock("track:\ndays:");
		assert.equal(options.track, null);
		assert.equal(options.days, null);
		assert.equal(warnings.length, 2);
	});
});

describe("parseSort", () => {
	it("defaults the direction to asc", () => {
		assert.deepEqual(parseSort("mtime"), { field: "mtime", direction: "asc" });
	});

	it("reads desc", () => {
		assert.deepEqual(parseSort("ctime desc"), { field: "ctime", direction: "desc" });
	});

	it("normalizes the direction case", () => {
		assert.deepEqual(parseSort("name DESC"), { field: "name", direction: "desc" });
	});

	it("warns about an unknown direction", () => {
		const warnings: string[] = [];
		assert.deepEqual(parseSort("name sideways", warnings), { field: "name", direction: "asc" });
		assert.equal(warnings.length, 1);
	});

	it("warns about extra words", () => {
		const warnings: string[] = [];
		parseSort("name asc please", warnings);
		assert.equal(warnings.length, 1);
	});
});
