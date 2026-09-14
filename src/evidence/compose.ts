// Process Tracker — the name and the text of a new evidence note.
// Pure module: no Obsidian API, covered by test/compose.test.ts.

import { EVIDENCE_DATE_KEY, EVIDENCE_DONE_KEY, EVIDENCE_TRACK_KEY } from "../constants.ts";

export interface EvidenceFields {
	/** Link to the track card, written the way this vault writes links. */
	track: string;
	/** Local calendar date as `YYYY-MM-DD`. */
	date: string;
	done: boolean;
}

const FENCE = "---";

/**
 * Text of a new evidence note: the template of the track card with the three properties
 * of the plugin filled in. A template without frontmatter gets one, and a track card
 * without a template gives a bare note with an empty body ([[expectation]] §5).
 *
 * The three properties belong to the plugin: whatever the template says about `track`,
 * `date` or `done` is replaced, because the cell that was clicked knows the answer. The
 * rest of the template is left alone — `<% %>` commands included, so Templater finds its
 * work untouched when the file appears.
 */
export function composeEvidence(template: string | null, fields: EvidenceFields): string {
	const { head, body } = split(template ?? "");

	let properties = head;
	properties = setProperty(properties, EVIDENCE_TRACK_KEY, quote(fields.track));
	properties = setProperty(properties, EVIDENCE_DATE_KEY, fields.date);
	properties = setProperty(properties, EVIDENCE_DONE_KEY, String(fields.done));

	return [FENCE, ...properties, FENCE, body].join("\n");
}

/**
 * Default name of an evidence note — `{{track}} {{date}}` ([[expectation]] §5). Characters
 * a vault cannot keep in a file name are dropped, so a track named `10/10` still gets one.
 */
export function evidenceFileName(trackName: string, date: string): string {
	const name = trackName.replace(/[\\/:*?"<>|#^[\]]/g, " ").replace(/\s+/g, " ").trim();
	return name === "" ? date : `${name} ${date}`;
}

/** Path of a new evidence note; an empty folder means the root of the vault. */
export function evidencePath(folder: string, name: string): string {
	const clean = normalizeFolder(folder);
	return clean === "" ? `${name}.md` : `${clean}/${name}.md`;
}

/** A folder as the vault spells it: no leading or trailing slashes, no spare spaces. */
export function normalizeFolder(folder: string): string {
	return folder.trim().replace(/^\/+|\/+$/g, "");
}

/** Splits a note into its frontmatter lines, fences excluded, and everything below. */
function split(text: string): { head: string[]; body: string } {
	const lines = text.split("\n");
	if (lines[0]?.trim() !== FENCE) return { head: [], body: text };

	const end = lines.findIndex((line, index) => index > 0 && line.trim() === FENCE);
	if (end === -1) return { head: [], body: text };
	return { head: lines.slice(1, end), body: lines.slice(end + 1).join("\n") };
}

/**
 * Sets a top-level property. The lines that continued the old value go with it: a list
 * left orphaned under a replaced key would not parse as YAML any more.
 */
function setProperty(lines: string[], key: string, value: string): string[] {
	const at = lines.findIndex((line) => keyOf(line) === key);
	if (at === -1) return [...lines, `${key}: ${value}`];

	let end = at + 1;
	while (end < lines.length && continues(lines[end])) end++;
	return [...lines.slice(0, at), `${key}: ${value}`, ...lines.slice(end)];
}

/** The property a line opens, or `null` for a comment, an indented line, a list item. */
function keyOf(line: string): string | null {
	const match = /^([^\s:#][^:]*):(\s|$)/.exec(line);
	return match === null ? null : match[1].trim();
}

/** A line that belongs to the value above it. */
function continues(line: string): boolean {
	return /^(\s+\S|-\s)/.test(line);
}

/** A link needs quotes: `[[card]]` bare is a list of lists to a YAML parser. */
function quote(value: string): string {
	return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}
