// Process Tracker — the daily note of a day, looked up and created in the vault.
// Adapter module: the only place that knows about `obsidian-daily-notes-interface`
// ([[daily-notes]]).

import { TFile, Vault, moment, normalizePath } from "obsidian";
import type { App, TFolder } from "obsidian";
import {
	appHasDailyNotesPluginLoaded,
	getDailyNoteSettings,
} from "obsidian-daily-notes-interface";
import {
	dailyNoteBasename,
	dailyNoteName,
	dailyNotePath,
	fillDailyNoteTemplate,
	nameTellsTheDay,
} from "./format.ts";
import type { Moment } from "./format.ts";

/** How a column of the table spells a day, and how moment is told to read it back. */
const ISO_DATE = "YYYY-MM-DD";

/**
 * The moment of Obsidian, typed the way the plugin calls it ([[daily-notes]]). One cast, in
 * one place: the types Obsidian ships declare it as a namespace, and a namespace is not
 * callable under the newer defaults of TypeScript. Everything past this line stays typed.
 */
const makeMoment = moment as unknown as (input?: string, format?: string, strict?: boolean) => Moment;

/** What the core Daily notes plugin files a daily note under when no format is set. */
const DEFAULT_FORMAT = "YYYY-MM-DD";

/** Where the daily notes of one table live, and how they are named. */
export interface DailyNotePlace {
	folder: TFolder;
	format: string;
	/** Path of the template of a new daily note, as the settings spell it; empty — none. */
	template: string;
	/**
	 * Whether a day missed at its path is looked for by name inside the folder. Only a folder
	 * the code block names is searched ([[expectation]] §4); the folder of the settings is
	 * asked by path alone, as the core plugin asks it.
	 */
	byName: boolean;
}

/**
 * Where the daily notes of a table live, or `null` when the table has none to lead to.
 *
 * The folder is the one the code block names in `daily_note_dir`; without it, the one the
 * daily notes are kept in — the core Daily notes plugin or Periodic Notes, whichever the vault
 * uses, so the reader never repeats a setting already made. A settings folder left empty is
 * the default location for new notes, as it is to the core plugin, and not the vault root.
 *
 * With neither plugin on there is nothing to lead to. A folder that is named but missing is
 * the same answer — and a warning, when it is the code block that named it.
 */
export function dailyNotePlace(
	app: App,
	dir: string | null,
	warnings: string[] = [],
): DailyNotePlace | null {
	if (!appHasDailyNotesPluginLoaded()) return null;

	// Typed as always there, the settings come back `undefined` when the library could not
	// read them.
	const read = getDailyNoteSettings() as ReturnType<typeof getDailyNoteSettings> | undefined;
	const settings = read ?? {};
	const format = settings.format ?? DEFAULT_FORMAT;
	const template = settings.template ?? "";

	if (dir !== null) {
		const folder =
			dir === "" ? app.vault.getRoot() : app.vault.getFolderByPath(normalizePath(dir));
		if (folder === null) {
			warnings.push(
				`Folder "${dir}" of daily_note_dir is not in the vault, no day leads to a daily note.`,
			);
			return null;
		}
		return { folder, format, template, byName: true };
	}

	const named = settings.folder ?? "";
	const folder =
		named === ""
			? app.fileManager.getNewFileParent("")
			: app.vault.getFolderByPath(normalizePath(named));
	return folder === null ? null : { folder, format, template, byName: false };
}

/** The path the daily note of a day has — or will have, once it is created. */
export function dailyNotePathOf(place: DailyNotePlace, day: string): string {
	return normalizePath(dailyNotePath(place.folder.path, dailyNoteName(dayOf(day), place.format)));
}

/**
 * The daily notes of the days asked about: the day as the table spells it — `2026-09-20` —
 * against the path of its note. A day the vault has no daily note for is simply missing from
 * the map, and that is the whole answer the table needs ([[expectation]] §9).
 *
 * Nothing is walked to find them. Every day is formatted into the path its daily note has and
 * asked for by that path — one lookup a day, whatever the size of the vault. A folder the code
 * block names is searched by name as well, for the days the path missed: an archive is laid
 * out by whoever moved the notes there, not by the format.
 */
export function findDailyNotes(
	app: App,
	place: DailyNotePlace,
	days: readonly string[],
): Map<string, string> {
	const found = new Map<string, string>();
	const missed: string[] = [];
	for (const day of days) {
		const file = app.vault.getFileByPath(dailyNotePathOf(place, day));
		if (file === null) missed.push(day);
		else found.set(day, file.path);
	}

	if (place.byName && missed.length > 0) findByName(place, missed, found);
	return found;
}

/**
 * Looks for the missed days by file name, inside the folder of the table and nowhere else.
 * A file is compared by its name, not parsed: the names the days would have are made once,
 * and each file costs a lookup in a map. A day whose name does not tell it apart from
 * another day is not searched for — `21` under `YYYY/MM/DD` is the 21st of every month.
 * Of two files with the name of one day, the first the walk meets wins.
 */
function findByName(
	place: DailyNotePlace,
	days: readonly string[],
	found: Map<string, string>,
): void {
	const wanted = new Map<string, string>();
	for (const day of days) {
		const date = dayOf(day);
		if (!nameTellsTheDay(date, place.format)) continue;
		wanted.set(dailyNoteBasename(dailyNoteName(date, place.format)), day);
	}
	if (wanted.size === 0) return;

	Vault.recurseChildren(place.folder, (file) => {
		if (!(file instanceof TFile) || file.extension !== "md") return;
		const day = wanted.get(file.basename);
		if (day !== undefined && !found.has(day)) found.set(day, file.path);
	});
}

/**
 * Creates the daily note of a day at its path and returns it; one that has appeared there
 * in the meantime is returned as it is ([[daily-notes]]).
 *
 * The template is the one the daily notes are kept with, filled in for that day. Folders the
 * path goes through are made on the way: a format like `YYYY/MM/DD` files a new month into a
 * folder that does not exist yet.
 */
export async function createDailyNote(
	app: App,
	place: DailyNotePlace,
	day: string,
): Promise<TFile> {
	const path = dailyNotePathOf(place, day);
	const existing = app.vault.getFileByPath(path);
	if (existing !== null) return existing;

	const template = await readTemplate(app, place.template);
	const text = fillDailyNoteTemplate(template, dayOf(day), place.format, makeMoment());

	const parent = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
	if (parent !== "" && app.vault.getFolderByPath(parent) === null) {
		await app.vault.createFolder(parent);
	}
	return await app.vault.create(path, text);
}

/**
 * The text of the template, read the way the core plugin reads it: a path without an
 * extension is a note. A template that is named but missing stops the whole thing, as the
 * template of an entry does: a typo in the setting would otherwise be paid for with empty
 * daily notes.
 */
async function readTemplate(app: App, template: string): Promise<string> {
	if (template === "") return "";

	let path = normalizePath(template);
	if (!/\.[^/]+$/.test(path)) path += ".md";
	const file = app.vault.getFileByPath(path);
	if (file === null) throw new Error(`the daily note template "${template}" is gone`);
	return await app.vault.cachedRead(file);
}

/** A column of the table as a moment: the local calendar day, read strictly. */
function dayOf(day: string): Moment {
	return makeMoment(day, ISO_DATE, true);
}
