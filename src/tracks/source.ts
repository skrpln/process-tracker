// Process Tracker — reading track cards out of the Obsidian metadata cache.
// Adapter module: the only place that knows about the vault.

import { getAllTags } from "obsidian";
import type { App, TFile } from "obsidian";
import { readEntriesMode } from "../entry/mode.ts";
import type { PropertyNames, TrackCard } from "../model/types.ts";
import { readCardColor } from "./color.ts";
import { trackDisplayName } from "./select.ts";

/**
 * One note as a `TrackCard`. The render maps every note of the vault through it, in the same
 * pass that finds the entries; filtering by tag happens later, in `selectTracks`, so that the
 * pure layer stays testable and this adapter stays trivial.
 *
 * The properties are read under the names the settings give them.
 */
export function toTrackCard(app: App, file: TFile, names: PropertyNames): TrackCard {
	const cache = app.metadataCache.getFileCache(file);
	const frontmatter = (cache?.frontmatter ?? {}) as Record<string, unknown>;
	const tags = (cache ? (getAllTags(cache) ?? []) : []).map((tag) =>
		tag.replace(/^#/, "").toLowerCase(),
	);

	return {
		path: file.path,
		basename: file.basename,
		name: trackDisplayName(frontmatter, file.basename, names.trackName),
		color: readCardColor(frontmatter, names.trackColor),
		entries: readEntriesMode(frontmatter[names.entries]),
		tags,
		frontmatter,
		ctime: file.stat.ctime,
		mtime: file.stat.mtime,
	};
}
