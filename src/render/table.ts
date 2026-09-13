// Process Tracker — DOM rendering of the tracker table.
// Knows nothing about the vault: everything it needs comes as data.

import { formatDay, formatMonthYear, splitMonthYear } from "../dates/grid.ts";
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
	captionCell: HTMLElement;
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
	const captionCell = renderHead(table, view.columns);
	renderBody(table, view.tracks, view.columns);
	return { scroll, captionCell };
}

/**
 * Column widths live in a `colgroup`. They only hold if the table itself has an
 * explicit width: with `width: max-content` the browser sizes the table by its
 * content instead, and the captions quietly become a floor under the column width.
 * The stylesheet computes that width from the number of date columns, which only
 * the renderer knows.
 */
function renderColumnWidths(table: HTMLTableElement, dateColumns: number): void {
	table.style.setProperty("--pt-date-columns", String(dateColumns));
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
 * The head carries no grid: captions stand above the table. A date caption is the
 * day alone, so the month and the year live in the corner above the pinned column;
 * the render child keeps that caption in step with scrolling.
 */
function renderHead(table: HTMLTableElement, columns: DateColumn[]): HTMLElement {
	const row = table.createEl("thead").createEl("tr");

	const first = columns[0];
	const captionCell = row.createEl("th", { cls: "process-tracker__period" });
	renderPeriodCaption(captionCell, first === undefined ? "" : formatMonthYear(first));

	for (const column of columns) {
		const cell = row.createEl("th", {
			cls: "process-tracker__date",
			text: formatDay(column),
			attr: { "data-date": column.iso },
		});
		if (column.isToday) cell.addClass("is-today");
	}

	return captionCell;
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

/**
 * Writes the corner caption as two parts, so the year can be set in the face of the
 * day captions while the month keeps the heading face. Used by the render child too,
 * which rewrites the caption as the table scrolls.
 */
export function renderPeriodCaption(cell: HTMLElement, label: string): void {
	cell.empty();
	if (label === "") return;

	const { month, year } = splitMonthYear(label);
	cell.createSpan({ cls: "process-tracker__period-month", text: month });
	if (year !== "") cell.createSpan({ cls: "process-tracker__period-year", text: year });
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
