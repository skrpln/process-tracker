// Unit tests for track filtering and ordering. Docs: [[track-selection]]
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { TrackCard } from "../src/model/types.ts";
import { hasTag, normalizeTag, selectTracks } from "../src/tracks/select.ts";

function card(overrides: Partial<TrackCard> & { basename: string }): TrackCard {
	return {
		path: `${overrides.basename}.md`,
		name: overrides.basename,
		tags: ["process_tracker"],
		frontmatter: {},
		ctime: 0,
		mtime: 0,
		...overrides,
	};
}

const byName = { field: "name", direction: "asc" } as const;

describe("normalizeTag", () => {
	it("strips the hash, spaces and case", () => {
		assert.equal(normalizeTag("  #Process_Tracker "), "process_tracker");
	});
});

describe("hasTag", () => {
	it("matches an exact tag", () => {
		assert.equal(hasTag(card({ basename: "a", tags: ["process_tracker"] }), "process_tracker"), true);
	});

	it("matches a nested tag", () => {
		assert.equal(
			hasTag(card({ basename: "a", tags: ["process_tracker/health"] }), "process_tracker"),
			true,
		);
	});

	it("does not match a tag that merely starts with the same letters", () => {
		assert.equal(
			hasTag(card({ basename: "a", tags: ["process_tracker_old"] }), "process_tracker"),
			false,
		);
	});

	it("is case insensitive and tolerates a leading hash", () => {
		assert.equal(hasTag(card({ basename: "a", tags: ["#Process_Tracker"] }), "#process_tracker"), true);
	});

	it("never matches an empty tag", () => {
		assert.equal(hasTag(card({ basename: "a", tags: [""] }), ""), false);
	});
});

describe("selectTracks", () => {
	it("keeps only tagged cards", () => {
		const cards = [
			card({ basename: "cleaning" }),
			card({ basename: "readme", tags: [] }),
			card({ basename: "water", tags: ["other"] }),
		];
		assert.deepEqual(
			selectTracks(cards, "process_tracker", byName).map((it) => it.basename),
			["cleaning"],
		);
	});

	it("sorts by name ascending and descending", () => {
		const cards = [card({ basename: "water" }), card({ basename: "cleaning" }), card({ basename: "movement" })];
		assert.deepEqual(
			selectTracks(cards, "process_tracker", byName).map((it) => it.basename),
			["cleaning", "movement", "water"],
		);
		assert.deepEqual(
			selectTracks(cards, "process_tracker", { field: "name", direction: "desc" }).map(
				(it) => it.basename,
			),
			["water", "movement", "cleaning"],
		);
	});

	it("sorts numerically inside names", () => {
		const cards = [card({ basename: "track 10" }), card({ basename: "track 2" })];
		assert.deepEqual(
			selectTracks(cards, "process_tracker", byName).map((it) => it.basename),
			["track 2", "track 10"],
		);
	});

	it("sorts by ctime and mtime", () => {
		const cards = [
			card({ basename: "old", ctime: 100, mtime: 900 }),
			card({ basename: "new", ctime: 900, mtime: 100 }),
		];
		assert.deepEqual(
			selectTracks(cards, "process_tracker", { field: "ctime", direction: "desc" }).map(
				(it) => it.basename,
			),
			["new", "old"],
		);
		assert.deepEqual(
			selectTracks(cards, "process_tracker", { field: "mtime", direction: "desc" }).map(
				(it) => it.basename,
			),
			["old", "new"],
		);
	});

	it("sorts by a frontmatter property", () => {
		const cards = [
			card({ basename: "b", frontmatter: { priority: 2 } }),
			card({ basename: "a", frontmatter: { priority: 10 } }),
		];
		assert.deepEqual(
			selectTracks(cards, "process_tracker", { field: "priority", direction: "asc" }).map(
				(it) => it.basename,
			),
			["b", "a"],
		);
	});

	it("puts cards without the property last in both directions", () => {
		const cards = [
			card({ basename: "none" }),
			card({ basename: "low", frontmatter: { priority: 1 } }),
			card({ basename: "high", frontmatter: { priority: 9 } }),
		];
		for (const direction of ["asc", "desc"] as const) {
			const order = selectTracks(cards, "process_tracker", { field: "priority", direction }).map(
				(it) => it.basename,
			);
			assert.equal(order[order.length - 1], "none", direction);
		}
	});

	it("breaks ties by file name", () => {
		const cards = [
			card({ basename: "b", frontmatter: { priority: 1 } }),
			card({ basename: "a", frontmatter: { priority: 1 } }),
		];
		assert.deepEqual(
			selectTracks(cards, "process_tracker", { field: "priority", direction: "desc" }).map(
				(it) => it.basename,
			),
			["a", "b"],
		);
	});

	it("does not mutate the input array", () => {
		const cards = [card({ basename: "water" }), card({ basename: "cleaning" })];
		selectTracks(cards, "process_tracker", byName);
		assert.deepEqual(cards.map((it) => it.basename), ["water", "cleaning"]);
	});
});
