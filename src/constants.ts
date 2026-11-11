// Process Tracker — shared constants.

import type { PropertyNames } from "./model/types.ts";

/** Language of the code block processed by the plugin. */
export const CODE_BLOCK_LANGUAGE = "process-tracker";

/** Name the plugin registers with the core Page preview plugin, for hover previews. */
export const HOVER_SOURCE = "process-tracker";

/** Number of date columns used when `days` is not set. */
export const DEFAULT_DAYS = 7;

/** Upper bound for `days`, protects the renderer from absurd tables. */
export const MAX_DAYS = 3650;

/**
 * Lower bound for `width`, in pixels: a first column narrower than this has no room for a
 * name, and the line it is dragged by ends up under the edge of the table.
 */
export const MIN_WIDTH = 40;

/** Tag that marks a note as a track card, without the leading `#`. */
export const DEFAULT_TRACK_TAG = "process_tracker";

/**
 * The properties the plugin reads and writes, under the names they go by until the settings
 * rename them. No module reads a property by a name of its own: the names come from the
 * settings, as a parameter ([[architecture#Настройки|architecture]]).
 */
export const DEFAULT_PROPERTY_NAMES: Readonly<PropertyNames> = {
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
};

/** The heading of the section a track card keeps its own journal under, `# Journal`. */
export const JOURNAL_SECTION = "Journal";
