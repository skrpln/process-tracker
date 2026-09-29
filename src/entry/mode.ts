// Process Tracker — how the new entries of a track are made ([[entry#Журнал трека|entry]]).
// Pure module: no Obsidian API, covered by test/mode.test.ts.

import type { EntriesMode } from "../model/types.ts";

/**
 * The words a mode is written with. The number of the word is not the reader's worry:
 * `entries: note` is as clear as `entries: notes`, and a card that says it would otherwise be
 * overruled in silence.
 */
const MODES: ReadonlyMap<string, EntriesMode> = new Map([
	["notes", "notes"],
	["note", "notes"],
	["journal", "journal"],
	["journals", "journal"],
]);

/**
 * The mode as it was written, or `null` for anything else. Case and the spaces around it do
 * not matter; a list, a number, an empty value are no mode at all.
 */
export function readEntriesMode(raw: unknown): EntriesMode | null {
	if (typeof raw !== "string") return null;
	return MODES.get(raw.trim().toLowerCase()) ?? null;
}

/**
 * The mode of one track in one table: the card first, the code block after it, the settings
 * where neither said anything — the order the colour of a track is resolved in
 * ([[expectation]] §5).
 */
export function resolveEntriesMode(
	card: EntriesMode | null,
	block: EntriesMode | null,
	settings: EntriesMode,
): EntriesMode {
	return card ?? block ?? settings;
}
