// Process Tracker — DOM rendering of the tracker table.
// Knows nothing about the vault: everything it needs comes as data.

import { setTooltip } from "obsidian";
import { formatDay, formatMonthYear, splitMonthYear } from "../dates/grid.ts";
import type { CellRef } from "../entry/refresh.ts";
import { cellState, findEntries } from "../entry/state.ts";
import type { EntryIndex } from "../entry/state.ts";
import type { CellState, DateColumn, Entry, TrackCard } from "../model/types.ts";

/**
 * Note of a draft, shown on hover. The preview beside it shows the note itself; this says
 * in one word what the note is still missing ([[expectation]] §8).
 */
const DRAFT_TOOLTIP = "Not done";

/** Class of the scrolling container; the wheel handler of the plugin looks for it by name. */
export const SCROLL_CLASS = "process-tracker__scroll";

/**
 * How the paths of a day are written into one attribute: one per line. A vault path holds
 * no newline, so the list splits back exactly as it was written.
 */
const PATH_SEPARATOR = "\n";

/** Everything the table needs; assembled by the plugin entry point. */
export interface TrackerView {
	tracks: TrackCard[];
	columns: DateColumn[];
	/** Entries of the vault; decide the state of every cell. */
	entries: EntryIndex;
	/** Only used by the empty state, to name the tag the user has configured. */
	trackTag: string;
	/** Only used by the empty state, to tell an empty vault from an empty filter. */
	trackFilter: string | null;
}

/** Elements the render child needs to follow the scrolling table. */
export interface TrackerElements {
	/** Both tables together: the pointer works over the whole thing. */
	frame: HTMLElement;
	/** The part that scrolls — the date columns and nothing else. */
	scroll: HTMLElement;
	captionCell: HTMLElement;
}

/**
 * Renders the whole block: the tracker, or an empty-state message. Returns the elements
 * the render child works with, or `null` when there is no table.
 *
 * The tracker is drawn as two tables side by side: the track names on the left, the date
 * columns in a scrolling frame on the right. One table with a pinned first column looks
 * the same until it scrolls — and then the date cells travel underneath the names, where
 * only an opaque colour can hide them. A theme is free to take that colour away, and a
 * theme built on transparency has none to give. Two tables have nothing to hide: the
 * columns live in their own zone and never reach the names ([[rendering]]).
 *
 * Both halves stay real `<table>` elements, so a theme dresses the tracker the way it
 * dresses every other table of the vault. What the two tables cannot agree on by
 * themselves — the height of a row — the render child measures and sets for both.
 */
export function renderTracker(container: HTMLElement, view: TrackerView): TrackerElements | null {
	const root = container.createDiv({ cls: "process-tracker" });
	if (view.tracks.length === 0) {
		renderEmptyState(root, view.trackTag, view.trackFilter);
		return null;
	}

	const frame = root.createDiv({ cls: "process-tracker__frame" });

	const names = frame.createEl("table", {
		cls: "process-tracker__table process-tracker__names",
	});
	const captionCell = renderNamesHead(names, view.columns[0]);
	renderNamesBody(names, view.tracks);

	const scroll = frame.createDiv({ cls: SCROLL_CLASS });
	const dates = scroll.createEl("table", {
		cls: "process-tracker__table process-tracker__dates",
	});
	renderColumnWidths(dates, view.columns.length);
	renderDatesHead(dates, view.columns);
	renderDatesBody(dates, view);

	return { frame, scroll, captionCell };
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
	if (dateColumns === 0) return;

	table.createEl("colgroup").createEl("col", {
		cls: "process-tracker__col-date",
		attr: { span: dateColumns },
	});
}

/**
 * The corner caption: the month and the year of the columns in sight. It stands above
 * the track names, out of the scrolling frame, so nothing can carry it away — the
 * render child only rewrites its text as the columns go by.
 */
function renderNamesHead(table: HTMLTableElement, first: DateColumn | undefined): HTMLElement {
	const cell = table
		.createEl("thead")
		.createEl("tr")
		.createEl("th", { cls: "process-tracker__period" });
	renderPeriodCaption(cell, first === undefined ? "" : formatMonthYear(first));
	return cell;
}

function renderNamesBody(table: HTMLTableElement, tracks: TrackCard[]): void {
	const body = table.createEl("tbody");
	for (const track of tracks) renderTrackCell(body.createEl("tr"), track);
}

/**
 * The head of the scrolling table carries no grid: captions stand above the columns,
 * and a caption is the day alone — the month and the year belong to the corner.
 */
function renderDatesHead(table: HTMLTableElement, columns: DateColumn[]): void {
	const row = table.createEl("thead").createEl("tr");
	for (const column of columns) {
		const cell = row.createEl("th", {
			cls: "process-tracker__date",
			attr: { "data-date": column.iso },
		});
		// The number sits in an element of its own, so it can be centred on the cell
		// whatever alignment and padding a theme gives the cell ([[rendering]]).
		cell.createSpan({ cls: "process-tracker__day", text: formatDay(column) });
		if (column.isToday) cell.addClass("is-today");
	}
}

