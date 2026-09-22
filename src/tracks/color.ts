// Process Tracker — the colour of a track ([[track-selection]]).
// Pure module: no Obsidian API, covered by test/color.test.ts.

import { TRACK_COLOR_KEY } from "../constants.ts";

/**
 * Is this a colour? The browser answers.
 *
 * `CSS.supports` knows the whole colour grammar — `#4CAF50`, `green`, `rgb(76 175 80)`,
 * `color-mix(...)`, `var(--color-red)` — and knows it as this build of Obsidian knows it,
 * so a form the running browser cannot paint is refused here rather than silently ignored
 * later. A hand-written parser would have to be taught the same grammar and would age with
 * it. The check also closes the door on a value that is not a colour at all: what the
 * renderer writes into a style property, a browser reads as CSS.
 *
 * Outside a browser — in the unit tests, and nowhere else — there is no `CSS` to ask, and
 * nothing is a colour. The plugin always runs in one.
 */
export function isCssColor(value: string): boolean {
	if (typeof CSS === "undefined" || typeof CSS.supports !== "function") return false;
	return CSS.supports("color", value);
}

/**
 * A colour as it was written, or `null` for anything else.
 *
 * Quotes are taken off before the check. In a track card the quotes belong to YAML and
 * Obsidian has already removed them, but in a code block nothing has: the block is plain
 * text, and `track_color: "#4CAF50"` is how the reader writes a colour everywhere else in
 * the vault — a hash without quotes starts a YAML comment, so the habit is well earned.
 */
export function readColor(raw: unknown): string | null {
	if (typeof raw !== "string") return null;

	const value = unquote(raw.trim());
	return value !== "" && isCssColor(value) ? value : null;
}

/** The `track_color` property of a track card, or `null` when it is missing or unreadable. */
export function readCardColor(frontmatter: Record<string, unknown>): string | null {
	return readColor(frontmatter[TRACK_COLOR_KEY]);
}

/**
 * The colour of one track in one table: the card first, the code block after it, the theme
 * where neither said anything ([[expectation]] §5).
 *
 * The card wins because it travels: a track carries its colour into every table it appears
 * in, while the block colour is a decision about this table alone and only reaches the
 * tracks that made none of their own.
 */
export function resolveTrackColor(cardColor: string | null, blockColor: string | null): string | null {
	return cardColor ?? blockColor;
}

function unquote(value: string): string {
	const quote = value[0];
	if ((quote !== '"' && quote !== "'") || value.length < 2 || !value.endsWith(quote)) return value;
	return value.slice(1, -1).trim();
}
