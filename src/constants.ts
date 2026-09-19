// Process Tracker — shared constants.

/** Language of the code block processed by the plugin. */
export const CODE_BLOCK_LANGUAGE = "process-tracker";

/** Name the plugin registers with the core Page preview plugin, for hover previews. */
export const HOVER_SOURCE = "process-tracker";

/** Number of date columns used when `days` is not set. */
export const DEFAULT_DAYS = 7;

/** Upper bound for `days`, protects the renderer from absurd tables. */
export const MAX_DAYS = 3650;

/** Tag that marks a note as a track card, without the leading `#`. */
export const DEFAULT_TRACK_TAG = "process_tracker";

/** Frontmatter key that overrides the displayed track name. */
export const TRACK_NAME_KEY = "track_name";

/** Frontmatter key that gives a track a colour of its own, in any form CSS understands. */
export const TRACK_COLOR_KEY = "track_color";

/** Frontmatter key of a track card that links to the template of its entries. */
export const TRACK_TEMPLATE_KEY = "template";

/** Frontmatter key of an entry note that links to its track card. */
export const ENTRY_TRACK_KEY = "track";

/** Frontmatter key that dates an entry note, as `YYYY-MM-DD`. */
export const ENTRY_DATE_KEY = "date";

/** Frontmatter key that checks the box: only a true value counts as done. */
export const ENTRY_DONE_KEY = "done";
