// Unit tests for creating an entry and switching `done`.
// The writer imports `obsidian` for types only, so a stub vault is enough here.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { App, TFile } from "obsidian";
import { DEFAULT_PROPERTY_NAMES } from "../src/constants.ts";
import {
	createEntry as createWith,
	createRecord as createRecordWith,
	setEntryDone as setDoneWith,
} from "../src/entry/write.ts";
import type { PropertyNames } from "../src/model/types.ts";

/** The names the plugin writes until the settings rename them. */
const names: PropertyNames = DEFAULT_PROPERTY_NAMES;

/** The clock of the tests: 10 November 2026, 14:30. */
const NOW = new Date(2026, 10, 10, 14, 30);

const createEntry = (app: App, track: string, date: string, done: boolean, folder: string) =>
	createWith(app, track, date, done, folder, names, NOW);
const createRecord = (
	app: App,
	track: string,
	date: string,
	done: boolean,
	fill: (template: string, date: string) => string,
) => createRecordWith(app, track, date, done, fill, names);
const setEntryDone = (app: App, id: string, done: boolean, day = "2026-11-10") =>
	setDoneWith(app, id, done, day, names, NOW);

interface Note {
	path: string;
	frontmatter?: Record<string, unknown>;
	frontmatterLinks?: { key: string; link: string }[];
	content?: string;
}

interface Vault {
	app: App;
	created: { path: string; text: string }[];
	folders: string[];
	notes: Map<string, Note>;
}

/** A vault where a link resolves to the note whose file name matches it. */
function vaultWith(notes: Note[], folders: string[] = [], newFileFolder = "/"): Vault {
	const byPath = new Map(notes.map((note) => [note.path, note]));
	const created: { path: string; text: string }[] = [];
	const made: string[] = [];

	const fileOf = (path: string): TFile | null => {
		const note = byPath.get(path);
		if (note === undefined) return null;
		const name = path.slice(path.lastIndexOf("/") + 1);
		const extension = name.includes(".") ? name.slice(name.lastIndexOf(".") + 1) : "";
		return { path, basename: name.replace(/\.md$/, ""), extension } as TFile;
	};

	const app = {
		vault: {
			getFileByPath: fileOf,
			getAbstractFileByPath: fileOf,
			getFolderByPath: (path: string) =>
				folders.includes(path) || made.includes(path) ? { path } : null,
			createFolder: async (path: string) => {
				made.push(path);
			},
			cachedRead: async (file: TFile) => byPath.get(file.path)?.content ?? "",
			create: async (path: string, text: string) => {
				created.push({ path, text });
				byPath.set(path, { path, content: text });
				return { path } as TFile;
			},
			process: async (file: TFile, fn: (text: string) => string) => {
				const note = byPath.get(file.path);
				if (note === undefined) throw new Error("no such note");
				note.content = fn(note.content ?? "");
				return note.content;
			},
		},
		metadataCache: {
			getFileCache: (file: TFile) => {
				const note = byPath.get(file.path);
				if (note === undefined) return null;
				return { frontmatter: note.frontmatter, frontmatterLinks: note.frontmatterLinks };
			},
			getFirstLinkpathDest: (link: string) => fileOf(`${link}.md`) ?? fileOf(link),
		},
		fileManager: {
			generateMarkdownLink: (file: TFile) => `[[${file.basename}]]`,
			getNewFileParent: () => ({ path: newFileFolder }),
			processFrontMatter: async (file: TFile, fn: (frontmatter: Record<string, unknown>) => void) => {
				const note = byPath.get(file.path);
				if (note === undefined) throw new Error("no such note");
				note.frontmatter = note.frontmatter ?? {};
				fn(note.frontmatter);
			},
		},
	} as unknown as App;

	return { app, created, folders: made, notes: byPath };
}

const card: Note = { path: "cleaning.md", frontmatter: { tags: "process_tracker" } };

