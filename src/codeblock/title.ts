// Process Tracker — the corner title: its placeholders and its links ([[codeblock-syntax]]).
// Pure module: no Obsidian API, covered by test/title.test.ts.

/** What the corner shows when the block names no title: the month and the year in sight. */
export const DEFAULT_TITLE = "{{month}} {{year}}";

/** `{{month}}` and `{{year}}`, with spaces inside the braces allowed, in any case. */
const PLACEHOLDER = /\{\{\s*(month|year)\s*\}\}/gi;

/** `[[target]]` or `[[target|text]]`; brackets inside are not part of a link. */
const LINK = /\[\[([^[\]]+)\]\]/g;

/** A piece of the title: plain text, or the text of a link and the note it leads to. */
export interface TitlePart {
	text: string;
	/** The link as written between the brackets, without the text after `|`. */
	link?: string;
}

/**
 * Whether the title changes as the columns scroll. Only a title with a placeholder does: a
 * title of plain text and links is drawn once and never rewritten.
 */
export function followsScroll(title: string): boolean {
	return title.search(PLACEHOLDER) !== -1;
}

/**
 * The title with the month and the year of the columns in sight put in place of its
 * placeholders. A link may carry them as well — `[[{{year}}]]` leads to the note of the year.
 */
export function fillTitle(title: string, month: string, year: string): string {
	return title.replace(PLACEHOLDER, (_, name: string) =>
		name.toLowerCase() === "month" ? month : year,
	);
}

/**
 * Splits a filled title into text and links. Only `[[…]]` is read: the corner is a caption,
 * not a note, and the rest of markdown stays as it was written ([[rendering]]).
 *
 * A link shows its text after `|`, or else the link itself, as Obsidian shows it: a heading
 * after `>` instead of `#`.
 */
export function titleParts(title: string): TitlePart[] {
	const parts: TitlePart[] = [];
	let last = 0;
	for (const match of title.matchAll(LINK)) {
		const start = match.index ?? 0;
		if (start > last) parts.push({ text: title.slice(last, start) });

		const inner = match[1];
		const bar = inner.indexOf("|");
		const link = (bar === -1 ? inner : inner.slice(0, bar)).trim();
		const alias = bar === -1 ? "" : inner.slice(bar + 1).trim();
		if (link === "") parts.push({ text: match[0] });
		else parts.push({ text: alias !== "" ? alias : link.replace(/#/g, " > "), link });

		last = start + match[0].length;
	}
	if (last < title.length) parts.push({ text: title.slice(last) });
	return parts;
}
