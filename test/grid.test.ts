// Unit tests for the date grid.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildDateColumns, toIsoDate } from "../src/dates/grid.ts";

describe("toIsoDate", () => {
	it("formats a local date with padding", () => {
		assert.equal(toIsoDate(new Date(2026, 8, 5)), "2026-09-05");
	});

	it("uses local components, not UTC", () => {
		// 23:30 local time still belongs to the same local day.
		assert.equal(toIsoDate(new Date(2026, 0, 1, 23, 30)), "2026-01-01");
	});
});

describe("buildDateColumns", () => {
	it("starts at today and walks back", () => {
		const columns = buildDateColumns(new Date(2026, 8, 11), 3);
		assert.deepEqual(columns.map((it) => it.iso), ["2026-09-11", "2026-09-10", "2026-09-09"]);
		assert.deepEqual(columns.map((it) => it.isToday), [true, false, false]);
	});

	it("fills day, month and year", () => {
		const [first] = buildDateColumns(new Date(2026, 8, 11), 1);
		assert.deepEqual(first, { iso: "2026-09-11", day: 11, month: 9, year: 2026, isToday: true });
	});

	it("crosses a month boundary", () => {
		const columns = buildDateColumns(new Date(2026, 8, 2), 3);
		assert.deepEqual(columns.map((it) => it.iso), ["2026-09-02", "2026-09-01", "2026-08-31"]);
	});

	it("crosses a year boundary", () => {
		const columns = buildDateColumns(new Date(2026, 0, 1), 2);
		assert.deepEqual(columns.map((it) => it.iso), ["2026-01-01", "2025-12-31"]);
	});

	it("handles a leap day", () => {
		const columns = buildDateColumns(new Date(2028, 2, 1), 2);
		assert.deepEqual(columns.map((it) => it.iso), ["2028-03-01", "2028-02-29"]);
	});

	it("stays on calendar days across a DST change", () => {
		// Europe/Moscow has no DST, so the test pins the arithmetic itself:
		// every column must differ from the previous one by exactly one calendar day.
		const columns = buildDateColumns(new Date(2026, 2, 30), 5);
		assert.deepEqual(columns.map((it) => it.day), [30, 29, 28, 27, 26]);
	});

	it("returns an empty grid for zero or negative days", () => {
		assert.deepEqual(buildDateColumns(new Date(2026, 8, 11), 0), []);
		assert.deepEqual(buildDateColumns(new Date(2026, 8, 11), -3), []);
	});

	it("returns exactly the requested number of columns", () => {
		assert.equal(buildDateColumns(new Date(2026, 8, 11), 365).length, 365);
	});
});
