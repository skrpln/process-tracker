// Unit tests for reading entries out of the metadata cache.
// The adapter imports `obsidian` for types only, so a stub app is enough here.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { App, TFile } from "obsidian";
import { scanOutline } from "../src/entry/journal.ts";
import {
	collectEntries,
	collectJournalEntries,
	entryAt,
	journalsOf,
	outlineOf,
	toEntry,
} from "../src/entry/source.ts";

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
			mark: null,
			record: null,
		});
	});

	it("reads the mark of an entry", () => {
		const entry = readOne({
			path: "e.md",
			frontmatter: { track: "[[cleaning]]", date: "2026-09-11", done: true, mark: "🔥 great" },
		});
		assert.equal(entry?.mark, "🔥");
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
		assert.equal(entryAt(appWith([card, note]), note.path, card.path)?.done, true);
	});

	it("answers nothing for a path that leads nowhere", () => {
		assert.equal(entryAt(appWith([card, note]), "gone.md", card.path), null);
	});

	it("answers nothing for a note that is no entry", () => {
		assert.equal(entryAt(appWith([card, note]), card.path, card.path), null);
	});
});

interface Journal {
	path: string;
	frontmatter?: Record<string, unknown>;
	frontmatterLinks?: { key: string; link: string }[];
	/** The text; its headings and boxes are handed out the way the metadata cache lists them. */
	text?: string;
}

/** A vault whose cache lists headings and boxes, built from the text of each note. */
function journalApp(notes: Journal[]): App {
	const files = notes.map((note) => {
		const name = note.path.slice(note.path.lastIndexOf("/") + 1);
		return { path: note.path, extension: name.slice(name.lastIndexOf(".") + 1) } as TFile;
	});
	const byPath = new Map(notes.map((note) => [note.path, note]));
	const position = (line: number, end = line) => ({ start: { line }, end: { line: end } });

	return {
		vault: {
			getMarkdownFiles: () => files,
			getFileByPath: (path: string) => files.find((file) => file.path === path) ?? null,
		},
		metadataCache: {
			getFileCache: (file: TFile) => {
				const note = byPath.get(file.path);
				if (note === undefined) return null;
				const outline = scanOutline(note.text ?? "");
				return {
					frontmatter: note.frontmatter,
					frontmatterLinks: note.frontmatterLinks,
					headings: outline.headings.map((heading) => ({
						level: heading.level,
						heading: heading.text,
						position: position(heading.line, heading.end),
					})),
					listItems: outline.tasks.map((task) => ({ task: task.mark, position: position(task.line) })),
				};
			},
			getFirstLinkpathDest: (link: string) =>
				files.find((file) => file.path === `${link}.md` || file.path === link) ?? null,
		},
	} as unknown as App;
}

describe("journal entries", () => {
	const own: Journal = {
		path: "cleaning.md",
		frontmatter: { tags: "process_tracker" },
		text: "steps\n# Journal\n## 2026-09-28 👽\n- [x] done\n### 🔥\n## 2026-09-27\ntext",
	};
	const linked: Journal = {
		path: "reading.md",
		frontmatter: { journal: "[[Reading log]]" },
		frontmatterLinks: [{ key: "journal", link: "Reading log" }],
		text: "## 2026-09-01\n- [x] done",
	};
	const log: Journal = { path: "Reading log.md", text: "# 2026\n## 2026-09-20\n- [ ] done" };

	it("reads the records of a card that keeps its own journal", () => {
		const entries = collectJournalEntries(journalApp([own]), ["cleaning.md"]);
		assert.deepEqual(entries, [
			{
				path: "cleaning.md",
				trackPath: "cleaning.md",
				date: "2026-09-28",
				done: true,
				mark: "🔥",
				record: { nth: 0, heading: "2026-09-28 👽", line: 2 },
			},
			{
				path: "cleaning.md",
				trackPath: "cleaning.md",
				date: "2026-09-27",
				done: false,
				mark: null,
				record: { nth: 0, heading: "2026-09-27", line: 5 },
			},
		]);
	});

	it("reads the card and the journal it links to, both for the track of the card", () => {
		const entries = collectJournalEntries(journalApp([linked, log]), ["reading.md"]);
		assert.deepEqual(
			entries.map((entry) => [entry.path, entry.trackPath, entry.date, entry.done]),
			[
				["reading.md", "reading.md", "2026-09-01", true],
				["Reading log.md", "reading.md", "2026-09-20", false],
			],
		);
	});

	it("names the notes a track keeps records in", () => {
		const app = journalApp([own, linked, log]);
		assert.deepEqual(journalsOf(app, "reading.md").map((file) => file.path), [
			"reading.md",
			"Reading log.md",
		]);
		assert.deepEqual(journalsOf(app, "cleaning.md").map((file) => file.path), ["cleaning.md"]);
		assert.deepEqual(journalsOf(app, "gone.md"), []);
	});

	it("asks only the card while its journal is not there yet", () => {
		assert.deepEqual(journalsOf(journalApp([linked]), "reading.md").map((file) => file.path), [
			"reading.md",
		]);
	});

	it("does not take a linked file that is not a note for a journal", () => {
		const card: Journal = {
			path: "card.md",
			frontmatterLinks: [{ key: "journal", link: "scan.pdf" }],
			frontmatter: { journal: "[[scan.pdf]]" },
		};
		const app = journalApp([card, { path: "scan.pdf" }]);
		assert.deepEqual(journalsOf(app, "card.md").map((file) => file.path), ["card.md"]);
	});

	it("reads one record at its address, for the track of the cell", () => {
		const app = journalApp([linked, log]);
		const entry = entryAt(app, "Reading log.md#2026-09-20#0", "reading.md");
		assert.equal(entry?.trackPath, "reading.md");
		assert.equal(entry?.record?.line, 1);
		assert.equal(entryAt(app, "Reading log.md#2026-09-20#1", "reading.md"), null);
		assert.equal(entryAt(app, "gone.md#2026-09-20#0", "reading.md"), null);
	});

	it("gives the same outline the text gives", () => {
		const text = "# Journal\n## 2026-09-28\n- [x] done";
		const app = journalApp([{ path: "j.md", text }]);
		const cache = app.metadataCache.getFileCache({ path: "j.md" } as TFile);
		const outline = outlineOf(cache as never);
		const scanned = scanOutline(text);
		assert.deepEqual(outline.headings, scanned.headings);
		assert.deepEqual(outline.tasks, scanned.tasks);
	});
});
