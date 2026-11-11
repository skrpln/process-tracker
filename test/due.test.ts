// Unit tests for regular tracks: the period of a track, the days it was closed in, and whether
// its day has come.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildEntryIndex } from "../src/entry/state.ts";
import type { Entry } from "../src/model/types.ts";
import { addPeriod, closedDays, isDue, toPeriod } from "../src/tracks/due.ts";
import type { ClosedDays } from "../src/tracks/due.ts";

/** The day the tests are rendered on: a Thursday. */
const TODAY = "2026-11-12";

/** A done entry of `bedding`, made and closed on the day it names. */
function entry(day: string, overrides: Partial<Entry> = {}): Entry {
	return {
		path: `bedding ${day}.md`,
		trackPath: "bedding.md",
		created: day,
		closed: day,
		mark: null,
		record: null,
		...overrides,
	};
}

/** The closed days of the tracks these entries belong to, with nothing below any of them. */
function daysOf(entries: Entry[], descendants: Record<string, string[]> = {}): ClosedDays {
	return closedDays(buildEntryIndex(entries), new Map(Object.entries(descendants)));
}

describe("toPeriod", () => {
	it("reads days and weeks as days", () => {
		assert.deepEqual(toPeriod({ days: 3 }), { months: 0, days: 3 });
		assert.deepEqual(toPeriod({ weeks: 2 }), { months: 0, days: 14 });
		assert.deepEqual(toPeriod({ weeks: 1, days: 2 }), { months: 0, days: 9 });
	});

	it("reads months and years as months", () => {
		assert.deepEqual(toPeriod({ months: 6 }), { months: 6, days: 0 });
		assert.deepEqual(toPeriod({ years: 1 }), { months: 12, days: 0 });
		assert.deepEqual(toPeriod({ years: 2, months: 3 }), { months: 27, days: 0 });
	});

	it("keeps the months and the days of one period apart", () => {
		assert.deepEqual(toPeriod({ months: 1, weeks: 2 }), { months: 1, days: 14 });
	});

	it("takes the units a duration leaves at zero for none", () => {
		const units = { years: 0, months: 0, weeks: 0, days: 6, hours: 0, minutes: 0, seconds: 0 };
		assert.deepEqual(toPeriod({ ...units, milliseconds: 0 }), { months: 0, days: 6 });
	});

	it("takes a fraction that comes to whole months or whole days", () => {
		assert.deepEqual(toPeriod({ years: 1.5 }), { months: 18, days: 0 });
		assert.deepEqual(toPeriod({ weeks: 1, days: 0 }), { months: 0, days: 7 });
	});

	it("turns down hours, minutes and seconds: a table of days cannot count them", () => {
		assert.equal(toPeriod({ hours: 3 }), null);
		assert.equal(toPeriod({ minutes: 1 }), null);
		assert.equal(toPeriod({ seconds: 30 }), null);
		assert.equal(toPeriod({ milliseconds: 5 }), null);
		assert.equal(toPeriod({ days: 1, hours: 12 }), null);
	});

	it("turns down a part of a day and a part of a month", () => {
		assert.equal(toPeriod({ days: 1.5 }), null);
		assert.equal(toPeriod({ weeks: 0.5 }), null);
		assert.equal(toPeriod({ months: 0.5 }), null);
	});

	it("turns down a period that does not run forward", () => {
		assert.equal(toPeriod({}), null);
		assert.equal(toPeriod({ days: 0 }), null);
		assert.equal(toPeriod({ days: -3 }), null);
		assert.equal(toPeriod({ months: 1, days: -1 }), null);
	});

	it("turns down a duration that is not valid", () => {
		assert.equal(toPeriod({ days: Number.NaN }), null);
	});
});

describe("addPeriod", () => {
	it("adds days", () => {
		assert.equal(addPeriod("2026-11-05", { months: 0, days: 7 }), "2026-11-12");
	});

	it("runs over the end of a month and of a year", () => {
		assert.equal(addPeriod("2026-11-28", { months: 0, days: 6 }), "2026-12-04");
		assert.equal(addPeriod("2026-12-30", { months: 0, days: 3 }), "2027-01-02");
	});

	it("adds months by the calendar", () => {
		assert.equal(addPeriod("2026-05-12", { months: 6, days: 0 }), "2026-11-12");
		assert.equal(addPeriod("2026-12-15", { months: 1, days: 0 }), "2027-01-15");
		assert.equal(addPeriod("2025-11-12", { months: 12, days: 0 }), "2026-11-12");
	});

	it("stops at the last day of a month that is too short", () => {
		assert.equal(addPeriod("2026-01-31", { months: 1, days: 0 }), "2026-02-28");
		assert.equal(addPeriod("2026-08-31", { months: 1, days: 0 }), "2026-09-30");
		assert.equal(addPeriod("2026-11-30", { months: 3, days: 0 }), "2027-02-28");
	});

	it("knows a leap year", () => {
		assert.equal(addPeriod("2028-01-31", { months: 1, days: 0 }), "2028-02-29");
		assert.equal(addPeriod("2028-02-29", { months: 12, days: 0 }), "2029-02-28");
	});

	it("adds the months first and the days after", () => {
		assert.equal(addPeriod("2026-01-31", { months: 1, days: 14 }), "2026-03-14");
	});

	it("counts days, not hours: the night the clocks change is a day like any other", () => {
		assert.equal(addPeriod("2026-03-28", { months: 0, days: 2 }), "2026-03-30");
		assert.equal(addPeriod("2026-10-24", { months: 0, days: 2 }), "2026-10-26");
	});
});

