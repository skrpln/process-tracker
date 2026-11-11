// Unit tests for the settings and their cleanup.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	DEFAULT_SETTINGS,
	normalizeAlign,
	normalizeClick,
	normalizeEntriesMode,
	normalizeEntryFolder,
	normalizePropertyName,
	normalizePropertyNames,
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
			tableClick: "open",
			checklistClick: "open",
			properties: DEFAULT_SETTINGS.properties,
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

describe("normalizeClick", () => {
	it("keeps the two actions, in any case", () => {
		assert.equal(normalizeClick("open"), "open");
		assert.equal(normalizeClick("status"), "status");
		assert.equal(normalizeClick(" Status "), "status");
	});

	it("answers open for an action it does not know", () => {
		assert.equal(normalizeClick("toggle"), "open");
		assert.equal(normalizeClick(undefined), "open");
		assert.equal(normalizeClick(true), "open");
	});

	it("is read from data.json for the table and for the checklist apart", () => {
		const settings = normalizeSettings({ checklistClick: "status" });
		assert.equal(settings.tableClick, "open");
		assert.equal(settings.checklistClick, "status");
		assert.equal(normalizeSettings({ tableClick: "status" }).tableClick, "status");
		assert.equal(normalizeSettings({ tableClick: 1 }).tableClick, "open");
	});

	it("leaves both gestures as they always were until the settings say otherwise", () => {
		assert.equal(DEFAULT_SETTINGS.tableClick, "open");
		assert.equal(DEFAULT_SETTINGS.checklistClick, "open");
	});
});

describe("property names", () => {
	it("are the names the plugin always used, until the settings say otherwise", () => {
		assert.deepEqual(normalizeSettings(null).properties, {
			track: "track",
			done: "done",
			created: "created",
			closed: "closed",
			date: "date",
			mark: "mark",
			trackName: "track_name",
			trackColor: "track_color",
			template: "template",
			entries: "entries",
			journal: "journal",
			recurrence: "recurrence",
		});
	});

	it("keeps a name as it was typed, without the spaces around it", () => {
		assert.equal(normalizePropertyName("  finished ", "closed"), "finished");
	});

	it("answers the default name for an empty or unreadable field", () => {
		assert.equal(normalizePropertyName("   ", "closed"), "closed");
		assert.equal(normalizePropertyName(undefined, "trackName"), "track_name");
		assert.equal(normalizePropertyName(7, "done"), "done");
	});

	it("reads the names stored, and the defaults for the rest", () => {
		const names = normalizePropertyNames({ closed: "finished", track: "", unknown: "x" });
		assert.equal(names.closed, "finished");
		assert.equal(names.track, "track");
		assert.equal(names.done, "done");
		assert.equal("unknown" in names, false);
	});

	it("stands on the defaults when data.json holds no names or something else", () => {
		assert.deepEqual(normalizePropertyNames("closed"), DEFAULT_SETTINGS.properties);
		assert.deepEqual(normalizeSettings({ properties: { mark: "rating" } }).properties.mark, "rating");
	});

	it("does not share the defaults with the settings it makes", () => {
		const settings = normalizeSettings(null);
		settings.properties.done = "finished";
		assert.equal(normalizeSettings(null).properties.done, "done");
		assert.equal(DEFAULT_SETTINGS.properties.done, "done");
	});
});
