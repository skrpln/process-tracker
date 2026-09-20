// Process Tracker — the journal of a day, looked up in the vault.
// Adapter module: the only place that knows about `obsidian-daily-notes-interface`
// ([[daily-notes]]).

import { moment } from "obsidian";
import type { TFile } from "obsidian";
import {
	appHasDailyNotesPluginLoaded,
	getAllDailyNotes,
	getDailyNote,
} from "obsidian-daily-notes-interface";

/** How a column of the table spells a day, and how moment is told to read it back. */
const ISO_DATE = "YYYY-MM-DD";

/**
 * The journals of the days asked about: the day as the table spells it — `2026-09-20` —
 * against the path of its note. A day the vault has no journal for is simply missing from
 * the map, and that is the whole answer the table needs ([[expectation]] §10).
 *
 * Nothing is created and nothing is written. The plugin does not own the journal of a day:
 * it opens the one that is there, and a day without one keeps a caption that leads nowhere.
 *
 * The library answers for both ways a vault can keep journals — the core Daily notes plugin
 * and Periodic Notes — so the reader never has to repeat a setting they have already made.
 * With neither of them on, the first question already says no, and the folder is not read
 * at all. A folder named in the settings but missing from the vault is a throw, and it means
 * the same thing as an empty vault here: no journals, no links, the table as it always was.
 */
export function findDailyNotes(days: readonly string[]): Map<string, string> {
	const found = new Map<string, string>();
	if (days.length === 0 || !appHasDailyNotesPluginLoaded()) return found;

	let journals: Record<string, TFile>;
	try {
		journals = getAllDailyNotes();
	} catch {
		return found;
	}

	for (const day of days) {
		// The library types this as a file and answers with `null` when the day has none.
		const file = getDailyNote(moment(day, ISO_DATE, true), journals) as TFile | null;
		if (file !== null) found.set(day, file.path);
	}
	return found;
}
