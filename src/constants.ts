// Process Tracker — shared constants.

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

/** Frontmatter key of a track card that links to the template of its evidence. */
export const TRACK_TEMPLATE_KEY = "template";

/** Frontmatter key of an evidence note that links to its track card. */
export const EVIDENCE_TRACK_KEY = "track";

/** Frontmatter key that dates an evidence note, as `YYYY-MM-DD`. */
export const EVIDENCE_DATE_KEY = "date";

/** Frontmatter key that checks the box: only a true value counts as done. */
export const EVIDENCE_DONE_KEY = "done";
