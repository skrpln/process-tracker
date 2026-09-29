// Process Tracker — the records of a track journal: reading them and writing them.
// Pure module: no Obsidian API, covered by test/journal.test.ts ([[entry#Журнал трека|entry]]).

import { JOURNAL_SECTION } from "../constants.ts";
import { readSoleSign } from "./state.ts";

/** A heading of a note, as the metadata cache lists it. */
export interface OutlineHeading {
	/** 1 for `#`, 2 for `##`. */
	level: number;
	/** The line the heading starts on, from 0. */
	line: number;
	/** The line it ends on: the same one, or the underline of a `===` / `---` heading. */
	end: number;
	/** The text of the heading, without the hashes. */
	text: string;
}

/** A task of a note — a list item with a box — as the metadata cache lists it. */
export interface OutlineTask {
	line: number;
	/** What stands between the brackets: a space for an open box, any other sign for a closed one. */
	mark: string;
}

/**
 * What the plugin needs to know about a note to find the records in it. The table takes it
 * from the metadata cache; a write takes it from the text it is about to change.
 */
export interface Outline {
	headings: readonly OutlineHeading[];
	tasks: readonly OutlineTask[];
	/** How many lines the note has, where the last record ends; `Infinity` when not counted. */
	lines: number;
}

/** One record of a journal. */
export interface JournalRecord {
	/** Local calendar date as `YYYY-MM-DD`. */
	date: string;
	/** Which of the records of this date in the journal it is, from 0. */
	nth: number;
	heading: string;
	/** The line of the heading. */
	line: number;
	/** The first line of the body, right under the heading. */
	body: number;
	/** The line the next record or section starts on, or the line count of the note. */
	end: number;
	/** The first box of the record, which is its `done`; `null` — the record has none. */
	box: { line: number; done: boolean } | null;
	/** The first third-level heading of the record that is a single sign. */
	mark: string | null;
}

/** A heading that starts a record: `## 2026-09-28`, and whatever follows the date. */
const RECORD_HEADING = /^(\d{4}-\d{2}-\d{2})(?!\d)/;

/**
 * The records of a journal, in the order they stand ([[expectation]] §6).
 *
 * A record is a second-level heading whose text starts with a date. It runs to the next
 * heading of the first or the second level, so `###` and below are its body, and the first
 * level is free for `# Journal`, years and months. Its `done` is the first box inside it,
 * wherever the box stands; a record without one is open.
 *
 * Its mark is the first `###` heading inside it that is a single sign — `### 🔥`, `### 4`.
 * A heading, because the metadata cache holds the text of headings and of nothing else in a
 * record; the third level, because the heading of the record itself cannot be edited in its
 * preview, while its body can; a single sign, because `### Steps` is the body of a record
 * talking, not a mark.
 */
export function readRecords(outline: Outline): JournalRecord[] {
	const bounds = outline.headings.filter((heading) => heading.level <= 2);
	const records: JournalRecord[] = [];
	const seen = new Map<string, number>();

	bounds.forEach((heading, index) => {
		if (heading.level !== 2) return;
		const match = RECORD_HEADING.exec(heading.text.trim());
		if (match === null) return;

		const date = match[1];
		const end = bounds[index + 1]?.line ?? outline.lines;
		const inside = (line: number): boolean => line > heading.end && line < end;
		const task = outline.tasks.find((item) => inside(item.line));
		const marks = outline.headings.filter((item) => item.level === 3 && inside(item.line));
		const nth = seen.get(date) ?? 0;
		seen.set(date, nth + 1);

		records.push({
			date,
			nth,
			heading: heading.text.trim(),
			line: heading.line,
			body: heading.end + 1,
			end,
			box: task === undefined ? null : { line: task.line, done: task.mark !== " " },
			mark: marks.map((item) => readSoleSign(item.text)).find((sign) => sign !== null) ?? null,
		});
	});
	return records;
}

/** A fence of a code block: its sign and how many of them open it. */
interface Fence {
	sign: string;
	length: number;
}