function renderDatesBody(table: HTMLTableElement, view: TrackerView): void {
	const body = table.createEl("tbody");
	for (const track of view.tracks) {
		const row = body.createEl("tr");
		for (const column of view.columns) {
			renderCheckCell(row, track, column, findEntries(view.entries, track.path, column.iso));
		}
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
 * The box shows what the vault says: checked when every entry of the day is done, unchecked
 * for a draft or an empty day. The state also goes on the cell as `data-state`, where the
 * stylesheet picks the draft up and where the click handling reads it back — together with
 * `data-track`, `data-date` and `data-entry`, which address the cell and name the notes
 * behind it, one path per line.
 *
 * A day with several entries looks like any other day: there is no mark for it, because
 * several entries are a state of affairs and not an error ([[expectation]] §7).
 *
 * The click itself is handled once for the whole table, by `CellPointerChild`.
 */
function renderCheckCell(
	row: HTMLTableRowElement,
	track: TrackCard,
	column: DateColumn,
	entries: readonly Entry[],
): void {
	const state = cellState(entries);
	const cell = row.createEl("td", {
		cls: "process-tracker__cell",
		attr: { "data-date": column.iso, "data-track": track.path, "data-state": state },
	});
	if (column.isToday) cell.addClass("is-today");
	writeEntryPaths(cell, entries.map((entry) => entry.path));

	// The checkbox is wrapped for the same reason as the day number: the wrapper is ours,
	// so centring it never has to argue with the way a theme styles a checkbox.
	const box = cell.createDiv({ cls: "process-tracker__mark" }).createEl("input", {
		cls: "task-list-item-checkbox",
		type: "checkbox",
	});
	box.checked = state === "done";
	setTooltip(cell, draftTooltip(state, entries.length));
}

/**
 * Repaints one cell after its day changed. The table is not rebuilt: a rebuild would throw
 * away the scroll position of the table the reader is working in.
 */
export function paintCell(cell: HTMLElement, state: CellState, paths: readonly string[]): void {
	cell.setAttr("data-state", state);
	writeEntryPaths(cell, paths);
	setTooltip(cell, draftTooltip(state, paths.length));

	const box = cell.querySelector<HTMLInputElement>('input[type="checkbox"]');
	if (box !== null) box.checked = state === "done";
}

/**
 * The note of a draft, shown on hover beside the preview of its entry. A day with several
 * entries says nothing here: its popup lists them with a box each, and a tooltip over that
 * popup would only be in the way ([[expectation]] §8).
 */
function draftTooltip(state: CellState, count: number): string {
	return state === "draft" && count === 1 ? DRAFT_TOOLTIP : "";
}

/** The notes behind a cell, in the order the popup lists them. */
export function entryPathsOf(cell: HTMLElement): string[] {
	const written = cell.dataset.entry ?? "";
	return written === "" ? [] : written.split(PATH_SEPARATOR);
}

function writeEntryPaths(cell: HTMLElement, paths: readonly string[]): void {
	if (paths.length === 0) cell.removeAttribute("data-entry");
	else cell.setAttr("data-entry", paths.join(PATH_SEPARATOR));
}

/** The cells of this table that show the note at this path right now. */
export function cellsShowing(root: HTMLElement, path: string): HTMLElement[] {
	return cellsOf(root, "[data-entry]").filter((cell) => entryPathsOf(cell).includes(path));
}

/** The cell of one day, or `null`: the day may lie outside the columns, the track outside the rows. */
export function cellOf(root: HTMLElement, day: CellRef): HTMLElement | null {
	const selector = `[data-track=${quote(day.trackPath)}][data-date=${quote(day.date)}]`;
	return cellsOf(root, selector)[0] ?? null;
}

function cellsOf(root: HTMLElement, attributes: string): HTMLElement[] {
	return Array.from(
		root.querySelectorAll<HTMLElement>(`.process-tracker__cell${attributes}`),
	);
}

/** The day a cell stands for, read back from the attributes the renderer wrote. */
export function readCellRef(cell: HTMLElement): CellRef | null {
	const trackPath = cell.dataset.track ?? "";
	const date = cell.dataset.date ?? "";
	return trackPath === "" || date === "" ? null : { trackPath, date };
}

/** A value as a CSS string, so a path with a quote in it cannot break the selector. */
function quote(value: string): string {
	return `"${value.replace(/["\\]/g, "\\$&")}"`;
}

/**
 * With a `track` filter in the block the tag is rarely what is missing, so the
 * message names the filter instead of asking for a tag that is probably there.
 */
function renderEmptyState(root: HTMLElement, trackTag: string, trackFilter: string | null): void {
	const text =
		trackFilter === null
			? `No track cards found. Tag a note with #${trackTag} to add a track.`
			: `No track card matches "track: ${trackFilter}".`;
	root.createDiv({ cls: "process-tracker__empty", text });
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
