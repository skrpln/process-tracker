// Process Tracker — plugin settings.
// Pure module: the values and their cleanup; the tab that edits them is in settings-tab.ts.

import { readAlign } from "./codeblock/parse.ts";
import { DEFAULT_PROPERTY_NAMES, DEFAULT_TRACK_TAG } from "./constants.ts";
import { readEntriesMode } from "./entry/mode.ts";
import type { EntriesMode, NamesAlign, PropertyNames } from "./model/types.ts";

export interface ProcessTrackerSettings {
	/** Tag that marks a track card, without the leading `#`. */
	trackTag: string;
	/** Folder for new entry notes; empty string means the vault root. */
	entryFolder: string;
	/** How new entries are made where neither the card nor the code block says. */
	entries: EntriesMode;
	/** How the first column stands in a table whose code block does not say. */
	align: NamesAlign;
	/** What the properties the plugin reads and writes are called in this vault. */
	properties: PropertyNames;
}

export const DEFAULT_SETTINGS: ProcessTrackerSettings = {
	trackTag: DEFAULT_TRACK_TAG,
	entryFolder: "",
	entries: "notes",
	align: "center",
	properties: { ...DEFAULT_PROPERTY_NAMES },
};

/**
 * A tag as it was typed: without the leading `#` and without the spaces around it. An empty
 * field means the default tag — a tracker without a tag would have no rows at all.
 */
export function normalizeTrackTag(value: unknown): string {
	const tag = typeof value === "string" ? value.trim().replace(/^#+/, "") : "";
	return tag === "" ? DEFAULT_SETTINGS.trackTag : tag;
}

/** A folder as it was typed, without the spaces around it. Empty means the vault root. */
export function normalizeEntryFolder(value: unknown): string {
	return typeof value === "string" ? value.trim() : "";
}

/** A stored mode the plugin does not know — written by a newer version, say — is `notes`. */
export function normalizeEntriesMode(value: unknown): EntriesMode {
	return readEntriesMode(value) ?? DEFAULT_SETTINGS.entries;
}

/** A stored alignment the plugin does not know is the centre, where the names always stood. */
export function normalizeAlign(value: unknown): NamesAlign {
	return readAlign(value) ?? DEFAULT_SETTINGS.align;
}

/**
 * The name of one property as it was typed, without the spaces around it. An empty field means
 * the default name ([[expectation]] §10): a property without a name could not be read at all.
 */
export function normalizePropertyName(value: unknown, key: keyof PropertyNames): string {
	const name = typeof value === "string" ? value.trim() : "";
	return name === "" ? DEFAULT_PROPERTY_NAMES[key] : name;
}

/**
 * The names of all the properties: what is stored, and the default for everything that is not
 * — a `data.json` written before the names could be set holds none of them.
 */
export function normalizePropertyNames(value: unknown): PropertyNames {
	const stored = (typeof value === "object" && value !== null ? value : {}) as Record<string, unknown>;
	const names = { ...DEFAULT_PROPERTY_NAMES };
	for (const key of Object.keys(names) as (keyof PropertyNames)[]) {
		names[key] = normalizePropertyName(stored[key], key);
	}
	return names;
}

/**
 * Merges stored data with defaults, dropping unknown or malformed values.
 *
 * The folder was stored under `evidenceFolder` before the plugin learned to say `entry`, and
 * that key still sits in the `data.json` of everyone who set the folder back then. It is read
 * as a fallback, so a folder already chosen does not disappear; the next save writes the new
 * key and the old one goes.
 */
export function normalizeSettings(data: unknown): ProcessTrackerSettings {
	const stored = (data ?? {}) as Partial<ProcessTrackerSettings> & { evidenceFolder?: unknown };
	return {
		trackTag: normalizeTrackTag(stored.trackTag),
		entryFolder: normalizeEntryFolder(stored.entryFolder ?? stored.evidenceFolder),
		entries: normalizeEntriesMode(stored.entries),
		align: normalizeAlign(stored.align),
		properties: normalizePropertyNames(stored.properties),
	};
}
