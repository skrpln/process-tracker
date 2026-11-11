// Process Tracker — the links between track cards, read out of the Obsidian metadata cache
// ([[nested-tracks]]). Adapter module: resolves links against the vault, reads no file.

import type { App } from "obsidian";
import { frontmatterLinks } from "../entry/source.ts";
import type { PropertyNames } from "../model/types.ts";
import { trackDisplayName } from "./select.ts";

/**
 * The notes the `track` property of a card links to, as paths: the parents of the track, where
 * they are tracks themselves. A card names its parent by the same property an entry names its
 * track by, and the link is resolved the same way — as Obsidian resolves it in the note itself.
 * Whether a note linked to is a track is for the tree to say ([[nested-tracks]]).
 */
export function trackParents(app: App, path: string, names: PropertyNames): string[] {
	const file = app.vault.getFileByPath(path);
	const cache = file === null ? null : app.metadataCache.getFileCache(file);
	const frontmatter = cache?.frontmatter;
	if (cache === null || cache === undefined || frontmatter === undefined) return [];

	const parents: string[] = [];
	for (const link of frontmatterLinks(cache, frontmatter, names.track)) {
		const target = app.metadataCache.getFirstLinkpathDest(link, path);
		if (target !== null && !parents.includes(target.path)) parents.push(target.path);
	}
	return parents;
}

/**
 * The name a track goes by, read at the moment it is asked: the `track_name` property of its
 * card, or the file name. A card that is gone is named by what its path ends with.
 */
export function trackName(app: App, path: string, names: PropertyNames): string {
	const file = app.vault.getFileByPath(path);
	if (file === null) return path.slice(path.lastIndexOf("/") + 1).replace(/\.md$/, "");

	const frontmatter = app.metadataCache.getFileCache(file)?.frontmatter ?? {};
	return trackDisplayName(frontmatter, file.basename, names.trackName);
}