describe("createEntry", () => {
	it("writes a note named after the track and the day", async () => {
		const vault = vaultWith([card]);
		const file = await createEntry(vault.app, "cleaning.md", "2026-09-13", false, "");
		assert.equal(file.path, "cleaning 2026-09-13.md");
		assert.deepEqual(vault.created, [
			{
				path: "cleaning 2026-09-13.md",
				text: '---\ntrack: "[[cleaning]]"\ncreated: 2026-09-13\ndone: false\n---\n',
			},
		]);
	});

	it("checks the box when the click asked for it, closing the note on the day of the cell", async () => {
		const vault = vaultWith([card]);
		await createEntry(vault.app, "cleaning.md", "2026-09-13", true, "");
		assert.equal(
			vault.created[0].text,
			'---\ntrack: "[[cleaning]]"\ncreated: 2026-09-13\ndone: true\nclosed: 2026-09-13 14:30\n---\n',
		);
	});

	it("writes the properties under the names the settings give them", async () => {
		const vault = vaultWith([{ path: "cleaning.md", frontmatter: { title: "Уборка" } }]);
		const renamed = { ...names, track: "project", created: "made", trackName: "title" };
		const file = await createWith(vault.app, "cleaning.md", "2026-09-13", false, "", renamed, NOW);
		assert.equal(file.path, "Уборка 2026-09-13.md");
		assert.equal(vault.created[0].text, '---\nproject: "[[cleaning]]"\nmade: 2026-09-13\ndone: false\n---\n');
	});

	it("names the note by the track_name of the card", async () => {
		const vault = vaultWith([
			{ path: "tracks/card.md", frontmatter: { track_name: "уборка" } },
		]);
		const file = await createEntry(vault.app, "tracks/card.md", "2026-09-13", false, "");
		assert.equal(file.path, "уборка 2026-09-13.md");
	});

	it("writes into the folder of the settings and makes it when it is missing", async () => {
		const vault = vaultWith([card]);
		const file = await createEntry(vault.app, "cleaning.md", "2026-09-13", false, "Журнал");
		assert.equal(file.path, "Журнал/cleaning 2026-09-13.md");
		assert.deepEqual(vault.folders, ["Журнал"]);
	});

	it("leaves an existing folder alone", async () => {
		const vault = vaultWith([card], ["Журнал"]);
		await createEntry(vault.app, "cleaning.md", "2026-09-13", false, "Журнал");
		assert.deepEqual(vault.folders, []);
	});

	it("takes the next free name when the first one is taken", async () => {
		const vault = vaultWith([card, { path: "cleaning 2026-09-13.md" }]);
		const file = await createEntry(vault.app, "cleaning.md", "2026-09-13", false, "");
		assert.equal(file.path, "cleaning 2026-09-13 2.md");
	});

	it("builds the note on the template of the card", async () => {
		const vault = vaultWith([
			{
				path: "cleaning.md",
				frontmatter: { template: "[[entry]]" },
				frontmatterLinks: [{ key: "template", link: "entry" }],
			},
			{ path: "entry.md", content: "---\ntrack:\nmood:\n---\n\n<% tp.file.cursor() %>\n" },
		]);
		await createEntry(vault.app, "cleaning.md", "2026-09-13", false, "");
		assert.equal(
			vault.created[0].text,
			'---\ntrack: "[[cleaning]]"\nmood:\ncreated: 2026-09-13\ndone: false\n---\n\n<% tp.file.cursor() %>\n',
		);
	});

	it("writes nothing when the template of the card is gone", async () => {
		const vault = vaultWith([
			{ path: "cleaning.md", frontmatter: { template: "[[gone]]" } },
		]);
		await assert.rejects(
			() => createEntry(vault.app, "cleaning.md", "2026-09-13", false, ""),
			/template "gone"/,
		);
		assert.deepEqual(vault.created, []);
	});

	it("writes nothing when the track card is gone", async () => {
		const vault = vaultWith([]);
		await assert.rejects(
			() => createEntry(vault.app, "cleaning.md", "2026-09-13", false, ""),
			/track card "cleaning.md"/,
		);
		assert.deepEqual(vault.created, []);
	});
});

