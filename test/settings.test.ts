// Unit tests for the settings and their cleanup.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	DEFAULT_SETTINGS,
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
