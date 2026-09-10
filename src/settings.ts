// Process Tracker — plugin settings.
// The settings tab arrives in Phase 6; Phase 1 only needs the values.
// Docs: [[architecture]]

import { DEFAULT_TRACK_TAG } from "./constants.ts";

export interface ProcessTrackerSettings {
	/** Tag that marks a track card, without the leading `#`. */
	trackTag: string;
	/** Folder for new evidence notes; empty string means the vault root. */
	evidenceFolder: string;
}

export const DEFAULT_SETTINGS: ProcessTrackerSettings = {
	trackTag: DEFAULT_TRACK_TAG,
	evidenceFolder: "",
};

/** Merges stored data with defaults, dropping unknown or malformed values. */
export function normalizeSettings(data: unknown): ProcessTrackerSettings {
	const stored = (data ?? {}) as Partial<ProcessTrackerSettings>;
	const tag = typeof stored.trackTag === "string" ? stored.trackTag.trim().replace(/^#/, "") : "";
	const folder = typeof stored.evidenceFolder === "string" ? stored.evidenceFolder.trim() : "";
	return {
		trackTag: tag === "" ? DEFAULT_SETTINGS.trackTag : tag,
		evidenceFolder: folder,
	};
}
