// Unit tests for the name, the path and the template of a journal.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
// The plugin gets moment from Obsidian; outside Obsidian the same library is asked directly.
import moment from "moment";
import {
	fillJournalTemplate,
	journalBasename,
	journalName,
	journalPath,
	nameTellsTheDay,
} from "../src/daily/journal.ts";

const day = (iso: string) => moment(iso, "YYYY-MM-DD", true);

describe("journalName", () => {
	it("formats the day", () => {
		assert.equal(journalName(day("2026-09-21"), "YYYY-MM-DD"), "2026-09-21");
	});

	it("keeps the folders of a nested format", () => {
		assert.equal(journalName(day("2026-09-05"), "YYYY/MM/YYYY-MM-DD"), "2026/09/2026-09-05");
	});

	it("trims what the format leaves around the name", () => {
		assert.equal(journalName(day("2026-09-21"), " YYYY-MM-DD "), "2026-09-21");
	});
});

describe("journalPath", () => {
	it("puts the name into the folder", () => {
		assert.equal(journalPath("Daily", "2026-09-21"), "Daily/2026-09-21.md");
	});

	it("reads an empty folder and a slash as the vault root", () => {
		assert.equal(journalPath("", "2026-09-21"), "2026-09-21.md");
		assert.equal(journalPath("/", "2026-09-21"), "2026-09-21.md");
	});

	it("drops the slashes at the ends of the folder", () => {
		assert.equal(journalPath("/Archive/Daily/", "2026/09/21"), "Archive/Daily/2026/09/21.md");
	});
});

describe("journalBasename", () => {
	it("is the name without its folders", () => {
		assert.equal(journalBasename("2026/09/2026-09-21"), "2026-09-21");
		assert.equal(journalBasename("2026-09-21"), "2026-09-21");
	});
});

describe("nameTellsTheDay", () => {
	it("holds for a name with the year, the month and the day", () => {
		assert.equal(nameTellsTheDay(day("2026-09-21"), "YYYY-MM-DD"), true);
		assert.equal(nameTellsTheDay(day("2026-09-21"), "YYYY/MM/YYYY-MM-DD"), true);
		assert.equal(nameTellsTheDay(day("2026-09-21"), "DD.MM.YYYY"), true);
	});

	it("fails when the file name is the day of the month alone", () => {
		assert.equal(nameTellsTheDay(day("2026-09-21"), "YYYY/MM/DD"), false);
	});

	it("fails when the year is left out", () => {
		assert.equal(nameTellsTheDay(day("2026-09-21"), "MM-DD"), false);
	});

	it("fails for a name that names the week", () => {
		assert.equal(nameTellsTheDay(day("2026-09-21"), "gggg-[W]ww"), false);
	});

	it("leaves the day it is asked about as it was", () => {
		const asked = day("2026-09-21");
		nameTellsTheDay(asked, "YYYY-MM-DD");
		assert.equal(asked.format("YYYY-MM-DD"), "2026-09-21");
	});
});

describe("fillJournalTemplate", () => {
	const now = moment("2026-09-21 14:05:09", "YYYY-MM-DD HH:mm:ss", true);
	const fill = (template: string, iso = "2026-09-18", format = "YYYY-MM-DD") =>
		fillJournalTemplate(template, day(iso), format, now);

	it("gives the name of the journal for date and title, the time now for time", () => {
		assert.equal(fill("# {{title}}\n{{date}} {{time}}"), "# 2026-09-18\n2026-09-18 14:05");
	});

	it("reads the placeholders in any case and with spaces inside", () => {
		assert.equal(fill("{{ Date }} {{TITLE}}"), "2026-09-18 2026-09-18");
	});

	it("formats the day of the journal, not today, in a format of its own", () => {
		assert.equal(fill("{{date:dddd, D MMMM}}"), "Friday, 18 September");
	});

	it("gives that day the time now", () => {
		assert.equal(fill("{{time:YYYY-MM-DD HH:mm}}"), "2026-09-18 14:05");
	});

	it("shifts the day when asked", () => {
		assert.equal(fill("{{date+1d:YYYY-MM-DD}} {{date-1w:YYYY-MM-DD}}"), "2026-09-19 2026-09-11");
	});

	it("gives yesterday and tomorrow in the format of the journal", () => {
		assert.equal(
			fill("{{yesterday}} {{tomorrow}}", "2026-09-18", "DD.MM.YYYY"),
			"17.09.2026 19.09.2026",
		);
	});

	it("uses the full name, folders included, where the format has them", () => {
		assert.equal(fill("{{title}}", "2026-09-18", "YYYY/MM/DD"), "2026/09/18");
	});

	it("leaves a template without placeholders as it is", () => {
		assert.equal(fill("Nothing to fill."), "Nothing to fill.");
	});
});
