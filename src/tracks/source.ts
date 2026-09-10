// Process Tracker — reading track cards out of the Obsidian metadata cache.
// Adapter module: the only place that knows about the vault.
// Docs: [[track-selection]]

import { getAllTags } from "obsidian";
import type { App, TFile } from "obsidian";
import { TRACK_NAME_KEY } from "../constants.ts";
import type { TrackCard } from "../model/types.ts";

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
		name: displayName(frontmatter, file.basename),
		tags,
		frontmatter,
		ctime: file.stat.ctime,
		mtime: file.stat.mtime,
	};
}

function displayName(frontmatter: Record<string, unknown>, basename: string): string {
	const override = frontmatter[TRACK_NAME_KEY];
	if (typeof override === "string" && override.trim() !== "") return override.trim();
	return basename;
}