const ATX_HEADING = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?[ \t]*$/;
const SETEXT_UNDERLINE = /^ {0,3}(=+|-+)[ \t]*$/;
const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const LIST_ITEM = /^(?:[ \t]*>)*[ \t]*(?:[-*+]|\d{1,9}[.)])(?:[ \t]|$)/;
const TASK = /^((?:[ \t]*>)*[ \t]*(?:[-*+]|\d{1,9}[.)])[ \t]+\[)(.)(\])(?=[ \t]|$)/;

/**
 * The outline of a note read from its text — the same headings and tasks the metadata cache
 * lists, so a write finds a record exactly where the table saw it.
 *
 * A write cannot ask the cache: the cache catches up with a file a moment after it changes,
 * and a second click that came before it would change the wrong line. So the text is read
 * the way Obsidian reads it, as far as a journal needs: the frontmatter and the code blocks
 * hold no headings and no boxes, a heading is `#` to `######` or a line underlined with `===`
 * or `---`, and a box is a list item that starts with `[ ]`, in a quote or not.
 */
export function scanOutline(text: string): Outline {
	const lines = text.split("\n").map((line) => line.replace(/\r$/, ""));
	const headings: OutlineHeading[] = [];
	const tasks: OutlineTask[] = [];

	let at = frontmatterEnd(lines);
	let fence: Fence | null = null;
	// Whether the line above is a paragraph that an underline would turn into a heading.
	let paragraph = false;

	for (; at < lines.length; at++) {
		const line = lines[at];
		if (fence !== null) {
			if (closesFence(line, fence)) fence = null;
			continue;
		}

		const opening = FENCE.exec(line);
		if (opening !== null) {
			fence = { sign: opening[1][0], length: opening[1].length };
			paragraph = false;
			continue;
		}

		const atx = ATX_HEADING.exec(line);
		if (atx !== null) {
			const text = (atx[2] ?? "").replace(/(?:^|[ \t]+)#+$/, "").trim();
			headings.push({ level: atx[1].length, line: at, end: at, text });
			paragraph = false;
			continue;
		}

		const underline = paragraph ? SETEXT_UNDERLINE.exec(line) : null;
		if (underline !== null) {
			const level = underline[1][0] === "=" ? 1 : 2;
			headings.push({ level, line: at - 1, end: at, text: lines[at - 1].trim() });
			paragraph = false;
			continue;
		}

		const task = TASK.exec(line);
		if (task !== null) tasks.push({ line: at, mark: task[2] });
		paragraph = line.trim() !== "" && !LIST_ITEM.test(line) && !/^[ \t]*>/.test(line);
	}

	return { headings, tasks, lines: lines.length };
}

/** The first line after the frontmatter; 0 for a note without one. */
function frontmatterEnd(lines: readonly string[]): number {
	if (lines[0]?.trim() !== "---") return 0;
	const close = lines.findIndex((line, index) => index > 0 && /^(---|\.\.\.)\s*$/.test(line));
	return close === -1 ? 0 : close + 1;
}

function closesFence(line: string, fence: Fence): boolean {
	const match = /^ {0,3}(`+|~+)[ \t]*$/.exec(line);
	return match !== null && match[1][0] === fence.sign && match[1].length >= fence.length;
}

/**
 * The line a record written by the plugin ends with. A blank line stands above it: right under
 * a line of text, `---` would turn that text into a heading.
 */
const RECORD_RULE = "---";

/**
 * The lines of a new record: its heading, its box, the body of the template under them, and a
 * rule that closes it.
 */
export function recordLines(date: string, done: boolean, body: string): string[] {
	const lines = body.split("\n").map((line) => line.replace(/\r$/, ""));
	while (lines.length > 0 && lines[0].trim() === "") lines.shift();
	while (lines.length > 0 && lines[lines.length - 1].trim() === "") lines.pop();
	return [`## ${date}`, boxLine(done), ...lines, "", RECORD_RULE];
}

/** Where a new record goes: the line it is written before, and whether `# Journal` goes first. */
export interface RecordPlace {
	line: number;
	section: boolean;
}

/**
 * Where a new record of this date goes ([[expectation]] §6): the newest on top.
 *
 * The record goes right before the nearest older one. With nothing older, it goes after the
 * last record; with no records at all, right under `# Journal` in a track card, or at the end
 * of a journal of its own. A card without the section gets it at its end.
 *
 * No headings of years or months are made: the first record of a new month lands under the
 * heading of the last one, and moving it is the reader's call.
 */
export function recordPlace(outline: Outline, date: string, card: boolean): RecordPlace {
	const records = readRecords(outline);

	let nearest: JournalRecord | null = null;
	for (const record of records) {
		if (record.date < date && (nearest === null || record.date > nearest.date)) nearest = record;
	}
	if (nearest !== null) return { line: nearest.line, section: false };

	const last = records[records.length - 1];
	if (last !== undefined) return { line: last.end, section: false };
	if (!card) return { line: outline.lines, section: false };

	const section = outline.headings.find(
		(heading) =>
			heading.level === 1 && heading.text.trim().toLowerCase() === JOURNAL_SECTION.toLowerCase(),
	);
	return section === undefined
		? { line: outline.lines, section: true }
		: { line: section.end + 1, section: false };
}

/** A note after a record was written into it, and which record of its date the new one is. */
export interface WrittenRecord {
	text: string;
	nth: number;
	/** The line of its heading. */
	line: number;
}

/**
 * Writes a new record into the text of a journal ([[expectation]] §6). `card` says the
 * journal is the track card itself, where the records live under `# Journal`.
 *
 * The record is set apart by a blank line from the text above and below it, so records read
 * as blocks: heading, box, body, rule, blank line, the next heading. A blank line already
 * there is not doubled.
 */
export function insertRecord(
	text: string,
	date: string,
	done: boolean,
	body: string,
	card: boolean,
): WrittenRecord {
	const { lines, newline } = splitLines(text);
	const outline = { ...scanOutline(lines.join("\n")), lines: lines.length };
	const place = recordPlace(outline, date, card);

	const head = place.section ? [`# ${JOURNAL_SECTION}`, ""] : [];
	const lead = place.line > 0 && lines[place.line - 1].trim() !== "" ? [""] : [];
	const tail = place.line < lines.length && lines[place.line].trim() !== "" ? [""] : [];

	lines.splice(place.line, 0, ...lead, ...head, ...recordLines(date, done, body), ...tail);
	const line = place.line + lead.length + head.length;
	const nth = readRecords(outline).filter(
		(record) => record.date === date && record.line < place.line,
	).length;
	return { text: lines.join("\n") + newline, nth, line };
}

/**
 * Sets `done` of one record: the sign between the brackets of its first box, and nothing else
 * of the journal ([[expectation]] §8). A record without a box gets one right under its heading.
 * A box closed with a sign of its own — `[-]`, `[>]` — keeps it when asked to close.
 */
export function setRecordDone(text: string, date: string, nth: number, done: boolean): string {
	const { lines, newline } = splitLines(text);
	const record = readRecords(scanOutline(lines.join("\n"))).find(
		(item) => item.date === date && item.nth === nth,
	);
	if (record === undefined) throw new Error(`the record ${date} is no longer in the journal`);

	if (record.box === null) {
		lines.splice(record.body, 0, boxLine(done));
	} else if (record.box.done !== done) {
		lines[record.box.line] = lines[record.box.line].replace(TASK, `$1${done ? "x" : " "}$3`);
	}
	return lines.join("\n") + newline;
}

function boxLine(done: boolean): string {
	return `- [${done ? "x" : " "}] done`;
}

/**
 * The lines of a text, and the newline it ends with: a text that ends with one keeps it, and a
 * record written at the end goes before it rather than after it.
 */
function splitLines(text: string): { lines: string[]; newline: string } {
	if (text === "") return { lines: [], newline: "\n" };
	const lines = text.split("\n");
	if (lines[lines.length - 1] !== "") return { lines, newline: "" };
	lines.pop();
	return { lines, newline: "\n" };
}
