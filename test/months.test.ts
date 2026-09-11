// Unit tests for month grouping.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildDateColumns } from "../src/dates/grid.ts";
import { groupByMonth, monthLabel } from "../src/dates/months.ts";

describe("monthLabel", () => {
	it("names months in English", () => {
		assert.equal(monthLabel(1, 2026, false), "January");
		assert.equal(monthLabel(9, 2026, false), "September");
		assert.equal(monthLabel(12, 2026, false), "December");
	});

	it("adds the year when asked", () => {
		assert.equal(monthLabel(12, 2025, true), "December 2025");
	});
});

describe("groupByMonth", () => {
	it("returns nothing for an empty grid", () => {
		assert.deepEqual(groupByMonth([]), []);
	});

	it("makes one group for a week inside a month", () => {
		const groups = groupByMonth(buildDateColumns(new Date(2026, 8, 11), 7));
		assert.deepEqual(groups, [
			{ label: "September", year: 2026, month: 9, start: 0, span: 7 },
		]);
	});

	it("splits on a month boundary and keeps table order", () => {
		const groups = groupByMonth(buildDateColumns(new Date(2026, 8, 2), 4));
		assert.deepEqual(
			groups.map((group) => [group.label, group.start, group.span]),
			[
				["September", 0, 2],
				["August", 2, 2],
			],
		);
	});

	it("spans of all groups cover every column", () => {
		const columns = buildDateColumns(new Date(2026, 8, 11), 100);
		const groups = groupByMonth(columns);
		assert.equal(
			groups.reduce((total, group) => total + group.span, 0),
			columns.length,
		);
		assert.deepEqual(groups.map((group) => group.start), [0, 11, 42, 73]);
	});

	it("adds years when the table crosses a year boundary", () => {
		const groups = groupByMonth(buildDateColumns(new Date(2026, 0, 2), 3));
		assert.deepEqual(groups.map((group) => group.label), ["January 2026", "December 2025"]);
	});

	it("keeps the same month of different years apart", () => {
		const groups = groupByMonth(buildDateColumns(new Date(2026, 8, 1), 366));
		const september = groups.filter((group) => group.month === 9);
		assert.deepEqual(september.map((group) => group.label), ["September 2026", "September 2025"]);
	});
});