describe("setEntryDone", () => {
	it("closes a note on the day of the click, at the time of the click", async () => {
		const vault = vaultWith([{ path: "e.md", frontmatter: { created: "2026-11-05", done: false } }]);
		const days = await setEntryDone(vault.app, "e.md", true, "2026-11-09");
		assert.deepEqual(vault.notes.get("e.md")?.frontmatter, {
			created: "2026-11-05",
			done: true,
			closed: "2026-11-09 14:30",
		});
		assert.deepEqual(days, { created: "2026-11-05", closed: "2026-11-09" });
	});

	it("moves the closing of a note closed on another day to the day of the click", async () => {
		const vault = vaultWith([
			{ path: "e.md", frontmatter: { created: "2026-11-05", done: true, closed: "2026-11-10 09:00" } },
		]);
		await setEntryDone(vault.app, "e.md", true, "2026-11-05");
		assert.equal(vault.notes.get("e.md")?.frontmatter?.closed, "2026-11-05 14:30");
	});

	it("opens a note and takes its closed away, leaving the rest", async () => {
		const vault = vaultWith([
			{
				path: "e.md",
				frontmatter: { created: "2026-11-05", done: true, closed: "2026-11-10 09:00", status: "done" },
			},
		]);
		const days = await setEntryDone(vault.app, "e.md", false);
		assert.deepEqual(vault.notes.get("e.md")?.frontmatter, {
			created: "2026-11-05",
			done: false,
			status: "done",
		});
		assert.deepEqual(days, { created: "2026-11-05", closed: null });
	});

	it("switches only done of a note of an earlier version", async () => {
		const vault = vaultWith([{ path: "e.md", frontmatter: { date: "2026-09-11", done: false, mood: "ясно" } }]);
		const days = await setEntryDone(vault.app, "e.md", true, "2026-09-11");
		assert.deepEqual(vault.notes.get("e.md")?.frontmatter, { date: "2026-09-11", done: true, mood: "ясно" });
		assert.deepEqual(days, { created: "2026-09-11", closed: "2026-09-11" });
	});

	it("writes under the names the settings give", async () => {
		const vault = vaultWith([{ path: "e.md", frontmatter: { made: "2026-11-05", finished: false } }]);
		const renamed = { ...names, done: "finished", created: "made", closed: "ended" };
		await setDoneWith(vault.app, "e.md", true, "2026-11-06", renamed, NOW);
		assert.deepEqual(vault.notes.get("e.md")?.frontmatter, {
			made: "2026-11-05",
			finished: true,
			ended: "2026-11-06 14:30",
		});
	});

	it("says so when the note is gone", async () => {
		const vault = vaultWith([]);
		await assert.rejects(() => setEntryDone(vault.app, "e.md", true), /entry note "e.md"/);
	});
});

/** Fills the placeholders the way the plugin does, as far as these tests need. */
const fill = (template: string, date: string) => template.replace(/{{date}}/g, date);

