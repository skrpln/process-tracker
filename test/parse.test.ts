// Unit tests for the code block parser.
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import {
	parseCodeBlock,
	parseColor,
	parseSort,
	parseStartDate,
	parseStroke,
} from "../src/codeblock/parse.ts";
import { MAX_DAYS } from "../src/constants.ts";

describe("parseCodeBlock", () => {
	it("returns defaults for an empty block", () => {
		const { options, warnings } = parseCodeBlock("");
		assert.deepEqual(options, {
			track: null,
			start: null,
			days: null,
			dates: "desc",
			sort: { field: "name", direction: "asc" },
			trackColor: null,
			stroke: false,
		});
		assert.deepEqual(warnings, []);
	});

	it("reads every parameter", () => {
		const { options, warnings } = parseCodeBlock(
			'track: FROM "folder"\nstart: 2026-09-01\ndays: 30\ndates: asc\nsort: priority asc',
		);
		assert.equal(options.track, 'FROM "folder"');
		assert.deepEqual(options.start, new Date(2026, 8, 1));
		assert.equal(options.dates, "asc");
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

describe("dates", () => {
	it("defaults to newest first", () => {
		assert.equal(parseCodeBlock("").options.dates, "desc");
	});

	it("reads both directions, whatever the case", () => {
		assert.equal(parseCodeBlock("dates: asc").options.dates, "asc");
		assert.equal(parseCodeBlock("dates: DESC").options.dates, "desc");
	});

	it("warns about an unknown direction and keeps the default", () => {
		const { options, warnings } = parseCodeBlock("dates: forward");
		assert.equal(options.dates, "desc");
		assert.equal(warnings.length, 1);
	});
});

describe("parseStartDate", () => {
	it("reads a calendar date as a local date", () => {
		assert.deepEqual(parseStartDate("2026-09-01"), new Date(2026, 8, 1));
	});

	it("treats \"today\" as the default", () => {
		assert.equal(parseStartDate("today"), null);
		assert.equal(parseStartDate("TODAY"), null);
	});

	it("accepts a leap day that exists", () => {
		assert.deepEqual(parseStartDate("2028-02-29"), new Date(2028, 1, 29));
	});

	it("rejects a date that does not exist", () => {
		const warnings: string[] = [];
		assert.equal(parseStartDate("2027-02-29", warnings), null);
		assert.equal(parseStartDate("2026-13-01", warnings), null);
		assert.equal(parseStartDate("2026-09-31", warnings), null);
		assert.equal(warnings.length, 3);
	});

	it("rejects other formats", () => {
		const warnings: string[] = [];
		for (const value of ["01.09.2026", "2026/09/01", "1 September", "2026-9-1"]) {
			assert.equal(parseStartDate(value, warnings), null, value);
		}
		assert.equal(warnings.length, 4);
	});

	it("is reported through the block warnings", () => {
		const { options, warnings } = parseCodeBlock("start: yesterday");
		assert.equal(options.start, null);
		assert.equal(warnings.length, 1);
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

describe("track_color", () => {
	// The browser answers `CSS.supports`; in Node the test answers for it ([[test/color.test.ts]]).
	const css = {
		supports: (property: string, value: string) =>
			property === "color" && ["#4CAF50", "green"].includes(value),
	};

	before(() => {
		(globalThis as Record<string, unknown>).CSS = css;
	});

	after(() => {
		delete (globalThis as Record<string, unknown>).CSS;
	});

	it("reads a colour, with the quotes the reader is used to writing", () => {
		const { options, warnings } = parseCodeBlock('track_color: "#4CAF50"');
		assert.equal(options.trackColor, "#4CAF50");
		assert.deepEqual(warnings, []);
	});

	it("reads a colour written without them", () => {
		assert.equal(parseCodeBlock("track_color: green").options.trackColor, "green");
	});

	it("warns about a value that is not a colour and leaves the table to the theme", () => {
		const { options, warnings } = parseCodeBlock("track_color: blurple");
		assert.equal(options.trackColor, null);
		assert.equal(warnings.length, 1);
		assert.match(warnings[0], /blurple/);
	});

	it("warns on its own, so the same value can be checked outside a block", () => {
		const warnings: string[] = [];
		assert.equal(parseColor("url(evil.png)", warnings), null);
		assert.equal(warnings.length, 1);
	});
});

describe("stroke", () => {
	it("is off until the block asks for it", () => {
		assert.equal(parseCodeBlock("days: 30").options.stroke, false);
	});

	it("reads both words, in any case", () => {
		assert.equal(parseCodeBlock("stroke: true").options.stroke, true);
		assert.equal(parseCodeBlock("stroke: True").options.stroke, true);
		assert.equal(parseCodeBlock("stroke: false").options.stroke, false);
	});

	it("warns about anything else and stays off", () => {
		const { options, warnings } = parseCodeBlock("stroke: sometimes");
		assert.equal(options.stroke, false);
		assert.equal(warnings.length, 1);
		assert.match(warnings[0], /sometimes/);
	});

	it("warns on its own, so the same value can be checked outside a block", () => {
		const warnings: string[] = [];
		assert.equal(parseStroke("1", warnings), false);
		assert.equal(warnings.length, 1);
	});
});
