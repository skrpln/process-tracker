// Unit tests for the date grid.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	buildDateColumns,
	formatDayMonth,
	spansMultipleYears,
	toIsoDate,
} from "../src/dates/grid.ts";
import type { SortDirection } from "../src/model/types.ts";

/** Shorthand: a grid that ends today, newest column first. */
function back(today: Date, days: number, order: SortDirection = "desc") {
	return buildDateColumns({ start: null, today, days, order });
}

/** Shorthand: a grid that starts on an explicit day. */
function from(start: Date, days: number, today = start, order: SortDirection = "desc") {
	return buildDateColumns({ start, today, days, order });
}

const iso = (columns: { iso: string }[]) => columns.map((column) => column.iso);

describe("toIsoDate", () => {
	it("formats a local date with padding", () => {
		assert.equal(toIsoDate(new Date(2026, 8, 5)), "2026-09-05");
	});

	it("uses local components, not UTC", () => {
		// 23:30 local time still belongs to the same local day.
		assert.equal(toIsoDate(new Date(2026, 0, 1, 23, 30)), "2026-01-01");
	});
});

describe("buildDateColumns — interval ending today", () => {
	it("puts today first and walks back", () => {
		assert.deepEqual(iso(back(new Date(2026, 8, 11), 3)), [
			"2026-09-11",
			"2026-09-10",
			"2026-09-09",
		]);
	});

	it("marks today and nothing else", () => {
		assert.deepEqual(
			back(new Date(2026, 8, 11), 3).map((column) => column.isToday),
			[true, false, false],
		);
	});

	it("fills day, month and year", () => {
		const [first] = back(new Date(2026, 8, 11), 1);
		assert.deepEqual(first, { iso: "2026-09-11", day: 11, month: 9, year: 2026, isToday: true });
	});

	it("crosses month, year and a leap day", () => {
		assert.deepEqual(iso(back(new Date(2026, 8, 2), 3)), [
			"2026-09-02",
			"2026-09-01",
			"2026-08-31",
		]);
		assert.deepEqual(iso(back(new Date(2026, 0, 1), 2)), ["2026-01-01", "2025-12-31"]);
		assert.deepEqual(iso(back(new Date(2028, 2, 1), 2)), ["2028-03-01", "2028-02-29"]);
	});

	it("returns an empty grid for zero or negative days", () => {
		assert.deepEqual(back(new Date(2026, 8, 11), 0), []);
		assert.deepEqual(back(new Date(2026, 8, 11), -3), []);
	});

	it("returns exactly the requested number of columns", () => {
		assert.equal(back(new Date(2026, 8, 11), 365).length, 365);
	});
});

describe("buildDateColumns — explicit start", () => {
	it("runs forward from the start day", () => {
		const columns = from(new Date(2026, 8, 1), 30);
		assert.equal(columns[columns.length - 1].iso, "2026-09-01");
		assert.equal(columns[0].iso, "2026-09-30");
	});

	it("keeps the window fixed whatever day it is now", () => {
		const september = from(new Date(2026, 8, 1), 30, new Date(2026, 10, 20));
		assert.deepEqual(
			[september[0].iso, september[29].iso],
			["2026-09-30", "2026-09-01"],
		);
		assert.ok(september.every((column) => !column.isToday));
	});

	it("marks today when the interval contains it", () => {
		const columns = from(new Date(2026, 8, 1), 30, new Date(2026, 8, 13));
		const today = columns.filter((column) => column.isToday);
		assert.deepEqual(iso(today), ["2026-09-13"]);
	});
});

describe("buildDateColumns — direction", () => {
	it("asc puts the oldest column first", () => {
		assert.deepEqual(iso(from(new Date(2026, 8, 1), 3, new Date(2026, 8, 1), "asc")), [
			"2026-09-01",
			"2026-09-02",
			"2026-09-03",
		]);
	});

	it("asc and desc are mirror images of the same interval", () => {
		const today = new Date(2026, 8, 11);
		const ascending = iso(back(today, 10, "asc"));
		const descending = iso(back(today, 10, "desc"));
		assert.deepEqual(ascending, [...descending].reverse());
	});
});

describe("formatDayMonth", () => {
	it("pads both parts to two digits", () => {
		const [column] = back(new Date(2026, 8, 5), 1);
		assert.equal(formatDayMonth(column), "05/09");
	});

	it("keeps two digits as they are", () => {
		const [column] = back(new Date(2026, 11, 25), 1);
		assert.equal(formatDayMonth(column), "25/12");
	});
});

describe("spansMultipleYears", () => {
	it("is false inside one year", () => {
		assert.equal(spansMultipleYears(back(new Date(2026, 8, 11), 30)), false);
	});

	it("is true for a table that crosses a year, even a short one", () => {
		assert.equal(spansMultipleYears(back(new Date(2026, 0, 1), 2)), true);
	});

	it("is false for an empty grid", () => {
		assert.equal(spansMultipleYears([]), false);
	});
});