describe("createRecord", () => {
	const journalCard = (extra: Partial<Note> = {}): Note => ({
		path: "cleaning.md",
		frontmatter: { tags: "process_tracker" },
		content: "---\ntags: process_tracker\n---\nsteps\n",
		...extra,
	});

	it("writes the record into the card, opening # Journal", async () => {
		const vault = vaultWith([journalCard()]);
		const entry = await createRecord(vault.app, "cleaning.md", "2026-09-28", false, fill);
		assert.equal(
			vault.notes.get("cleaning.md")?.content,
			"---\ntags: process_tracker\n---\nsteps\n\n# Journal\n\n## 2026-09-28\n- [ ] done\n\n---\n",
		);
		assert.deepEqual(entry, {
			path: "cleaning.md",
			trackPath: "cleaning.md",
			created: "2026-09-28",
			closed: null,
			mark: null,
			record: { nth: 0, heading: "2026-09-28", line: 7 },
		});
	});

	it("writes the body of the template without its properties and commands, filled in", async () => {
		const vault = vaultWith([
			journalCard({
				frontmatter: { template: "[[entry]]" },
				frontmatterLinks: [{ key: "template", link: "entry" }],
				content: "# Journal\n",
			}),
			{
				path: "entry.md",
				content:
					'---\nmood:\n---\n<%* await tp.file.move("x/" + tp.file.title) %>\n' +
					"Day {{date}}, <% tp.date.now() %>\n",
			},
		]);
		await createRecord(vault.app, "cleaning.md", "2026-09-28", true, fill);
		assert.equal(
			vault.notes.get("cleaning.md")?.content,
			"# Journal\n\n## 2026-09-28\n- [x] done\nDay 2026-09-28, \n\n---\n",
		);
	});

	it("writes the heading and the box alone when the template is gone", async () => {
		const vault = vaultWith([
			journalCard({ frontmatter: { template: "[[gone]]" }, content: "# Journal\n" }),
		]);
		await createRecord(vault.app, "cleaning.md", "2026-09-28", false, fill);
		assert.equal(
			vault.notes.get("cleaning.md")?.content,
			"# Journal\n\n## 2026-09-28\n- [ ] done\n\n---\n",
		);
	});

	it("writes into the journal the card links to", async () => {
		const vault = vaultWith([
			journalCard({
				frontmatter: { journal: "[[Cleaning log]]" },
				frontmatterLinks: [{ key: "journal", link: "Cleaning log" }],
			}),
			{ path: "Cleaning log.md", content: "# 2026\n## 2026-09-20\n" },
		]);
		const entry = await createRecord(vault.app, "cleaning.md", "2026-09-28", false, fill);
		assert.equal(
			vault.notes.get("Cleaning log.md")?.content,
			"# 2026\n\n## 2026-09-28\n- [ ] done\n\n---\n\n## 2026-09-20\n",
		);
		assert.equal(entry.path, "Cleaning log.md");
		assert.equal(entry.trackPath, "cleaning.md");
	});

	it("makes the journal the card links to when there is none yet", async () => {
		const vault = vaultWith(
			[
				journalCard({
					frontmatter: { journal: "[[Cleaning log]]" },
					frontmatterLinks: [{ key: "journal", link: "Cleaning log" }],
				}),
			],
			[],
			"Logs",
		);
		const entry = await createRecord(vault.app, "cleaning.md", "2026-09-28", true, fill);
		assert.deepEqual(vault.created, [
			{ path: "Logs/Cleaning log.md", text: "# Journal\n\n## 2026-09-28\n- [x] done\n\n---\n" },
		]);
		assert.equal(entry.path, "Logs/Cleaning log.md");
	});

	it("makes a journal linked with a folder at that path from the root", async () => {
		const vault = vaultWith(
			[
				journalCard({
					frontmatter: { journal: "[[Logs/Cleaning]]" },
					frontmatterLinks: [{ key: "journal", link: "Logs/Cleaning" }],
				}),
			],
			[],
			"Elsewhere",
		);
		await createRecord(vault.app, "cleaning.md", "2026-09-28", false, fill);
		assert.equal(vault.created[0].path, "Logs/Cleaning.md");
		assert.deepEqual(vault.folders, ["Logs"]);
	});
});

describe("setEntryDone of a record", () => {
	it("switches the first box of the record at its address", async () => {
		const vault = vaultWith([
			{ path: "log.md", content: "## 2026-09-28\n- [ ] done\n## 2026-09-28\n- [ ] done\n" },
		]);
		const days = await setEntryDone(vault.app, "log.md#2026-09-28#1", true);
		assert.deepEqual(days, { created: "2026-09-28", closed: "2026-09-28" });
		assert.equal(
			vault.notes.get("log.md")?.content,
			"## 2026-09-28\n- [ ] done\n## 2026-09-28\n- [x] done\n",
		);
	});

	it("says so when the record is gone", async () => {
		const vault = vaultWith([{ path: "log.md", content: "" }]);
		await assert.rejects(
			() => setEntryDone(vault.app, "log.md#2026-09-28#0", true),
			/no longer in the journal/,
		);
	});
});
