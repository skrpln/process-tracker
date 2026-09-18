// Process Tracker — reading entry notes out of the Obsidian metadata cache.
// Adapter module: resolves the `track` link against the vault, nothing else.

import type { App, CachedMetadata, TFile } from "obsidian";
import { ENTRY_DATE_KEY, ENTRY_DONE_KEY, ENTRY_TRACK_KEY } from "../constants.ts";
import type { Entry } from "../model/types.ts";
import { readDate, readDone, readTrackLink } from "./state.ts";

/**
 * Every entry note of the vault. A note counts as an entry when it names a track
 * card and a date — the two properties the plugin identifies it by ([[expectation]] §6)
 * — however it was created: by the tracker, by a template or by hand.
 */
export function collectEntries(app: App): Entry[] {
	const entries: Entry[] = [];
	for (const file of app.vault.getMarkdownFiles()) {
		const entry = toEntry(app, file);
		if (entry !== null) entries.push(entry);
	}
	return entries;
}

/** The note at this path as the metadata cache has it; `null` when it is gone or is no entry. */
export function entryAt(app: App, path: string): Entry | null {
	const file = app.vault.getFileByPath(path);
	return file === null ? null : toEntry(app, file);
}

export function toEntry(app: App, file: TFile): Entry | null {
	const cache = app.metadataCache.getFileCache(file);
	const frontmatter = cache?.frontmatter;
	if (cache === null || cache === undefined || frontmatter === undefined) return null;

	const date = readDate(frontmatter[ENTRY_DATE_KEY]);
	if (date === null) return null;

	const link = frontmatterLink(cache, frontmatter, ENTRY_TRACK_KEY);
	if (link === null) return null;

	// The link is resolved the way Obsidian resolves it in the note itself, so a bare
	// `[[cleaning]]` finds the card wherever it lies.
	const target = app.metadataCache.getFirstLinkpathDest(link, file.path);
	if (target === null) return null;

	return {
		path: file.path,
		trackPath: target.path,
		date,
		done: readDone(frontmatter[ENTRY_DONE_KEY]),
	};
}

/**
 * The link written in a frontmatter property. Obsidian parses links inside frontmatter
 * itself and lists them in `frontmatterLinks` (`track.0` for a list item); the raw
 * property value is the fallback for a vault whose cache carries no such list.
 */
export function frontmatterLink(
	cache: CachedMetadata,
	frontmatter: Record<string, unknown>,
	key: string,
): string | null {
	const own = (cache.frontmatterLinks ?? []).find(
		(link) => link.key === key || link.key.startsWith(`${key}.`),
	);
	if (own !== undefined) return readTrackLink(own.link);
	return readTrackLink(frontmatter[key]);
}
