// Process Tracker — the name and the text of a new entry note.
// Pure module: no Obsidian API, covered by test/compose.test.ts.

import type { PropertyNames } from "../model/types.ts";

export interface EntryFields {
	/** Link to the track card, written the way this vault writes links. */
	track: string;
	/** The day of the cell that was clicked, `YYYY-MM-DD`. */
	created: string;
	done: boolean;
	/** When a done entry was closed, `YYYY-MM-DD HH:mm`; `null` for an open one. */
	closed: string | null;
}

/** The properties a new entry note is made with. */
export type EntryNames = Pick<PropertyNames, "track" | "created" | "done" | "closed">;

const FENCE = "---";

/**
 * Text of a new entry note: the template of the track card with the properties of the plugin
 * filled in — `track`, `created` and `done`, and `closed` for an entry made done. A template
 * without frontmatter gets one, and a track card without a template gives a bare note with an
 * empty body ([[expectation]] §5). The names of the properties are the ones the settings give.
 *
 * These properties belong to the plugin: whatever the template says about them is replaced,
 * because the cell that was clicked knows the answer — a `created` the template fills with
 * today would put a mark set for yesterday into today. The rest of the template is left alone,
 * `date` and `<% %>` commands included, so Templater finds its work untouched when the file
 * appears.
 */
export function composeEntry(
	template: string | null,
	fields: EntryFields,
	names: EntryNames,
): string {
	const { head, body } = split(template ?? "");

	let properties = head;
	properties = setProperty(properties, names.track, quote(fields.track));
	properties = setProperty(properties, names.created, fields.created);
	properties = setProperty(properties, names.done, String(fields.done));
	if (fields.closed !== null) properties = setProperty(properties, names.closed, fields.closed);

	return [FENCE, ...properties, FENCE, body].join("\n");
}

/**
 * Default name of an entry note — `{{track}} {{date}}` ([[expectation]] §5). Characters
 * a vault cannot keep in a file name are dropped, so a track named `10/10` still gets one.
 */
export function entryFileName(trackName: string, date: string): string {
	const name = trackName.replace(/[\\/:*?"<>|#^[\]]/g, " ").replace(/\s+/g, " ").trim();
	return name === "" ? date : `${name} ${date}`;
}

/** Path of a new entry note; an empty folder means the root of the vault. */
export function entryPath(folder: string, name: string): string {
	const clean = normalizeFolder(folder);
	return clean === "" ? `${name}.md` : `${clean}/${name}.md`;
}

/** A folder as the vault spells it: no leading or trailing slashes, no spare spaces. */
export function normalizeFolder(folder: string): string {
	return folder.trim().replace(/^\/+|\/+$/g, "");
}

/** Stands in for a removed command, so its line can tell it held one. No text holds it. */
const COMMAND = "\u0000";
const COMMANDS = /\u0000/g;

/**
 * What a record of a journal is written from: the body of the template, without its properties
 * and without its Templater commands ([[entry#Создание записи|entry]]).
 *
 * The properties are the business of a note of its own, and a record has none. The commands
 * would not run: Templater acts on a file as it is created, and a record is written into one
 * that exists — left in place, `<%* tp.file.move(...) %>` would stay in the journal as text.
 * A line that held nothing but commands goes with them; a line with text of its own keeps it.
 */
export function recordBody(template: string): string {
	const marked = split(template).body.replace(/<%[\s\S]*?%>/g, COMMAND);
	return marked
		.split("\n")
		.filter((line) => !line.includes(COMMAND) || line.replace(COMMANDS, "").trim() !== "")
		.map((line) => line.replace(COMMANDS, ""))
		.join("\n");
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
