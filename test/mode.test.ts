// Unit tests for the mode that decides how new entries are made.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readEntriesMode, resolveEntriesMode } from "../src/entry/mode.ts";

describe("readEntriesMode", () => {
	it("reads the two modes, whatever the case and the spaces", () => {
		assert.equal(readEntriesMode("notes"), "notes");
		assert.equal(readEntriesMode(" Journal "), "journal");
	});

	it("reads either number of the word", () => {
		assert.equal(readEntriesMode("note"), "notes");
		assert.equal(readEntriesMode("Journals"), "journal");
	});

	it("reads nothing else", () => {
		assert.equal(readEntriesMode("diary"), null);
		assert.equal(readEntriesMode(""), null);
		assert.equal(readEntriesMode(["journal"]), null);
		assert.equal(readEntriesMode(undefined), null);
		assert.equal(readEntriesMode("constructor"), null);
	});
});

describe("resolveEntriesMode", () => {
	it("takes the card over the block, the block over the settings", () => {
		assert.equal(resolveEntriesMode("notes", "journal", "journal"), "notes");
		assert.equal(resolveEntriesMode(null, "journal", "notes"), "journal");
		assert.equal(resolveEntriesMode(null, null, "journal"), "journal");
	});
});
