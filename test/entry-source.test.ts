// Unit tests for reading entries out of the metadata cache.
// The adapter imports `obsidian` for types only, so a stub app is enough here.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { App, TFile } from "obsidian";
import { collectEntries, entryAt, toEntry } from "../src/entry/source.ts";

interface Note {
	path: string;
	frontmatter?: Record<string, unknown>;
	frontmatterLinks?: { key: string; link: string }[];
	/** No cache at all: Obsidian answers `null` for a file it has not read yet. */
	uncached?: boolean;
}

/** A vault of notes, where a link resolves to the note whose file name matches it. */
function appWith(notes: Note[]): App {
	const files = notes.map((note) => ({ path: note.path }) as TFile);
	const byPath = new Map(notes.map((note) => [note.path, note]));

	return {
		vault: {
			getMarkdownFiles: () => files,
			getFileByPath: (path: string) => files.find((file) => file.path === path) ?? null,
		},
		metadataCache: {
			getFileCache: (file: TFile) => {
				const note = byPath.get(file.path);
				if (note === undefined || note.uncached === true) return null;
				return { frontmatter: note.frontmatter, frontmatterLinks: note.frontmatterLinks };
			},
			getFirstLinkpathDest: (link: string) =>
				files.find((file) => file.path === `${link}.md` || file.path === link) ?? null,
		},
	} as unknown as App;
}

const card: Note = { path: "cleaning.md", frontmatter: { tags: "process_tracker" } };

function readOne(note: Note): ReturnType<typeof toEntry> {
	const app = appWith([card, note]);
	return toEntry(app, { path: note.path } as TFile);
}

describe("toEntry", () => {
	it("reads a note that names a track and a date", () => {
		const entry = readOne({
			path: "cleaning 2026-09-11.md",
			frontmatter: { track: "[[cleaning]]", date: "2026-09-11", done: true },
		});
		assert.deepEqual(entry, {
			path: "cleaning 2026-09-11.md",
			trackPath: "cleaning.md",
			date: "2026-09-11",
			done: true,
		});
	});

	it("reads a draft as a draft", () => {
		const entry = readOne({
			path: "e.md",
			frontmatter: { track: "[[cleaning]]", date: "2026-09-11", done: false },
		});
		assert.equal(entry?.done, false);
	});

	it("treats an entry without a done property as a draft", () => {
		const entry = readOne({
			path: "e.md",
			frontmatter: { track: "[[cleaning]]", date: "2026-09-11" },
		});
		assert.equal(entry?.done, false);
	});

	it("prefers the link Obsidian parsed itself", () => {
		const entry = readOne({
			path: "e.md",
			frontmatter: { track: "written by hand", date: "2026-09-11" },
			frontmatterLinks: [{ key: "track", link: "cleaning" }],
		});
		assert.equal(entry?.trackPath, "cleaning.md");
	});

	it("reads a link out of a list property", () => {
		const entry = readOne({
			path: "e.md",
			frontmatter: { track: ["[[cleaning]]"], date: "2026-09-11" },
			frontmatterLinks: [{ key: "track.0", link: "cleaning" }],
		});
		assert.equal(entry?.trackPath, "cleaning.md");
	});

	it("is not an entry without a date", () => {
		assert.equal(readOne({ path: "e.md", frontmatter: { track: "[[cleaning]]" } }), null);
	});

	it("is not an entry without a track", () => {
		assert.equal(readOne({ path: "e.md", frontmatter: { date: "2026-09-11" } }), null);
	});

	it("is not an entry when the track link leads nowhere", () => {
		assert.equal(
			readOne({ path: "e.md", frontmatter: { track: "[[gone]]", date: "2026-09-11" } }),
			null,
		);
	});

	it("is not an entry without frontmatter", () => {
		assert.equal(readOne({ path: "e.md" }), null);
	});

	it("survives a file the cache has not read", () => {
		assert.equal(readOne({ path: "e.md", uncached: true }), null);
	});
});

describe("collectEntries", () => {
	it("keeps the entries of the vault and nothing else", () => {
		const app = appWith([
			card,
			{ path: "water.md", frontmatter: { tags: "process_tracker" } },
			{ path: "e1.md", frontmatter: { track: "[[cleaning]]", date: "2026-09-11", done: true } },
			{ path: "e2.md", frontmatter: { track: "[[water]]", date: "2026-09-06", done: false } },
			{ path: "readme.md", frontmatter: { date: "2026-09-06" } },
			{ path: "plain.md" },
		]);
		assert.deepEqual(
			collectEntries(app).map((entry) => [entry.path, entry.trackPath, entry.done]),
			[
				["e1.md", "cleaning.md", true],
				["e2.md", "water.md", false],
			],
		);
	});
});

describe("entryAt", () => {
	const note: Note = {
		path: "cleaning 2026-09-11.md",
		frontmatter: { track: "[[cleaning]]", date: "2026-09-11", done: true },
	};

	it("reads the note at a path", () => {
		assert.equal(entryAt(appWith([card, note]), note.path)?.done, true);
	});

	it("answers nothing for a path that leads nowhere", () => {
		assert.equal(entryAt(appWith([card, note]), "gone.md"), null);
	});

	it("answers nothing for a note that is no entry", () => {
		assert.equal(entryAt(appWith([card, note]), card.path), null);
	});
});
