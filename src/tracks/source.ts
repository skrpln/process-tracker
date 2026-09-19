// Process Tracker — reading track cards out of the Obsidian metadata cache.
// Adapter module: the only place that knows about the vault.

import { getAllTags } from "obsidian";
import type { App, TFile } from "obsidian";
import type { TrackCard } from "../model/types.ts";
import { readCardColor } from "./color.ts";
import { trackDisplayName } from "./select.ts";

/**
 * Maps every markdown note of the vault to a `TrackCard`.
 * Filtering by tag happens later, in `selectTracks`, so that the pure layer
 * stays testable and this adapter stays trivial.
 */
export function collectTrackCards(app: App): TrackCard[] {
	return app.vault.getMarkdownFiles().map((file) => toTrackCard(app, file));
}

export function toTrackCard(app: App, file: TFile): TrackCard {
	const cache = app.metadataCache.getFileCache(file);
	const frontmatter = (cache?.frontmatter ?? {}) as Record<string, unknown>;
	const tags = (cache ? (getAllTags(cache) ?? []) : []).map((tag) =>
		tag.replace(/^#/, "").toLowerCase(),
	);

	return {
		path: file.path,
		basename: file.basename,
		name: trackDisplayName(frontmatter, file.basename),
		color: readCardColor(frontmatter),
		tags,
		frontmatter,
		ctime: file.stat.ctime,
		mtime: file.stat.mtime,
	};
}
