// Unit tests for the code block parser.
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import {
	parseAlign,
	parseCodeBlock,
	parseColor,
	parseEntries,
	parseFolder,
	parseShow,
	parseSort,
	parseStartDate,
	parseStroke,
	parseTitle,
	parseView,
	parseWidth,
} from "../src/codeblock/parse.ts";
import { MAX_DAYS, MIN_WIDTH } from "../src/constants.ts";

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
			dailyNoteDir: null,
			entries: null,
			title: null,
			align: null,
			width: null,
			show: "all",
			view: "table",
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

describe("daily_note_dir", () => {
	it("is the folder of the daily notes settings until the block names one", () => {
		assert.equal(parseCodeBlock("days: 30").options.dailyNoteDir, null);
	});

	it("reads a folder as the vault spells it", () => {
		const { options, warnings } = parseCodeBlock("daily_note_dir: Archive/Daily");
		assert.equal(options.dailyNoteDir, "Archive/Daily");
		assert.deepEqual(warnings, []);
	});

	it("drops the quotes around the value and the slashes at its ends", () => {
		assert.equal(parseFolder('"Archive/2025"'), "Archive/2025");
		assert.equal(parseFolder("'Archive'"), "Archive");
		assert.equal(parseFolder("/Archive/Daily/"), "Archive/Daily");
	});

	it("keeps the spaces inside a folder name", () => {
		assert.equal(parseFolder("Old journals/2025"), "Old journals/2025");
	});

	it("reads a lone slash as the vault root", () => {
		assert.equal(parseCodeBlock("daily_note_dir: /").options.dailyNoteDir, "");
	});

	it("leaves an empty value to the settings, with a warning", () => {
		const { options, warnings } = parseCodeBlock("daily_note_dir:");
		assert.equal(options.dailyNoteDir, null);
		assert.equal(warnings.length, 1);
	});
});

describe("entries", () => {
	it("reads the mode of the table", () => {
		const { options, warnings } = parseCodeBlock("entries: journal");
		assert.equal(options.entries, "journal");
		assert.deepEqual(warnings, []);
	});

	it("warns about an unknown mode and leaves it to the settings", () => {
		const { options, warnings } = parseCodeBlock("entries: diary");
		assert.equal(options.entries, null);
		assert.deepEqual(warnings, ['Unknown value "entries: diary", the mode of the settings is used.']);
	});

	it("warns on its own", () => {
		const warnings: string[] = [];
		assert.equal(parseEntries("Notes", warnings), "notes");
		assert.deepEqual(warnings, []);
	});
});

describe("title", () => {
	it("is not set until the block names one", () => {
		assert.equal(parseCodeBlock("").options.title, null);
	});

	it("is taken as written, colons included", () => {
		const { options, warnings } = parseCodeBlock("title: Утро: {{month}} [[Habits|h]]");
		assert.equal(options.title, "Утро: {{month}} [[Habits|h]]");
		assert.deepEqual(warnings, []);
	});

	it("drops the quotes around it", () => {
		assert.equal(parseTitle('"Morning"'), "Morning");
		assert.equal(parseTitle("'Morning'"), "Morning");
		assert.equal(parseTitle('"Morning'), '"Morning');
	});

	it("is empty when the block says so with quotes", () => {
		const { options, warnings } = parseCodeBlock('title: ""');
		assert.equal(options.title, "");
		assert.deepEqual(warnings, []);
	});

	it("stays unset for a line with nothing after the colon", () => {
		const { options, warnings } = parseCodeBlock("title:");
		assert.equal(options.title, null);
		assert.equal(warnings.length, 1);
	});
});

describe("parseAlign", () => {
	it("reads the three alignments, in any case", () => {
		assert.equal(parseAlign("left"), "left");
		assert.equal(parseAlign("Center"), "center");
		assert.equal(parseAlign("RIGHT"), "right");
	});

	it("says nothing by default, so the settings decide", () => {
		assert.equal(parseCodeBlock("").options.align, null);
	});

	it("warns about an unknown value and leaves it to the settings", () => {
		const { options, warnings } = parseCodeBlock("align: middle");
		assert.equal(options.align, null);
		assert.equal(warnings.length, 1);
		assert.match(warnings[0], /settings/);
	});
});

