// Process Tracker — reading evidence notes out of the Obsidian metadata cache.
// Adapter module: resolves the `track` link against the vault, nothing else.

import type { App, CachedMetadata, TFile } from "obsidian";
import { EVIDENCE_DATE_KEY, EVIDENCE_DONE_KEY, EVIDENCE_TRACK_KEY } from "../constants.ts";
import type { Evidence } from "../model/types.ts";
import { readDate, readDone, readTrackLink } from "./state.ts";

/**
 * Every evidence note of the vault. A note counts as evidence when it names a track
 * card and a date — the two properties the plugin identifies it by ([[expectation]] §6)
 * — however it was created: by the tracker, by a template or by hand.
 */
export function collectEvidence(app: App): Evidence[] {
	const evidence: Evidence[] = [];
	for (const file of app.vault.getMarkdownFiles()) {
		const entry = toEvidence(app, file);
		if (entry !== null) evidence.push(entry);
	}
	return evidence;
}

export function toEvidence(app: App, file: TFile): Evidence | null {
	const cache = app.metadataCache.getFileCache(file);
	const frontmatter = cache?.frontmatter;
	if (cache === null || cache === undefined || frontmatter === undefined) return null;

	const date = readDate(frontmatter[EVIDENCE_DATE_KEY]);
	if (date === null) return null;

	const link = trackLink(cache, frontmatter);
	if (link === null) return null;

	// The link is resolved the way Obsidian resolves it in the note itself, so a bare
	// `[[cleaning]]` finds the card wherever it lies.
	const target = app.metadataCache.getFirstLinkpathDest(link, file.path);
	if (target === null) return null;

	return {
		path: file.path,
		trackPath: target.path,
		date,
		done: readDone(frontmatter[EVIDENCE_DONE_KEY]),
	};
}

/**
 * Obsidian parses links inside frontmatter itself and lists them in `frontmatterLinks`
 * (`track.0` for a list item); the raw property value is the fallback for a vault
 * whose cache carries no such list.
 */
function trackLink(cache: CachedMetadata, frontmatter: Record<string, unknown>): string | null {
	const own = (cache.frontmatterLinks ?? []).find(
		(link) => link.key === EVIDENCE_TRACK_KEY || link.key.startsWith(`${EVIDENCE_TRACK_KEY}.`),
	);
	if (own !== undefined) return readTrackLink(own.link);
	return readTrackLink(frontmatter[EVIDENCE_TRACK_KEY]);
}
