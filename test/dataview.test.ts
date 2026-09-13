// Unit tests for the `track` filter on top of the Dataview API.
// The adapter imports `obsidian` for types only, so a stub app is enough here.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { App } from "obsidian";
import type { TrackCard } from "../src/model/types.ts";
import { applyTrackFilter, getDataviewApi } from "../src/tracks/dataview.ts";

function card(basename: string, folder = ""): TrackCard {
	const path = `${folder}${basename}.md`;
	return {
		path,
		basename,
		name: basename,
		tags: ["process_tracker"],
		frontmatter: {},
		ctime: 0,
		mtime: 0,
	};
}

interface ApiStub {
	pages?: (source: string, originFile?: string) => Iterable<unknown>;
	page?: (path: string) => unknown;
	evaluate?: (expression: string, context: unknown) => { successful: boolean; value?: unknown; error?: unknown };
	value?: { isTruthy(value: unknown): boolean };
}

/** An app whose Dataview plugin answers the way the stub says. */
function appWith(api: ApiStub | null): App {
	const stub: ApiStub | null =
		api === null
			? null
			: {
					pages: () => [],
					page: (path: string) => ({ file: { path } }),
					evaluate: () => ({ successful: true, value: true }),
					...api,
				};
	return { plugins: { plugins: { dataview: stub === null ? undefined : { api: stub } } } } as unknown as App;
}

const tracks = [card("cleaning", "home/"), card("water", "health/"), card("movement", "health/")];

describe("getDataviewApi", () => {
	it("returns the api of the plugin", () => {
		assert.notEqual(getDataviewApi(appWith({})), null);
	});

	it("returns null when the plugin is missing", () => {
		assert.equal(getDataviewApi(appWith(null)), null);
	});

	it("returns null when the api lacks the calls the plugin makes", () => {
		const app = { plugins: { plugins: { dataview: { api: { pages: () => [] } } } } } as unknown as App;
		assert.equal(getDataviewApi(app), null);
	});
});

describe("applyTrackFilter", () => {
	it("keeps every row when the filter is not set", () => {
		const warnings: string[] = [];
		assert.deepEqual(applyTrackFilter(appWith({}), tracks, null, "note.md", warnings), tracks);
		assert.deepEqual(warnings, []);
	});

	it("keeps the rows Dataview answers with", () => {
		const warnings: string[] = [];
		const app = appWith({ pages: () => [{ file: { path: "health/water.md" } }] });
		const rows = applyTrackFilter(app, tracks, 'FROM "health"', "note.md", warnings);
		assert.deepEqual(
			rows.map((row) => row.basename),
			["water"],
		);
		assert.deepEqual(warnings, []);
	});

	it("passes the source and the note of the code block to Dataview", () => {
		const calls: string[][] = [];
		const app = appWith({
			pages: (source, originFile) => {
				calls.push([source, originFile ?? ""]);
				return [];
			},
		});
		applyTrackFilter(app, tracks, 'FROM "health"', "journal/note.md", []);
		assert.deepEqual(calls, [['("health")', "journal/note.md"]]);
	});

	it("evaluates a condition on every remaining card", () => {
		const warnings: string[] = [];
		const app = appWith({
			pages: () => [{ file: { path: "health/water.md" } }, { file: { path: "health/movement.md" } }],
			page: (path) => ({ file: { path }, priority: path.includes("water") ? 3 : 1 }),
			evaluate: (expression, context) => {
				assert.equal(expression, "(priority > 2)");
				const priority = (context as { priority: number }).priority;
				return { successful: true, value: priority > 2 };
			},
		});
		const rows = applyTrackFilter(app, tracks, 'FROM "health" WHERE priority > 2', "note.md", warnings);
		assert.deepEqual(
			rows.map((row) => row.basename),
			["water"],
		);
		assert.deepEqual(warnings, []);
	});

	it("reads truthiness the way Dataview does", () => {
		const app = appWith({
			evaluate: (_expression, context) => ({
				successful: true,
				value: (context as { file: { path: string } }).file.path.includes("water") ? "yes" : "",
			}),
			value: { isTruthy: (value: unknown) => String(value).length > 0 },
		});
		const rows = applyTrackFilter(app, tracks, "WHERE note", "note.md", []);
		assert.deepEqual(
			rows.map((row) => row.basename),
			["water"],
		);
	});

	it("drops a card Dataview has not indexed", () => {
		const app = appWith({ page: (path) => (path.includes("water") ? { file: { path } } : undefined) });
		const rows = applyTrackFilter(app, tracks, "WHERE done", "note.md", []);
		assert.deepEqual(
			rows.map((row) => row.basename),
			["water"],
		);
	});

	it("keeps every row and warns when Dataview is not installed", () => {
		const warnings: string[] = [];
		const rows = applyTrackFilter(appWith(null), tracks, 'FROM "health"', "note.md", warnings);
		assert.deepEqual(rows, tracks);
		assert.equal(warnings.length, 1);
		assert.match(warnings[0], /Dataview is not available/);
	});

	it("keeps every row and warns when the source cannot be read", () => {
		const warnings: string[] = [];
		const app = appWith({
			pages: () => {
				throw new Error("expected a source");
			},
		});
		const rows = applyTrackFilter(app, tracks, "FROM ((", "note.md", warnings);
		assert.deepEqual(rows, tracks);
		assert.equal(warnings.length, 1);
		assert.match(warnings[0], /expected a source/);
	});

	it("keeps every row and warns when the condition is broken", () => {
		const warnings: string[] = [];
		const app = appWith({
			evaluate: () => ({ successful: false, error: "Failed to parse expression" }),
		});
		const rows = applyTrackFilter(app, tracks, "WHERE >", "note.md", warnings);
		assert.deepEqual(rows, tracks);
		assert.equal(warnings.length, 1);
		assert.match(warnings[0], /Failed to parse expression/);
	});

	it("drops the cards the condition failed on when it works elsewhere", () => {
		const warnings: string[] = [];
		const app = appWith({
			evaluate: (_expression, context) =>
				(context as { file: { path: string } }).file.path.includes("water")
					? { successful: false, error: "no such field" }
					: { successful: true, value: true },
		});
		const rows = applyTrackFilter(app, tracks, "WHERE done", "note.md", warnings);
		assert.deepEqual(
			rows.map((row) => row.basename),
			["cleaning", "movement"],
		);
		assert.equal(warnings.length, 1);
		assert.match(warnings[0], /no such field/);
	});

	it("keeps every row and warns when the filter names nothing", () => {
		const warnings: string[] = [];
		const rows = applyTrackFilter(appWith({}), tracks, "FROM", "note.md", warnings);
		assert.deepEqual(rows, tracks);
		assert.match(warnings[0], /names nothing to filter by/);
	});

	it("never touches the array it is given", () => {
		const app = appWith({ pages: () => [] });
		const original = [...tracks];
		applyTrackFilter(app, tracks, 'FROM "health"', "note.md", []);
		assert.deepEqual(tracks, original);
	});
});
