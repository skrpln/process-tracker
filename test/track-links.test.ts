// Unit tests for reading the links between track cards out of the metadata cache.
// The adapter imports `obsidian` for types only, so a stub app is enough here.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { App, TFile } from "obsidian";
import { DEFAULT_PROPERTY_NAMES } from "../src/constants.ts";
import { trackName, trackParents } from "../src/tracks/links.ts";

interface Note {
	path: string;
	frontmatter?: Record<string, unknown>;
	frontmatterLinks?: { key: string; link: string }[];
}

/** A vault of notes, where a link resolves to the note whose file name matches it. */
function appWith(notes: Note[]): App {
	const files = notes.map((note) => {
		const name = note.path.slice(note.path.lastIndexOf("/") + 1);
		return { path: note.path, basename: name.replace(/\.md$/, "") } as TFile;
	});
	const byPath = new Map(notes.map((note) => [note.path, note]));

	return {
		vault: {
			getFileByPath: (path: string) => files.find((file) => file.path === path) ?? null,
		},
		metadataCache: {
			getFileCache: (file: TFile) => {
				const note = byPath.get(file.path);
				if (note === undefined) return null;
				return { frontmatter: note.frontmatter, frontmatterLinks: note.frontmatterLinks };
			},
			getFirstLinkpathDest: (link: string) =>
				files.find((file) => file.path === `${link}.md` || file.path.endsWith(`/${link}.md`)) ??
				null,
		},
	} as unknown as App;
}

const home: Note = { path: "Spheres/home.md", frontmatter: { tags: "process_tracker" } };
const garden: Note = { path: "Spheres/garden.md", frontmatter: { tags: "process_tracker" } };

describe("trackParents", () => {
	it("reads the one link of the track property", () => {
		const app = appWith([home, { path: "harmony.md", frontmatter: { track: "[[home]]" } }]);
		assert.deepEqual(trackParents(app, "harmony.md", DEFAULT_PROPERTY_NAMES), ["Spheres/home.md"]);
	});

	it("reads a list of parents, as Obsidian lists the links of a property", () => {
		const app = appWith([
			home,
			garden,
			{
				path: "watering.md",
				frontmatter: { track: ["[[home]]", "[[garden]]"] },
				frontmatterLinks: [
					{ key: "track.0", link: "home" },
					{ key: "track.1", link: "garden" },
				],
			},
		]);
		assert.deepEqual(trackParents(app, "watering.md", DEFAULT_PROPERTY_NAMES), [
			"Spheres/home.md",
			"Spheres/garden.md",
		]);
	});

	it("names a parent linked to twice once", () => {
		const app = appWith([
			home,
			{ path: "harmony.md", frontmatter: { track: ["[[home]]", "[[home|Home]]"] } },
		]);
		assert.deepEqual(trackParents(app, "harmony.md", DEFAULT_PROPERTY_NAMES), ["Spheres/home.md"]);
	});

	it("leaves out a link that leads nowhere", () => {
		const app = appWith([{ path: "harmony.md", frontmatter: { track: "[[nowhere]]" } }]);
		assert.deepEqual(trackParents(app, "harmony.md", DEFAULT_PROPERTY_NAMES), []);
	});

	it("answers with nothing for a card with no track property, or no card at all", () => {
		const app = appWith([home, { path: "bare.md" }]);
		assert.deepEqual(trackParents(app, "Spheres/home.md", DEFAULT_PROPERTY_NAMES), []);
		assert.deepEqual(trackParents(app, "bare.md", DEFAULT_PROPERTY_NAMES), []);
		assert.deepEqual(trackParents(app, "gone.md", DEFAULT_PROPERTY_NAMES), []);
	});

	it("reads the property under the name the settings give it", () => {
		const app = appWith([home, { path: "harmony.md", frontmatter: { area: "[[home]]" } }]);
		const names = { ...DEFAULT_PROPERTY_NAMES, track: "area" };
		assert.deepEqual(trackParents(app, "harmony.md", names), ["Spheres/home.md"]);
	});
});

describe("trackName", () => {
	it("is the track_name of the card", () => {
		const app = appWith([{ path: "Tasks/dusting.md", frontmatter: { track_name: "Dust the floor" } }]);
		assert.equal(trackName(app, "Tasks/dusting.md", DEFAULT_PROPERTY_NAMES), "Dust the floor");
	});

	it("is the file name where the card names none", () => {
		const app = appWith([{ path: "Tasks/dusting.md", frontmatter: {} }, { path: "bare.md" }]);
		assert.equal(trackName(app, "Tasks/dusting.md", DEFAULT_PROPERTY_NAMES), "dusting");
		assert.equal(trackName(app, "bare.md", DEFAULT_PROPERTY_NAMES), "bare");
	});

	it("is what the path ends with when the card is gone", () => {
		assert.equal(trackName(appWith([]), "Tasks/dusting.md", DEFAULT_PROPERTY_NAMES), "dusting");
	});
});
