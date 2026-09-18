// Process Tracker — plugin settings.
// Pure module: the values and their cleanup; the tab that edits them is in settings-tab.ts.

import { DEFAULT_TRACK_TAG } from "./constants.ts";

export interface ProcessTrackerSettings {
	/** Tag that marks a track card, without the leading `#`. */
	trackTag: string;
	/** Folder for new entry notes; empty string means the vault root. */
	entryFolder: string;
}

export const DEFAULT_SETTINGS: ProcessTrackerSettings = {
	trackTag: DEFAULT_TRACK_TAG,
	entryFolder: "",
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
	};
}
