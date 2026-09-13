// Process Tracker — the Dataview adapter behind the `track` parameter.
// The only module that talks to the Dataview plugin; logic lives in tracks/query.ts.

import type { App } from "obsidian";
import type { TrackCard } from "../model/types.ts";
import { splitTrackQuery } from "./query.ts";

/** Result of `DataviewApi.evaluate`: a success carries a value, a failure an error. */
interface EvaluationResult {
	successful: boolean;
	value?: unknown;
	error?: unknown;
}

/**
 * The slice of the Dataview API the plugin uses. Dataview ships its types in a
 * separate package; declaring the three members we call keeps the plugin free of
 * a build dependency on it.
 */
interface DataviewApi {
	pages(source: string, originFile?: string): Iterable<unknown>;
	page(path: string, originFile?: string): unknown;
	evaluate(expression: string, context: unknown, originFile?: string): EvaluationResult;
	value?: { isTruthy(value: unknown): boolean };
}

interface AppWithPlugins extends App {
	plugins?: { plugins?: Record<string, { api?: unknown } | undefined> };
}

/** The Dataview API, or `null` when the plugin is missing, disabled or still loading. */
export function getDataviewApi(app: App): DataviewApi | null {
	const api = (app as AppWithPlugins).plugins?.plugins?.dataview?.api;
	if (api === null || typeof api !== "object") return null;
	const candidate = api as Partial<DataviewApi>;
	if (typeof candidate.pages !== "function") return null;
	if (typeof candidate.page !== "function") return null;
	if (typeof candidate.evaluate !== "function") return null;
	return candidate as DataviewApi;
}

/**
 * Narrows the rows by the `track` filter of the code block.
 *
 * The cards arrive already filtered by the plugin tag, so the source expression is
 * asked of the index and the condition is evaluated only on what is left — a handful
 * of pages instead of the whole vault. A filter that cannot be read never empties the
 * table: the rows stay, and the reason shows up in `warnings`.
 */
export function applyTrackFilter(
	app: App,
	tracks: TrackCard[],
	track: string | null,
	originFile: string,
	warnings: string[],
): TrackCard[] {
	if (track === null) return tracks;

	const query = splitTrackQuery(track);
	if (query.source === null && query.condition === null) {
		warnings.push(`"track: ${track}" names nothing to filter by, it is ignored.`);
		return tracks;
	}

	const api = getDataviewApi(app);
	if (api === null) {
		warnings.push('Dataview is not available, so "track" is ignored: every track card is shown.');
		return tracks;
	}

	let rows = tracks;
	if (query.source !== null) {
		const paths = queryPaths(api, query.source, originFile, warnings);
		if (paths !== null) rows = rows.filter((card) => paths.has(card.path));
	}
	if (query.condition !== null) {
		rows = filterByCondition(api, rows, query.condition, originFile, warnings);
	}
	return rows;
}

/** Paths Dataview answers with, or `null` when the source expression is unreadable. */
function queryPaths(
	api: DataviewApi,
	source: string,
	originFile: string,
	warnings: string[],
): Set<string> | null {
	try {
		const paths = new Set<string>();
		for (const page of api.pages(source, originFile)) {
			const path = pagePath(page);
			if (path !== null) paths.add(path);
		}
		return paths;
	} catch (error) {
		warnings.push(`Dataview could not read "${source}": ${describe(error)}. It is ignored.`);
		return null;
	}
}

/**
 * Keeps the cards whose page satisfies the condition. A card whose page Dataview
 * has not indexed drops out. A condition that fails on every single card is a broken
 * condition, not an empty result: the rows come back untouched, with a warning.
 */
function filterByCondition(
	api: DataviewApi,
	tracks: TrackCard[],
	condition: string,
	originFile: string,
	warnings: string[],
): TrackCard[] {
	let failures = 0;
	let firstError: string | null = null;

	const rows = tracks.filter((card) => {
		const page = api.page(card.path, originFile);
		if (page === undefined || page === null) return false;

		const result = api.evaluate(condition, page, originFile);
		if (result.successful) return isTruthy(api, result.value);

		failures++;
		if (firstError === null) firstError = describe(result.error);
		return false;
	});

	if (firstError === null) return rows;
	if (failures === tracks.length) {
		warnings.push(`Dataview could not read "${condition}": ${firstError}. It is ignored.`);
		return tracks;
	}
	warnings.push(`"${condition}" could not be read on every card: ${firstError}.`);
	return rows;
}

function pagePath(page: unknown): string | null {
	if (page === null || typeof page !== "object") return null;
	const file = (page as { file?: unknown }).file;
	if (file === null || typeof file !== "object") return null;
	const path = (file as { path?: unknown }).path;
	return typeof path === "string" ? path : null;
}

/**
 * Truthiness the way Dataview means it — an empty string, an empty list and a zero
 * are all false. Its own helper decides whenever the API exposes one.
 */
function isTruthy(api: DataviewApi, value: unknown): boolean {
	if (typeof api.value?.isTruthy === "function") return api.value.isTruthy(value);
	if (Array.isArray(value)) return value.length > 0;
	return Boolean(value);
}

function describe(error: unknown): string {
	if (error instanceof Error) return error.message;
	if (typeof error === "string") return error;
	return String(error);
}
