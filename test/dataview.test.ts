// Unit tests for the `track` filter on top of the Dataview API.
// The adapter imports `obsidian` for types only, so a stub app is enough here.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { App } from "obsidian";
import type { TrackCard } from "../src/model/types.ts";
import {
	applyDueFilter,
	applyTrackFilter,
	dataviewState,
	getDataviewApi,
	readPeriod,
} from "../src/tracks/dataview.ts";
import type { ClosedDays } from "../src/tracks/due.ts";

function card(basename: string, folder = "", frontmatter: Record<string, unknown> = {}): TrackCard {
	const path = `${folder}${basename}.md`;
	return {
		path,
		basename,
		name: basename,
		color: null,
		entries: null,
		tags: ["process_tracker"],
		frontmatter,
		ctime: 0,
		mtime: 0,
	};
}

interface ApiStub {
	pages?: (source: string, originFile?: string) => Iterable<unknown>;
	page?: (path: string) => unknown;
	evaluate?: (expression: string, context: unknown) => { successful: boolean; value?: unknown; error?: unknown };
	value?: { isTruthy(value: unknown): boolean };
	index?: { initialized?: boolean };
	duration?: (text: string) => unknown;
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

describe("dataviewState", () => {
	it("is ready once the index has read every note", () => {
		assert.equal(dataviewState(appWith({ index: { initialized: true } })), "ready");
	});

	it("is indexing while the index is still reading the vault", () => {
		assert.equal(dataviewState(appWith({ index: { initialized: false } })), "indexing");
	});

	it("takes an api that says nothing of its index for a ready one", () => {
		assert.equal(dataviewState(appWith({})), "ready");
	});

	it("is indexing while an enabled plugin has not loaded its api yet", () => {
		const app = { plugins: { plugins: {}, enabledPlugins: new Set(["dataview"]) } } as unknown as App;
		assert.equal(dataviewState(app), "indexing");
	});

	it("is absent when the plugin is not enabled", () => {
		const app = { plugins: { plugins: {}, enabledPlugins: new Set(["templater-obsidian"]) } } as unknown as App;
		assert.equal(dataviewState(app), "absent");
		assert.equal(dataviewState(appWith(null)), "absent");
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

/**
 * A duration as Dataview hands it over, for the few forms the tests write: `3 days`, `2 weeks`,
 * `6 months`, `1 year`, `3 hours`. The grammar is Dataview's own business; what is tested here is
 * what the plugin does with its answer.
 */
function duration(text: string): unknown {
	const match = /^(\d+(?:\.\d+)?) (day|week|month|year|hour)s?$/.exec(text);
	return match === null ? null : { [`${match[2]}s`]: Number(match[1]) };
}

/** The api of an app whose Dataview answers the way the stub says. */
function apiOf(stub: ApiStub): NonNullable<ReturnType<typeof getDataviewApi>> {
	const api = getDataviewApi(appWith(stub));
	assert.ok(api !== null);
	return api;
}

describe("readPeriod", () => {
	const api = apiOf({ duration });

	it("reads a period the way Dataview reads a duration", () => {
		assert.deepEqual(readPeriod(api, "3 days"), { months: 0, days: 3 });
		assert.deepEqual(readPeriod(api, "2 weeks"), { months: 0, days: 14 });
		assert.deepEqual(readPeriod(api, "6 months"), { months: 6, days: 0 });
		assert.deepEqual(readPeriod(api, "1 year"), { months: 12, days: 0 });
	});

	it("turns down what Dataview does not read as a duration", () => {
		assert.equal(readPeriod(api, "soon"), null);
		assert.equal(readPeriod(api, ""), null);
	});

	it("turns down a number with no unit, and anything that is not a text", () => {
		assert.equal(readPeriod(api, 7), null);
		assert.equal(readPeriod(api, ["3 days"]), null);
		assert.equal(readPeriod(api, null), null);
	});

	it("turns down hours: a table of days cannot count them", () => {
		assert.equal(readPeriod(api, "3 hours"), null);
	});

	it("turns down everything when Dataview cannot read durations", () => {
		assert.equal(readPeriod(apiOf({}), "3 days"), null);
	});

	it("takes a failure of Dataview for no period", () => {
		const broken = apiOf({
			duration: () => {
				throw new Error("no implementation of dur");
			},
		});
		assert.equal(readPeriod(broken, "3 days"), null);
	});
});

describe("applyDueFilter", () => {
	const TODAY = "2026-11-12";

	/** The closed days of the tracks, as the test names them: path -> the last closed day. */
	function lastClosed(last: Record<string, string>): ClosedDays {
		return {
			closed: (trackPath, date) => last[trackPath] === date,
			last: (trackPath) => last[trackPath] ?? null,
		};
	}

	const bedding = card("bedding", "", { recurrence: "1 week" });
	const fridge = card("fridge", "", { recurrence: "6 months" });
	const plants = card("plants", "", { recurrence: "3 days" });
	const regular = [bedding, fridge, plants];

	function names(rows: TrackCard[]): string[] {
		return rows.map((row) => row.basename);
	}

	it("keeps the tracks whose day has come and the tracks never closed", () => {
		const warnings: string[] = [];
		const days = lastClosed({ "bedding.md": "2026-11-05", "fridge.md": "2026-11-01" });
		const rows = applyDueFilter(appWith({ duration }), regular, "recurrence", days, TODAY, warnings);
		assert.deepEqual(names(rows), ["bedding", "plants"]);
		assert.deepEqual(warnings, []);
	});

	it("keeps a track closed today", () => {
		const days = lastClosed({ "bedding.md": TODAY, "fridge.md": TODAY, "plants.md": "2026-11-11" });
		const rows = applyDueFilter(appWith({ duration }), regular, "recurrence", days, TODAY, []);
		assert.deepEqual(names(rows), ["bedding", "fridge"]);
	});

	it("hides the tracks with no period and says nothing of them", () => {
		const warnings: string[] = [];
		const tracks = [card("cleaning"), bedding, card("water", "", { recurrence: null }), card("tea", "", { recurrence: " " })];
		const rows = applyDueFilter(appWith({ duration }), tracks, "recurrence", lastClosed({}), TODAY, warnings);
		assert.deepEqual(names(rows), ["bedding"]);
		assert.deepEqual(warnings, []);
	});

	it("hides a track whose period cannot be read, in silence too", () => {
		const warnings: string[] = [];
		const tracks = [
			card("windows", "", { recurrence: "soon" }),
			card("oven", "", { recurrence: "3 hours" }),
			card("filter", "", { recurrence: 7 }),
			bedding,
		];
		const rows = applyDueFilter(appWith({ duration }), tracks, "recurrence", lastClosed({}), TODAY, warnings);
		assert.deepEqual(names(rows), ["bedding"]);
		assert.deepEqual(warnings, []);
	});

	it("reads the period under the name the settings give the property", () => {
		const tracks = [card("bedding", "", { every: "1 week" }), card("fridge", "", { recurrence: "1 week" })];
		const rows = applyDueFilter(appWith({ duration }), tracks, "every", lastClosed({}), TODAY, []);
		assert.deepEqual(names(rows), ["bedding"]);
	});

	it("keeps every row and warns when Dataview is not there to read the periods", () => {
		for (const app of [appWith(null), appWith({})]) {
			const warnings: string[] = [];
			const days = lastClosed({ "bedding.md": "2026-11-11" });
			assert.deepEqual(applyDueFilter(app, regular, "recurrence", days, TODAY, warnings), regular);
			assert.equal(warnings.length, 1);
			assert.match(warnings[0], /Dataview is not available/);
		}
	});

	it("never touches the array it is given", () => {
		const original = [...regular];
		applyDueFilter(appWith({ duration }), regular, "recurrence", lastClosed({ "bedding.md": "2026-11-11" }), TODAY, []);
		assert.deepEqual(regular, original);
	});
});
