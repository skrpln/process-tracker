// Process Tracker — the `width` line the plugin writes into a code block ([[codeblock-syntax]]).
// Pure module: no Obsidian API, covered by test/width.test.ts.

import { CODE_BLOCK_LANGUAGE } from "../constants.ts";

/** Where Obsidian says a block stands: the lines of its section, counted from 0. */
export interface BlockPlace {
	lineStart: number;
	lineEnd: number;
}

/** A tracker block found in the text of a note. */
interface FencedBlock {
	/** The first line of the body, and the line after its last one. */
	from: number;
	to: number;
	/** What stands before the fence: the indent of a list, the `>` of a callout. */
	lead: string;
}

/** The parameter this module owns. */
const KEY = "width";

/** What a line of a nested block begins with: the indent of a list, the `>` of a callout. */
const LEAD = /^[ \t>]*/;

/** An opening fence: what stands before it, the fence itself, the language after it. */
const OPENING = /^([ \t>]*)(`{3,}|~{3,})[ \t]*([^\s`]*)/;

/**
 * The text of a note with the `width` line of one tracker block set, rewritten or — for
 * `null` — removed. Not a line besides is touched. Answers the same text when there is nothing
 * to change, and `null` when the block is not where the place says.
 *
 * The place is not taken on trust. It comes from Obsidian as the lines of a section, and they
 * are not always lines of the file: a note embedded by one of its headings counts them from
 * the start of that heading, and an editor with unsaved text counts lines the file does not
 * have yet. So the block is looked for inside the place and recognised by its source — the
 * very text the table was drawn from. Whatever else stands on those lines is left alone: a
 * line written into the wrong place of a note is worse than a width that was not kept.
 *
 * A section is larger than the block when the block is nested — in a callout, in a list — and
 * may then hold several trackers. They are told apart by the source too; two with the same
 * source cannot be, and neither is written to.
 */
export function rewriteWidth(
	text: string,
	place: BlockPlace,
	source: string,
	width: number | null,
): string | null {
	const lines = text.split("\n");
	const found = blocksIn(lines, place).filter((block) =>
		sameSource(lines.slice(block.from, block.to), source),
	);
	if (found.length !== 1) return null;

	const block = found[0];
	const body = lines.slice(block.from, block.to);
	// A file written with CRLF keeps its `\r` at the end of every line cut by `\n`.
	const end = lines[block.from - 1].endsWith("\r") ? "\r" : "";
	const next = withWidth(body, width, block.lead, end);
	if (next.length === body.length && next.every((line, index) => line === body[index])) {
		return text;
	}

	lines.splice(block.from, body.length, ...next);
	return lines.join("\n");
}

/**
 * The tracker blocks that stand whole between the lines of a place.
 *
 * Every fenced block is walked to its closing fence, whatever its language, so a tracker shown
 * as an example inside another code block is not taken for one. A block the place cuts short
 * is not a block of this place; one with no closing fence is whole only when the note ends in
 * it, which is how Markdown reads it.
 */
function blocksIn(lines: readonly string[], place: BlockPlace): FencedBlock[] {
	const blocks: FencedBlock[] = [];
	const last = Math.min(place.lineEnd, lines.length - 1);

	for (let index = Math.max(place.lineStart, 0); index <= last; index++) {
		const opening = OPENING.exec(lines[index]);
		if (opening === null) continue;

		const [, lead, fence, language] = opening;
		const closing = new RegExp(`^[ \\t>]*${fence[0]}{${fence.length},}[ \\t]*\\r?$`);
		let end = index + 1;
		while (end <= last && !closing.test(lines[end])) end++;
		if (end > last && last < lines.length - 1) break;

		if (language.toLowerCase() === CODE_BLOCK_LANGUAGE) {
			blocks.push({ from: index + 1, to: end, lead });
		}
		index = end;
	}
	return blocks;
}

/**
 * Is this body the source a table was drawn from? Compared the way the parser reads a block:
 * line by line, spaces at the ends dropped — together with what a nested block puts before
 * every line — and without the blank lines either of them ends in.
 */
function sameSource(body: readonly string[], source: string): boolean {
	const bare = (lines: readonly string[]): string[] => {
		const read = lines.map((line) => unlead(line).trim());
		while (read.length > 0 && read[read.length - 1] === "") read.pop();
		return read;
	};

	const written = bare(body);
	const drawn = bare(source.split("\n"));
	return written.length === drawn.length && written.every((line, index) => line === drawn[index]);
}

/**
 * The body of a block with its width set or removed.
 *
 * A width goes into the last `width` line of the block, the one the parser obeys when the
 * parameter repeats; a block without one gets it as a new line after its last line of text.
 * Removing takes every such line out: one left behind would be the width of the next render.
 */
function withWidth(
	body: readonly string[],
	width: number | null,
	lead: string,
	end: string,
): string[] {
	if (width === null) return body.filter((line) => !isWidthLine(line));

	const line = `${KEY}: ${width}`;
	const next = [...body];
	const written = lastIndex(next, isWidthLine);
	if (written !== -1) {
		next[written] = `${LEAD.exec(next[written])?.[0] ?? ""}${line}${end}`;
		return next;
	}

	const text = lastIndex(next, (row) => unlead(row).trim() !== "");
	next.splice(text + 1, 0, `${lead}${line}${end}`);
	return next;
}

/** A line the parser would read as the `width` parameter: not a comment, the key before the colon. */
function isWidthLine(raw: string): boolean {
	const line = unlead(raw).trim();
	if (line.startsWith("#") || line.startsWith("//")) return false;

	const separator = line.indexOf(":");
	return separator !== -1 && line.slice(0, separator).trim().toLowerCase() === KEY;
}

/** The last line that passes the test, or -1. */
function lastIndex(lines: readonly string[], test: (line: string) => boolean): number {
	for (let index = lines.length - 1; index >= 0; index--) {
		if (test(lines[index])) return index;
	}
	return -1;
}

/** A line without what a nested block puts before it. */
function unlead(line: string): string {
	return line.replace(LEAD, "");
}
