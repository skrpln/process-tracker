// Process Tracker — DOM rendering of the tracker table.
// Knows nothing about the vault: everything it needs comes as data and callbacks.
// Docs: [[rendering]]

import type { DateColumn, TrackCard } from "../model/types.ts";

/** Everything the table needs; assembled by the plugin entry point. */
export interface TrackerView {
	tracks: TrackCard[];
	columns: DateColumn[];
	/** Only used by the empty state, to name the tag the user has configured. */
	trackTag: string;
}

/** Renders the whole block: table, or an empty-state message. */
export function renderTracker(container: HTMLElement, view: TrackerView): void {
	const root = container.createDiv({ cls: "process-tracker" });
	if (view.tracks.length === 0) {
		renderEmptyState(root, view.trackTag);
		return;
	}

	const scroll = root.createDiv({ cls: "process-tracker__scroll" });
	const table = scroll.createEl("table", { cls: "process-tracker__table" });
	renderHead(table, view.columns);
	renderBody(table, view.tracks, view.columns);
}

function renderHead(table: HTMLTableElement, columns: DateColumn[]): void {
	const row = table.createEl("thead").createEl("tr");
	row.createEl("th", { cls: "process-tracker__corner" });
	for (const column of columns) {
		const cell = row.createEl("th", {
			cls: "process-tracker__date",
			text: String(column.day),
			attr: { "data-date": column.iso },
		});
		if (column.isToday) cell.addClass("is-today");
	}
}

function renderBody(table: HTMLTableElement, tracks: TrackCard[], columns: DateColumn[]): void {
	const body = table.createEl("tbody");
	for (const track of tracks) {
		const row = body.createEl("tr");
		renderTrackCell(row, track);
		for (const column of columns) renderCheckCell(row, track, column);
	}
}

/**
 * The link is a plain `a.internal-link`: Obsidian's own handler opens it, gives
 * the right cursor and will provide the hover preview in Phase 5. Adding our own
 * click listener on top of it opened the note twice.
 */
function renderTrackCell(row: HTMLTableRowElement, track: TrackCard): void {
	const cell = row.createEl("th", { cls: "process-tracker__track" });
	cell.createEl("a", {
		cls: "internal-link",
		text: track.name,
		attr: { href: track.path, "data-href": track.path },
	});
}

/**
 * Phase 1 renders an empty, inert checkbox: cell state and clicks arrive in Phase 4.
 * The click is swallowed so the box cannot show a state the vault does not have.
 */
function renderCheckCell(row: HTMLTableRowElement, track: TrackCard, column: DateColumn): void {
	const cell = row.createEl("td", {
		cls: "process-tracker__cell",
		attr: { "data-date": column.iso, "data-track": track.path },
	});
	if (column.isToday) cell.addClass("is-today");

	const box = cell.createEl("input", {
		cls: "task-list-item-checkbox",
		type: "checkbox",
	});
	box.addEventListener("click", (event: MouseEvent) => event.preventDefault());
}

function renderEmptyState(root: HTMLElement, trackTag: string): void {
	root.createDiv({
		cls: "process-tracker__empty",
		text: `No track cards found. Tag a note with #${trackTag} to add a track.`,
	});
}

/** Parse problems and unsupported parameters, shown under the table. */
export function renderWarnings(container: HTMLElement, warnings: string[]): void {
	if (warnings.length === 0) return;
	const list = container.createEl("ul", { cls: "process-tracker__warnings" });
	for (const warning of warnings) list.createEl("li", { text: warning });
}

/** Last resort: a rendering failure must not break the whole note. */
export function renderError(container: HTMLElement, message: string): void {
	container.createDiv({ cls: "process-tracker__error", text: `Process Tracker: ${message}` });
}
