// Unit tests for the settings and their cleanup.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	DEFAULT_SETTINGS,
	normalizeEvidenceFolder,
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

describe("normalizeEvidenceFolder", () => {
	it("keeps the folder, without the spaces around it", () => {
		assert.equal(normalizeEvidenceFolder(" evidence/2026 "), "evidence/2026");
	});

	it("answers the vault root for an empty or unreadable value", () => {
		assert.equal(normalizeEvidenceFolder("   "), "");
		assert.equal(normalizeEvidenceFolder(null), "");
	});
});

describe("normalizeSettings", () => {
	it("reads what data.json holds", () => {
		assert.deepEqual(normalizeSettings({ trackTag: "#habits", evidenceFolder: "evidence" }), {
			trackTag: "habits",
			evidenceFolder: "evidence",
		});
	});

	it("stands on the defaults when there is nothing stored", () => {
		assert.deepEqual(normalizeSettings(null), DEFAULT_SETTINGS);
		assert.deepEqual(normalizeSettings({ trackTag: 0 }), DEFAULT_SETTINGS);
	});
});
