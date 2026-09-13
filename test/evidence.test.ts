// Unit tests for reading evidence properties and indexing evidence by day.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Evidence } from "../src/model/types.ts";
import {
	buildEvidenceIndex,
	cellState,
	evidenceKey,
	findEvidence,
	readDate,
	readDone,
	readTrackLink,
} from "../src/evidence/state.ts";

function evidence(overrides: Partial<Evidence> & { path: string }): Evidence {
	return {
		trackPath: "cleaning.md",
		date: "2026-09-11",
		done: true,
		...overrides,
	};
}

describe("readDate", () => {
	it("reads a date written as text", () => {
		assert.equal(readDate("2026-09-11"), "2026-09-11");
	});

	it("keeps the day of a timestamp", () => {
		assert.equal(readDate("2026-09-11T07:30:00"), "2026-09-11");
	});

	it("trims the value", () => {
		assert.equal(readDate("  2026-09-11  "), "2026-09-11");
	});

	it("reads a date the cache parsed into a Date", () => {
		assert.equal(readDate(new Date(2026, 8, 11)), "2026-09-11");
	});

	it("rejects another way of writing a date", () => {
		assert.equal(readDate("11.09.2026"), null);
	});

	it("rejects a missing or non-textual property", () => {
		assert.equal(readDate(undefined), null);
		assert.equal(readDate(null), null);
		assert.equal(readDate(20260911), null);
		assert.equal(readDate(new Date(Number.NaN)), null);
	});
});

describe("readDone", () => {
	it("checks the box only for a true value", () => {
		assert.equal(readDone(true), true);
		assert.equal(readDone(false), false);
	});

	it("reads a value typed as text", () => {
		assert.equal(readDone("true"), true);
		assert.equal(readDone(" Yes "), true);
		assert.equal(readDone("false"), false);
		assert.equal(readDone("done"), false);
	});

	it("treats a missing property as a draft", () => {
		assert.equal(readDone(undefined), false);
		assert.equal(readDone(null), false);
		assert.equal(readDone(1), false);
	});
});

describe("readTrackLink", () => {
	it("reads a wikilink", () => {
		assert.equal(readTrackLink("[[cleaning]]"), "cleaning");
	});

	it("reads a link with a folder", () => {
		assert.equal(readTrackLink("[[tracks/cleaning]]"), "tracks/cleaning");
	});

	it("drops an alias and a subpath", () => {
		assert.equal(readTrackLink("[[cleaning|Уборка]]"), "cleaning");
		assert.equal(readTrackLink("[[cleaning#Протокол]]"), "cleaning");
	});

	it("reads a bare name", () => {
		assert.equal(readTrackLink("cleaning"), "cleaning");
	});

	it("takes the first readable item of a list", () => {
		assert.equal(readTrackLink([null, "[[cleaning]]", "[[water]]"]), "cleaning");
	});

	it("rejects an empty or missing property", () => {
		assert.equal(readTrackLink("   "), null);
		assert.equal(readTrackLink("[[]]"), null);
		assert.equal(readTrackLink(undefined), null);
		assert.equal(readTrackLink(42), null);
	});
});

describe("buildEvidenceIndex", () => {
	it("finds evidence by track and date", () => {
		const index = buildEvidenceIndex([evidence({ path: "a.md" })]);
		assert.equal(findEvidence(index, "cleaning.md", "2026-09-11")?.path, "a.md");
	});

	it("tells one track from another on the same day", () => {
		const index = buildEvidenceIndex([
			evidence({ path: "a.md" }),
			evidence({ path: "b.md", trackPath: "water.md" }),
		]);
		assert.equal(findEvidence(index, "water.md", "2026-09-11")?.path, "b.md");
	});

	it("reports nothing for a day without evidence", () => {
		const index = buildEvidenceIndex([evidence({ path: "a.md" })]);
		assert.equal(findEvidence(index, "cleaning.md", "2026-09-10"), null);
	});

	it("lets done win over a draft for the same day", () => {
		const draft = evidence({ path: "a.md", done: false });
		const done = evidence({ path: "b.md", done: true });
		assert.equal(findEvidence(buildEvidenceIndex([draft, done]), "cleaning.md", "2026-09-11"), done);
		assert.equal(findEvidence(buildEvidenceIndex([done, draft]), "cleaning.md", "2026-09-11"), done);
	});

	it("keeps the first path when two notes claim the day alike", () => {
		const first = evidence({ path: "a.md" });
		const second = evidence({ path: "b.md" });
		assert.equal(findEvidence(buildEvidenceIndex([second, first]), "cleaning.md", "2026-09-11"), first);
	});

	it("gives every track and day a key of its own", () => {
		assert.notEqual(evidenceKey("cleaning.md", "2026-09-11"), evidenceKey("water.md", "2026-09-11"));
		assert.notEqual(evidenceKey("cleaning.md", "2026-09-11"), evidenceKey("cleaning.md", "2026-09-10"));
	});
});

describe("cellState", () => {
	it("names the three states", () => {
		assert.equal(cellState(null), "empty");
		assert.equal(cellState(evidence({ path: "a.md", done: false })), "draft");
		assert.equal(cellState(evidence({ path: "a.md", done: true })), "done");
	});
});
