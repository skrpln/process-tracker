// Process Tracker — shared constants.
// Docs: [[architecture]]

/** Language of the code block processed by the plugin. */
export const CODE_BLOCK_LANGUAGE = "process-tracker";

/** Number of date columns used when `days` is not set and no evidence exists yet. */
export const DEFAULT_DAYS = 7;

/** Upper bound for `days`, protects the renderer from absurd tables. */
export const MAX_DAYS = 3650;

/** Tag that marks a note as a track card, without the leading `#`. */
export const DEFAULT_TRACK_TAG = "process_tracker";

/** Frontmatter key that overrides the displayed track name. */
export const TRACK_NAME_KEY = "track_name";