describe("width", () => {
	it("is not set by default", () => {
		assert.equal(parseCodeBlock("days: 30").options.width, null);
	});

	it("reads a whole number of pixels", () => {
		const { options, warnings } = parseCodeBlock("width: 180");
		assert.equal(options.width, 180);
		assert.deepEqual(warnings, []);
		assert.equal(parseWidth(String(MIN_WIDTH)), MIN_WIDTH);
	});

	it("warns about anything else and leaves the column as it was", () => {
		for (const value of ["wide", "180.5", "-20", "180px", "1e3"]) {
			const { options, warnings } = parseCodeBlock(`width: ${value}`);
			assert.equal(options.width, null, `width: ${value}`);
			assert.equal(warnings.length, 1, `width: ${value}`);
		}
	});

	it("raises a width under the limit to the limit", () => {
		for (const value of ["0", "10", String(MIN_WIDTH - 1)]) {
			const { options, warnings } = parseCodeBlock(`width: ${value}`);
			assert.equal(options.width, MIN_WIDTH, `width: ${value}`);
			assert.equal(warnings.length, 1, `width: ${value}`);
		}
	});
});

describe("show", () => {
	it("shows every track until the block asks otherwise", () => {
		assert.equal(parseCodeBlock("days: 3").options.show, "all");
	});

	it("reads both words, in any case", () => {
		assert.equal(parseCodeBlock("show: due").options.show, "due");
		assert.equal(parseCodeBlock("show: DUE").options.show, "due");
		assert.equal(parseCodeBlock("show: all").options.show, "all");
	});

	it("warns about anything else and shows every track", () => {
		const { options, warnings } = parseCodeBlock("show: overdue");
		assert.equal(options.show, "all");
		assert.equal(warnings.length, 1);
		assert.match(warnings[0], /show: overdue/);
	});

	it("warns on its own, so the same value can be checked outside a block", () => {
		const warnings: string[] = [];
		assert.equal(parseShow("today", warnings), "all");
		assert.equal(warnings.length, 1);
	});
});

describe("view", () => {
	it("is a table until the block asks otherwise", () => {
		assert.equal(parseCodeBlock("days: 3").options.view, "table");
	});

	it("reads both words, in any case", () => {
		assert.equal(parseCodeBlock("view: checklist").options.view, "checklist");
		assert.equal(parseCodeBlock("view: Checklist").options.view, "checklist");
		assert.equal(parseCodeBlock("view: table").options.view, "table");
	});

	it("warns about anything else and draws a table", () => {
		const { options, warnings } = parseCodeBlock("view: list");
		assert.equal(options.view, "table");
		assert.equal(warnings.length, 1);
		assert.match(warnings[0], /view: list/);
	});

	it("warns on its own, so the same value can be checked outside a block", () => {
		const warnings: string[] = [];
		assert.equal(parseView("line", warnings), "table");
		assert.equal(warnings.length, 1);
	});
});

describe("a checklist", () => {
	it("reads the parameters a list has a use for", () => {
		const { options, warnings } = parseCodeBlock(
			'view: checklist\ntrack: FROM "Home"\nstart: 2026-11-05\nsort: priority desc\n' +
				"show: due\nentries: journal\ntitle: Morning",
		);
		assert.equal(options.view, "checklist");
		assert.equal(options.track, 'FROM "Home"');
		assert.deepEqual(options.start, new Date(2026, 10, 5));
		assert.deepEqual(options.sort, { field: "priority", direction: "desc" });
		assert.equal(options.show, "due");
		assert.equal(options.entries, "journal");
		assert.equal(options.title, "Morning");
		assert.deepEqual(warnings, []);
	});

	it("says nothing about the parameters of a table, whatever they hold", () => {
		const { warnings } = parseCodeBlock(
			"view: checklist\ndays: many\ndates: sideways\nstroke: maybe\nalign: middle\n" +
				"width: wide\ndaily_note_dir:\ndays: 3",
		);
		assert.deepEqual(warnings, []);
	});

	it("is silent about them wherever in the block the view is named", () => {
		assert.deepEqual(parseCodeBlock("days: many\nview: checklist").warnings, []);
		assert.deepEqual(parseCodeBlock("width: 5\nview: checklist\nalign: up").warnings, []);
	});

	it("still warns about its own parameters, in the order they stand", () => {
		const { warnings } = parseCodeBlock(
			"show: sometimes\ndays: many\nview: checklist\nstart: tomorrow\ncolour: red",
		);
		assert.equal(warnings.length, 3);
		assert.match(warnings[0], /show: sometimes/);
		assert.match(warnings[1], /start: tomorrow/);
		assert.match(warnings[2], /colour/);
	});

	it("leaves a table its warnings", () => {
		assert.equal(parseCodeBlock("days: many\nview: table").warnings.length, 1);
		assert.equal(parseCodeBlock("days: many\nview: list").warnings.length, 2);
	});
});
