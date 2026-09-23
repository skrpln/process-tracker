// Process Tracker — the name, the path and the first text of the journal of a day.
// Pure module: works on the moments it is given, covered by test/journal.test.ts
// ([[daily-notes]]).

import { normalizeFolder } from "../entry/compose.ts";

/**
 * A day, as much of one as the plugin asks for; Obsidian hands it the real moment.
 *
 * The type is written out rather than taken from the moment the Obsidian types export.
 * That one is declared as a namespace import, and a namespace is not callable while
 * `esModuleInterop` is on — as it is by default in TypeScript 6 and in the linter the
 * community directory runs. Types taken from it would collapse there, and every line that
 * touched a day would be an untyped one.
 */
export interface Moment {
	clone(): Moment;
	add(amount: number, unit: TimeUnit): Moment;
	subtract(amount: number, unit: TimeUnit): Moment;
	set(values: { hour: number; minute: number; second: number }): Moment;
	get(unit: "hour" | "minute" | "second"): number;
	format(format?: string): string;
}

/**
 * Units a day is moved by: the words the plugin uses itself, and the letters a template
 * writes a shift with — `{{date+1d}}`, `{{date-2w}}`. Spelled out, because the units of the
 * real moment are a list of literals too, and a plain `string` would not fit it.
 *
 * The case of a letter is its meaning: `M` is a month, `m` is a minute.
 */
export type TimeUnit =
	| "day"
	| "week"
	| "month"
	| "year"
	| "y"
	| "Q"
	| "M"
	| "w"
	| "d"
	| "h"
	| "m"
	| "s";

/**
 * The name the journal of a day is filed under, the folders of the format included:
 * `2026-09-21` for `YYYY-MM-DD`, `2026/09/21` for `YYYY/MM/DD`. Trimmed, as the core Daily
 * notes plugin trims it.
 */
export function journalName(day: Moment, format: string): string {
	return day.format(format).trim();
}

/**
 * Where the journal of that name lies in a folder: the folder, then the name with its own
 * folders, then `.md` — the path the core plugin asks for when it opens the note of today.
 * An empty folder, and `/`, is the vault root.
 */
export function journalPath(folder: string, name: string): string {
	const clean = normalizeFolder(folder);
	return clean === "" ? `${name}.md` : `${clean}/${name}.md`;
}

/** The last part of a name — what a file of that journal is called: `2026-09-21`. */
export function journalBasename(name: string): string {
	return name.slice(name.lastIndexOf("/") + 1);
}

/** Days close enough to share a file name with this one, if the format leaves something out. */
const NEIGHBOURS = [
	[1, "day"],
	[1, "week"],
	[1, "month"],
	[1, "year"],
] as const;

/**
 * Whether the file name alone tells the day, with no folder around it.
 *
 * `YYYY-MM-DD` does: no other day is called `2026-09-21`. `YYYY/MM/DD` does not: its files
 * are called `21`, and every month has one — a search by name would take the 21st of any
 * month for this one. The answer is read off the neighbours of the day: a format that drops
 * the year, the month or the day names two of them the same.
 */
export function nameTellsTheDay(day: Moment, format: string): boolean {
	const own = journalBasename(journalName(day, format));
	return NEIGHBOURS.every(
		([amount, unit]) =>
			journalBasename(journalName(day.clone().add(amount, unit), format)) !== own,
	);
}

/**
 * The text a new journal starts with: its template, with the placeholders filled in.
 *
 * The placeholders are read the way `obsidian-daily-notes-interface` reads them — and so the
 * Calendar plugin, and every plugin that creates a journal through that library:
 *
 * - `{{date}}` and `{{title}}` — the name of the journal;
 * - `{{time}}` — the time now, `HH:mm`;
 * - `{{date:format}}`, `{{time:format}}` — the day of the journal at the time now, in a
 *   format of its own, shifted by `{{date+1d:format}}` or `{{date-2w:format}}` if asked;
 * - `{{yesterday}}`, `{{tomorrow}}` — the days around it, in the format of the journal.
 *
 * The core Daily notes plugin reads `{{date}}` differently: it is today to it, which is right
 * for the note of today and wrong for a journal written into any other day.
 */
export function fillJournalTemplate(
	template: string,
	day: Moment,
	format: string,
	now: Moment,
): string {
	const name = journalName(day, format);
	return template
		.replace(/{{\s*date\s*}}/gi, name)
		.replace(/{{\s*time\s*}}/gi, now.format("HH:mm"))
		.replace(/{{\s*title\s*}}/gi, name)
		.replace(
			/{{\s*(date|time)\s*(([+-]\d+)([yqmwdhs]))?\s*(:.+?)?}}/gi,
			(
				_match: string,
				_kind: string,
				shift: string | undefined,
				amount: string | undefined,
				unit: string | undefined,
				own: string | undefined,
			) => {
				const at = day.clone().set({
					hour: now.get("hour"),
					minute: now.get("minute"),
					second: now.get("second"),
				});
				if (shift !== undefined && amount !== undefined && unit !== undefined) {
					at.add(Number.parseInt(amount, 10), unit as TimeUnit);
				}
				return own === undefined ? at.format(format) : at.format(own.slice(1).trim());
			},
		)
		.replace(/{{\s*yesterday\s*}}/gi, day.clone().subtract(1, "day").format(format))
		.replace(/{{\s*tomorrow\s*}}/gi, day.clone().add(1, "day").format(format));
}
