// Process Tracker — the `track` filter, split into the two halves Dataview takes apart.
// Pure module: no Obsidian API, covered by test/query.test.ts.

/** The `track` value, split the way the Dataview API asks for it. */
export interface TrackQuery {
	/**
	 * Source expression — folders, tags, links and their combinations. Dataview
	 * answers it from its index. `null` — the filter names no source.
	 */
	source: string | null;
	/**
	 * Condition over the fields of a page, evaluated page by page. `null` — the
	 * filter names no condition.
	 */
	condition: string | null;
}

type Clause = "from" | "where";

const KEYWORDS: Clause[] = ["from", "where"];

/**
 * Splits the `track` value into a source expression and a condition, the way a
 * Dataview query separates `FROM` from `WHERE`.
 *
 * Text before the first keyword counts as a source: `track: "folder"` and
 * `track: FROM "folder"` mean the same thing. Repeated clauses are joined with
 * `and`, every part wrapped in parentheses, so `or` inside one part cannot leak
 * out and loosen the others.
 */
export function splitTrackQuery(track: string | null): TrackQuery {
	if (track === null) return { source: null, condition: null };

	const clauses = collectClauses(track);
	return {
		source: join(clauses.from),
		condition: join(clauses.where),
	};
}

/**
 * Walks the value once, cutting it at the keywords. Quotes and brackets are
 * counted, so `FROM "where I live"`, `#wherever` and `[[from here]]` keep their
 * keywords to themselves.
 */
function collectClauses(track: string): Record<Clause, string[]> {
	const clauses: Record<Clause, string[]> = { from: [], where: [] };
	let clause: Clause = "from";
	let start = 0;
	let quote: string | null = null;
	let depth = 0;

	const cut = (end: number): void => {
		const part = track.slice(start, end).trim();
		if (part !== "") clauses[clause].push(part);
	};

	for (let index = 0; index < track.length; index++) {
		const char = track[index];

		if (quote !== null) {
			if (char === "\\") index++;
			else if (char === quote) quote = null;
			continue;
		}
		if (char === '"' || char === "'") {
			quote = char;
			continue;
		}
		if (char === "(" || char === "[" || char === "{") {
			depth++;
			continue;
		}
		if (char === ")" || char === "]" || char === "}") {
			depth = Math.max(0, depth - 1);
			continue;
		}
		if (depth > 0) continue;

		const keyword = keywordAt(track, index);
		if (keyword === null) continue;

		cut(index);
		clause = keyword;
		index += keyword.length - 1;
		start = index + 1;
	}
	cut(track.length);

	return clauses;
}

/** A keyword only counts as one when it stands as a whole word. */
function keywordAt(track: string, index: number): Clause | null {
	for (const keyword of KEYWORDS) {
		if (track.slice(index, index + keyword.length).toLowerCase() !== keyword) continue;
		if (index > 0 && isWordChar(track[index - 1])) continue;
		const after = track[index + keyword.length];
		if (after !== undefined && isWordChar(after)) continue;
		return keyword;
	}
	return null;
}

function isWordChar(char: string): boolean {
	return /[\p{L}\p{N}_#/-]/u.test(char);
}

function join(parts: string[]): string | null {
	if (parts.length === 0) return null;
	return parts.map((part) => `(${part})`).join(" and ");
}
