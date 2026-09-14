// Unit tests for creating evidence and switching `done`.
// The writer imports `obsidian` for types only, so a stub vault is enough here.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { App, TFile } from "obsidian";
import { createEvidence, setEvidenceDone } from "../src/evidence/write.ts";

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
function vaultWith(notes: Note[], folders: string[] = []): Vault {
	const byPath = new Map(notes.map((note) => [note.path, note]));
	const created: { path: string; text: string }[] = [];
	const made: string[] = [];

	const fileOf = (path: string): TFile | null => {
		const note = byPath.get(path);
		if (note === undefined) return null;
		const name = path.slice(path.lastIndexOf("/") + 1);
		return { path, basename: name.replace(/\.md$/, "") } as TFile;
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
				byPath.set(path, { path });
				return { path } as TFile;
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

describe("createEvidence", () => {
	it("writes a note named after the track and the day", async () => {
		const vault = vaultWith([card]);
		const file = await createEvidence(vault.app, "cleaning.md", "2026-09-13", false, "");
		assert.equal(file.path, "cleaning 2026-09-13.md");
		assert.deepEqual(vault.created, [
			{
				path: "cleaning 2026-09-13.md",
				text: '---\ntrack: "[[cleaning]]"\ndate: 2026-09-13\ndone: false\n---\n',
			},
		]);
	});

	it("checks the box when the click asked for it", async () => {
		const vault = vaultWith([card]);
		await createEvidence(vault.app, "cleaning.md", "2026-09-13", true, "");
		assert.match(vault.created[0].text, /^done: true$/m);
	});

	it("names the note by the track_name of the card", async () => {
		const vault = vaultWith([
			{ path: "tracks/card.md", frontmatter: { track_name: "уборка" } },
		]);
		const file = await createEvidence(vault.app, "tracks/card.md", "2026-09-13", false, "");
		assert.equal(file.path, "уборка 2026-09-13.md");
	});

	it("writes into the folder of the settings and makes it when it is missing", async () => {
		const vault = vaultWith([card]);
		const file = await createEvidence(vault.app, "cleaning.md", "2026-09-13", false, "Журнал");
		assert.equal(file.path, "Журнал/cleaning 2026-09-13.md");
		assert.deepEqual(vault.folders, ["Журнал"]);
	});

	it("leaves an existing folder alone", async () => {
		const vault = vaultWith([card], ["Журнал"]);
		await createEvidence(vault.app, "cleaning.md", "2026-09-13", false, "Журнал");
		assert.deepEqual(vault.folders, []);
	});

	it("takes the next free name when the first one is taken", async () => {
		const vault = vaultWith([card, { path: "cleaning 2026-09-13.md" }]);
		const file = await createEvidence(vault.app, "cleaning.md", "2026-09-13", false, "");
		assert.equal(file.path, "cleaning 2026-09-13 2.md");
	});

	it("builds the note on the template of the card", async () => {
		const vault = vaultWith([
			{
				path: "cleaning.md",
				frontmatter: { template: "[[evidence]]" },
				frontmatterLinks: [{ key: "template", link: "evidence" }],
			},
			{ path: "evidence.md", content: "---\ntrack:\nmood:\n---\n\n<% tp.file.cursor() %>\n" },
		]);
		await createEvidence(vault.app, "cleaning.md", "2026-09-13", false, "");
		assert.equal(
			vault.created[0].text,
			'---\ntrack: "[[cleaning]]"\nmood:\ndate: 2026-09-13\ndone: false\n---\n\n<% tp.file.cursor() %>\n',
		);
	});

	it("writes nothing when the template of the card is gone", async () => {
		const vault = vaultWith([
			{ path: "cleaning.md", frontmatter: { template: "[[gone]]" } },
		]);
		await assert.rejects(
			() => createEvidence(vault.app, "cleaning.md", "2026-09-13", false, ""),
			/template "gone"/,
		);
		assert.deepEqual(vault.created, []);
	});

	it("writes nothing when the track card is gone", async () => {
		const vault = vaultWith([]);
		await assert.rejects(
			() => createEvidence(vault.app, "cleaning.md", "2026-09-13", false, ""),
			/track card "cleaning.md"/,
		);
		assert.deepEqual(vault.created, []);
	});
});

describe("setEvidenceDone", () => {
	it("checks the box of an existing note", async () => {
		const vault = vaultWith([{ path: "e.md", frontmatter: { done: false } }]);
		await setEvidenceDone(vault.app, "e.md", true);
		assert.equal(vault.notes.get("e.md")?.frontmatter?.done, true);
	});

	it("takes the mark back without touching the rest", async () => {
		const vault = vaultWith([{ path: "e.md", frontmatter: { done: true, mood: "ясно" } }]);
		await setEvidenceDone(vault.app, "e.md", false);
		assert.deepEqual(vault.notes.get("e.md")?.frontmatter, { done: false, mood: "ясно" });
	});

	it("says so when the note is gone", async () => {
		const vault = vaultWith([]);
		await assert.rejects(() => setEvidenceDone(vault.app, "e.md", true), /evidence note "e.md"/);
	});
});
