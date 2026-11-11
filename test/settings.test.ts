// Unit tests for the settings and their cleanup.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	DEFAULT_SETTINGS,
	normalizeAlign,
	normalizeEntriesMode,
	normalizeEntryFolder,
	normalizeSettings,
	normalizeTrackTag,
} from "../src/settings.ts";

describe("normalizeTrackTag", () => {
	it("takes the tag as it was typed", () => {
		assert.equal(normalizeTrackTag("habits"), "habits");
	});

	it("drops the leading hash and the spaces around it", () => {
		assert.equal(normalizeTrackTag("  #habits "), "habits");
	});

	it("falls back to the default for an empty or unreadable value", () => {
		assert.equal(normalizeTrackTag(""), DEFAULT_SETTINGS.trackTag);
		assert.equal(normalizeTrackTag("#"), DEFAULT_SETTINGS.trackTag);
		assert.equal(normalizeTrackTag(42), DEFAULT_SETTINGS.trackTag);
	});
});

describe("normalizeEntryFolder", () => {
	it("keeps the folder, without the spaces around it", () => {
		assert.equal(normalizeEntryFolder(" entry/2026 "), "entry/2026");
	});

	it("answers the vault root for an empty or unreadable value", () => {
		assert.equal(normalizeEntryFolder("   "), "");
		assert.equal(normalizeEntryFolder(null), "");
	});
});

describe("normalizeSettings", () => {
	it("reads what data.json holds", () => {
		assert.deepEqual(normalizeSettings({ trackTag: "#habits", entryFolder: "entry" }), {
			trackTag: "habits",
			entryFolder: "entry",
			entries: "notes",
			align: "center",
		});
	});

	it("stands on the defaults when there is nothing stored", () => {
		assert.deepEqual(normalizeSettings(null), DEFAULT_SETTINGS);
		assert.deepEqual(normalizeSettings({ trackTag: 0 }), DEFAULT_SETTINGS);
	});

	it("reads the folder stored under the old key", () => {
		assert.equal(normalizeSettings({ evidenceFolder: "Журнал" }).entryFolder, "Журнал");
	});

	it("prefers the new key when data.json holds both", () => {
		const stored = { entryFolder: "Записи", evidenceFolder: "Журнал" };
		assert.equal(normalizeSettings(stored).entryFolder, "Записи");
	});

	it("keeps the vault root chosen under the new key", () => {
		assert.equal(normalizeSettings({ entryFolder: "", evidenceFolder: "Журнал" }).entryFolder, "");
	});
});

describe("normalizeEntriesMode", () => {
	it("keeps the two modes", () => {
		assert.equal(normalizeEntriesMode("notes"), "notes");
		assert.equal(normalizeEntriesMode("journal"), "journal");
	});

	it("answers notes for a mode it does not know", () => {
		assert.equal(normalizeEntriesMode("diary"), "notes");
		assert.equal(normalizeEntriesMode(undefined), "notes");
	});

	it("is read from data.json with the rest", () => {
		assert.equal(normalizeSettings({ entries: "journal" }).entries, "journal");
		assert.equal(normalizeSettings({ entries: 1 }).entries, "notes");
	});
});

describe("normalizeAlign", () => {
	it("keeps the three alignments, in any case", () => {
		assert.equal(normalizeAlign("left"), "left");
		assert.equal(normalizeAlign("center"), "center");
		assert.equal(normalizeAlign(" Right "), "right");
	});

	it("answers the centre for an alignment it does not know", () => {
		assert.equal(normalizeAlign("middle"), "center");
		assert.equal(normalizeAlign(undefined), "center");
	});

	it("is read from data.json with the rest", () => {
		assert.equal(normalizeSettings({ align: "left" }).align, "left");
		assert.equal(normalizeSettings({ align: 1 }).align, "center");
	});
});