describe("closedDays", () => {
	it("finds the last day a track was closed in", () => {
		const days = daysOf([entry("2026-11-01"), entry("2026-11-07"), entry("2026-10-20")]);
		assert.equal(days.last("bedding.md"), "2026-11-07");
	});

	it("answers null for a track that was never closed", () => {
		assert.equal(daysOf([]).last("bedding.md"), null);
		assert.equal(daysOf([entry("2026-11-07", { closed: null })]).last("bedding.md"), null);
	});

	it("looks no further than the track asked about", () => {
		const days = daysOf([entry("2026-11-07", { trackPath: "dusting.md" })]);
		assert.equal(days.last("bedding.md"), null);
	});

	it("counts an entry in the day it was closed, not in the day it was made", () => {
		const days = daysOf([entry("2026-11-01", { closed: "2026-11-09" })]);
		assert.equal(days.last("bedding.md"), "2026-11-09");
		assert.equal(days.closed("bedding.md", "2026-11-01"), false);
		assert.equal(days.closed("bedding.md", "2026-11-09"), true);
	});

	it("passes over a day an open entry keeps a draft", () => {
		const days = daysOf([
			entry("2026-11-03"),
			entry("2026-11-07"),
			entry("2026-11-07", { path: "second.md", closed: null }),
		]);
		assert.equal(days.closed("bedding.md", "2026-11-07"), false);
		assert.equal(days.last("bedding.md"), "2026-11-03");
	});

	it("counts the records of a journal as it counts notes", () => {
		const record = { nth: 0, heading: "2026-11-08", line: 4 };
		const days = daysOf([entry("2026-11-08", { path: "bedding.md", record })]);
		assert.equal(days.last("bedding.md"), "2026-11-08");
	});

	it("counts the days closed by the tracks below", () => {
		const days = daysOf(
			[entry("2026-11-02", { trackPath: "harmony.md" }), entry("2026-11-09")],
			{ "harmony.md": ["bedding.md"] },
		);
		assert.equal(days.last("harmony.md"), "2026-11-09");
		assert.equal(days.closed("harmony.md", "2026-11-09"), true);
		// The track below knows nothing of the one above it.
		assert.equal(days.last("bedding.md"), "2026-11-09");
		assert.equal(days.closed("bedding.md", "2026-11-02"), false);
	});

	it("takes a day closed below for closed, whatever the track's own draft says", () => {
		const days = daysOf(
			[entry("2026-11-09", { trackPath: "harmony.md", closed: null }), entry("2026-11-09")],
			{ "harmony.md": ["bedding.md"] },
		);
		assert.equal(days.last("harmony.md"), "2026-11-09");
	});

	it("knows the days that are yet to come", () => {
		const days = daysOf([entry("2026-11-07"), entry("2026-11-20")]);
		assert.equal(days.last("bedding.md"), "2026-11-20");
	});
});

describe("isDue", () => {
	const week = { months: 0, days: 7 };

	it("shows a track that was never closed", () => {
		assert.equal(isDue("bedding.md", week, daysOf([]), TODAY), true);
		const draft = daysOf([entry("2026-11-11", { closed: null })]);
		assert.equal(isDue("bedding.md", week, draft, TODAY), true);
	});

	it("shows a track on the very day its period runs out", () => {
		// Closed on a Thursday with a week to go: back on the next Thursday.
		assert.equal(isDue("bedding.md", week, daysOf([entry("2026-11-05")]), TODAY), true);
	});

	it("hides a track the day before", () => {
		assert.equal(isDue("bedding.md", week, daysOf([entry("2026-11-06")]), TODAY), false);
	});

	it("shows a track whose period ran out long ago", () => {
		assert.equal(isDue("bedding.md", week, daysOf([entry("2026-09-01")]), TODAY), true);
	});

	it("counts the period from the last closed day, not from the first", () => {
		const days = daysOf([entry("2026-10-01"), entry("2026-11-10")]);
		assert.equal(isDue("bedding.md", week, days, TODAY), false);
	});

	it("keeps a track closed today till the day is over", () => {
		assert.equal(isDue("bedding.md", week, daysOf([entry(TODAY)]), TODAY), true);
		assert.equal(isDue("bedding.md", week, daysOf([entry(TODAY)]), "2026-11-13"), false);
	});

	it("hides a track closed ahead of time", () => {
		assert.equal(isDue("bedding.md", week, daysOf([entry("2026-11-13")]), TODAY), false);
	});

	it("keeps a track closed today even when a later day is closed too", () => {
		const days = daysOf([entry(TODAY), entry("2026-11-13")]);
		assert.equal(isDue("bedding.md", week, days, TODAY), true);
	});

	it("counts months by the calendar", () => {
		const halfYear = { months: 6, days: 0 };
		assert.equal(isDue("fridge.md", halfYear, daysOf([entry("2026-05-12", { trackPath: "fridge.md" })]), TODAY), true);
		assert.equal(isDue("fridge.md", halfYear, daysOf([entry("2026-05-13", { trackPath: "fridge.md" })]), TODAY), false);
	});

	it("counts from a day closed by a track below", () => {
		const below = { "harmony.md": ["bedding.md"] };
		assert.equal(isDue("harmony.md", week, daysOf([entry("2026-11-10")], below), TODAY), false);
		assert.equal(isDue("harmony.md", week, daysOf([entry("2026-11-05")], below), TODAY), true);
	});
});
