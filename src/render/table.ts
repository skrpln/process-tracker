// Process Tracker — DOM rendering of the tracker table.
// Knows nothing about the vault: everything it needs comes as data.

import { formatDayMonth, spansMultipleYears } from "../dates/grid.ts";
import type { DateColumn, TrackCard } from "../model/types.ts";

/** Everything the table needs; assembled by the plugin entry point. */
export interface TrackerView {
	tracks: TrackCard[];
	columns: DateColumn[];
	/** Only used by the empty state, to name the tag the user has configured. */
	trackTag: string;
}

/** Elements the render child needs to follow the scrolling table. */
export interface TrackerElements {
	scroll: HTMLElement;
	yearCell: HTMLElement;
}

/**
 * Renders the whole block: table, or an empty-state message. Returns the elements
 * the render child works with, or `null` when there is no table.
 */
export function renderTracker(container: HTMLElement, view: TrackerView): TrackerElements | null {
	const root = container.createDiv({ cls: "process-tracker" });
	if (view.tracks.length === 0) {
		renderEmptyState(root, view.trackTag);
		return null;
	}

	const scroll = root.createDiv({ cls: "process-tracker__scroll" });
	const table = scroll.createEl("table", { cls: "process-tracker__table" });
	renderColumnWidths(table, view.columns.length);
	const yearCell = renderHead(table, view.columns);
	renderBody(table, view.tracks, view.columns);
	return { scroll, yearCell };
}

/**
 * Column widths live in a `colgroup`: with `table-layout: fixed` they apply to the
 * whole table, so a long track name cannot stretch its column.
 */
function renderColumnWidths(table: HTMLTableElement, dateColumns: number): void {
	const group = table.createEl("colgroup");
	group.createEl("col", { cls: "process-tracker__col-track" });
	if (dateColumns > 0) {
		group.createEl("col", {
			cls: "process-tracker__col-date",
			attr: { span: dateColumns },
		});
	}
}

/**
 * The head carries no grid: captions stand above the table. A date caption is one
 * line, `dd/mm`, and the corner shows a year only when the table covers more than
 * one; the render child keeps that year in step with scrolling.
 */
function renderHead(table: HTMLTableElement, columns: DateColumn[]): HTMLElement {
	const row = table.createEl("thead").createEl("tr");

	const yearCell = row.createEl("th", {
		cls: "process-tracker__year",
		text: spansMultipleYears(columns) ? String(columns[0].year) : "",
	});

	for (const column of columns) {
		const cell = row.createEl("th", {
			cls: "process-tracker__date",
			text: formatDayMonth(column),
			attr: { "data-date": column.iso },
		});
		if (column.isToday) cell.addClass("is-today");
	}

	return yearCell;
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
