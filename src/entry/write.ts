// Process Tracker — writing an entry: creating a note and switching its `done`.
// Adapter module: the only place in the plugin that changes files.

import type { App, CachedMetadata, TFile } from "obsidian";
import { ENTRY_DONE_KEY, TRACK_TEMPLATE_KEY } from "../constants.ts";
import { trackDisplayName } from "../tracks/select.ts";
import { composeEntry, entryFileName, entryPath, normalizeFolder } from "./compose.ts";
import { frontmatterLink } from "./source.ts";

/** How many names are tried before a folder is declared hopeless. */
const NAME_ATTEMPTS = 100;

/**
 * Creates the entry note behind one cell and returns it.
 *
 * Everything the note needs is written before the file appears, in one `create`: Templater
 * renders `<% %>` on the content it finds, so a second pass over the frontmatter would race
 * it for the same file.
 */
export async function createEntry(
	app: App,
	trackPath: string,
	date: string,
	done: boolean,
	folder: string,
): Promise<TFile> {
	const card = app.vault.getFileByPath(trackPath);
	if (card === null) throw new Error(`the track card "${trackPath}" is gone`);

	const cache = app.metadataCache.getFileCache(card);
	const frontmatter = (cache?.frontmatter ?? {}) as Record<string, unknown>;
	const name = entryFileName(trackDisplayName(frontmatter, card.basename), date);
	const path = freePath(app, folder, name);
	const template = await readTemplate(app, card, cache);

	// The link is generated the way this vault writes links, so the settings for wikilinks
	// and for relative paths hold in the note the plugin makes.
	const link = app.fileManager.generateMarkdownLink(card, path);

	await ensureFolder(app, folder);
	return await app.vault.create(path, composeEntry(template, { track: link, date, done }));
}

/** Sets `done` of an existing entry note; the rest of the note is left as it is. */
export async function setEntryDone(app: App, path: string, done: boolean): Promise<void> {
	const file = app.vault.getFileByPath(path);
	if (file === null) throw new Error(`the entry note "${path}" is gone`);

	await app.fileManager.processFrontMatter(file, (frontmatter: Record<string, unknown>) => {
		frontmatter[ENTRY_DONE_KEY] = done;
	});
}

/**
 * The template named by the track card, or `null` when it names none. A template that is
 * named but missing stops the whole thing: a typo in the property would otherwise be paid
 * for with a vault full of default notes.
 */
async function readTemplate(
	app: App,
	card: TFile,
	cache: CachedMetadata | null,
): Promise<string | null> {
	if (cache === null) return null;

	const frontmatter = (cache.frontmatter ?? {}) as Record<string, unknown>;
	const link = frontmatterLink(cache, frontmatter, TRACK_TEMPLATE_KEY);
	if (link === null) return null;

	const file = app.metadataCache.getFirstLinkpathDest(link, card.path);
	if (file === null) throw new Error(`the template "${link}" of "${card.basename}" is gone`);
	return await app.vault.cachedRead(file);
}

/** The first free path: `name.md`, then `name 2.md`, `name 3.md`. */
function freePath(app: App, folder: string, name: string): string {
	for (let attempt = 1; attempt <= NAME_ATTEMPTS; attempt++) {
		const path = entryPath(folder, attempt === 1 ? name : `${name} ${attempt}`);
		if (app.vault.getAbstractFileByPath(path) === null) return path;
	}
	throw new Error(`"${name}" is taken, and so are ${NAME_ATTEMPTS} names after it`);
}

async function ensureFolder(app: App, folder: string): Promise<void> {
	const clean = normalizeFolder(folder);
	if (clean === "" || app.vault.getFolderByPath(clean) !== null) return;
	await app.vault.createFolder(clean);
}
