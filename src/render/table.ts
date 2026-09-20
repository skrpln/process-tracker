// Process Tracker — DOM rendering of the tracker table.
// Knows nothing about the vault: everything it needs comes as data.

import { setTooltip } from "obsidian";
import { formatDay, formatMonthYear, splitMonthYear } from "../dates/grid.ts";
import type { CellRef } from "../entry/refresh.ts";
import { cellState, findEntries } from "../entry/state.ts";
import type { EntryIndex } from "../entry/state.ts";
import type { CellState, DateColumn, Entry, SortDirection, TrackCard } from "../model/types.ts";
import { resolveTrackColor } from "../tracks/color.ts";
import { streakEdges, strokeMarks } from "./stroke.ts";
import type { StrokeEdges, StrokeMark } from "./stroke.ts";

/**
 * Note of a draft, shown on hover. The preview beside it shows the note itself; this says
 * in one word what the note is still missing ([[expectation]] §8).
 */
const DRAFT_TOOLTIP = "Not done";

/** Class of the scrolling container; the wheel handler of the plugin looks for it by name. */
export const SCROLL_CLASS = "process-tracker__scroll";

/** Class of a row that has a colour of its own; the stylesheet repaints checkmarks by it. */
export const COLORED_CLASS = "process-tracker--colored";

/** Custom property the colour of a track is written into, once it is known to paint. */
export const TRACK_COLOR_PROPERTY = "--pt-track-color";

/** Attribute a row carries the colour its track asked for, before anything is painted. */
export const TRACK_COLOR_ATTRIBUTE = "data-track-color";

/** Class of the hidden element the theme is asked its questions through. */
export const PROBE_CLASS = "process-tracker__probe";

/** Class of the part of the probe that wears a colour. */
export const PROBE_COLOR_CLASS = "process-tracker__probe-color";

/** Class of a frame whose theme paints an unchecked box instead of outlining it. */
export const FILLED_CLASS = "process-tracker--filled";

/** Custom property the fill of an unchecked box is measured into. */
export const BOX_FILL_PROPERTY = "--pt-box-fill";

/** Custom property the thread is moved by, to meet the checkmarks where they are drawn. */
export const STROKE_SHIFT_PROPERTY = "--pt-stroke-shift";

/**
 * Attribute a row carries what the table cannot see: how far its streaks run past the left
 * and the right edge of the window, as two numbers. Written only when the block asked for a
 * thread, so its absence is also the answer to whether this row has one.
 */
export const STROKE_EDGES_ATTRIBUTE = "data-stroke-edges";

/** Attribute a cell carries its part of the thread: `start`, `mid` or `end`. */
export const STROKE_ATTRIBUTE = "data-stroke";

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
	/** Colour of this table, for the tracks whose card names none. `null` — the theme decides. */
	trackColor: string | null;
	/** Whether a streak of closed days is threaded together ([[expectation]] §9). */
	stroke: boolean;
	/** Which way the columns run; the thread of a row is counted along it. */
	dates: SortDirection;
	/** Journals of the days in sight: day -> path. A day without one is not in the map. */
	dailyNotes: ReadonlyMap<string, string>;
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
	probe: ThemeProbe;
}

/**
 * The two questions only a rendered table can answer, asked through hidden elements of the
 * table itself ([[rendering]]): does this colour paint anything, and how does the theme draw
 * an unchecked box here. Both live inside the dates table, because a theme is free to dress a
 * checkbox in a table differently from one in a paragraph — Brutalist does.
 */
export interface ThemeProbe {
	/** Wears a colour; its background says whether the colour paints anything. */
	color: HTMLElement;
	/** An unchecked box the theme has drawn its own way, untouched by the plugin. */
	box: HTMLElement;
	/** The same box, dressed as a draft: the two together say whether a draft shows. */
	draftBox: HTMLElement;
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
	const probe = renderProbe(dates);
	renderColumnWidths(dates, view.columns.length);
	renderDatesHead(dates, view.columns, view.dailyNotes);
	renderDatesBody(dates, view);

	return { frame, scroll, captionCell, probe };
}

/**
 * The probe: what the table asks the theme before it trusts its own stylesheet.
 *
 * It sits in the caption of the dates table — a caption is a legal child of a table and is
 * never laid out while it is hidden, so the probe costs nothing and disturbs no row. Inside
 * the table is where it has to be: a theme may style a checkbox in a table differently from
 * one in a paragraph, and an answer from the wrong neighbourhood is worse than none.
 */
function renderProbe(table: HTMLTableElement): ThemeProbe {
	const probe = table.createEl("caption", { cls: PROBE_CLASS });
	const color = probe.createDiv({ cls: PROBE_COLOR_CLASS });
	const box = probe.createEl("input", { cls: "task-list-item-checkbox", type: "checkbox" });
	// The draft box is dressed exactly as a draft cell is, so the comparison answers the real
	// question instead of a guess about it: the cell class and the state carry the rules.
	const draftCell = probe.createDiv({
		cls: "process-tracker__cell",
		attr: { "data-state": "draft" },
	});
	const draftBox = draftCell.createEl("input", {
		cls: "task-list-item-checkbox",
		type: "checkbox",
	});
	return { color, box, draftBox };
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
function renderDatesHead(
	table: HTMLTableElement,
	columns: DateColumn[],
	journals: ReadonlyMap<string, string>,
): void {
	const row = table.createEl("thead").createEl("tr");
	for (const column of columns) {
		const cell = row.createEl("th", {
			cls: "process-tracker__date",
			attr: { "data-date": column.iso },
		});
		renderDayCaption(cell, column, journals.get(column.iso) ?? null);
		if (column.isToday) cell.addClass("is-today");
	}
}

/**
 * The caption of one day ([[expectation]] §10).
 *
 * A day whose journal is in the vault wears it as a link — the same `a.internal-link` a
 * track name is, so Obsidian's own handler opens it: a click in this tab, a click with the
 * modifier in a new one. Nothing of ours listens for that click; a listener on top of the
 * link opened the note twice when the track names were made links.
 *
 * A day with no journal stays a plain number, and that is the only sign the table gives:
 * the caption itself says whether there is anything to open, so nothing has to be announced
 * and nothing has to be switched on.
 *
 * Either way the number sits in an element of its own, so it can be centred on the cell
 * whatever alignment and padding a theme gives the cell ([[rendering]]).
 */
function renderDayCaption(cell: HTMLElement, column: DateColumn, journal: string | null): void {
	const text = formatDay(column);
	if (journal === null) {
		cell.createSpan({ cls: "process-tracker__day", text });
		return;
	}
	cell.createEl("a", {
		cls: "process-tracker__day internal-link",
		text,
		attr: { href: journal, "data-href": journal },
	});
}

function renderDatesBody(table: HTMLTableElement, view: TrackerView): void {
	const body = table.createEl("tbody");
	for (const track of view.tracks) {
		const row = body.createEl("tr");
		requestColor(row, resolveTrackColor(track.color, view.trackColor));
		const thread = rowStroke(row, view, track.path);
		view.columns.forEach((column, index) => {
			const entries = findEntries(view.entries, track.path, column.iso);
			renderCheckCell(row, track, column, entries, thread[index] ?? null);
		});
	}
}

/**
 * Where the thread of one row runs ([[rendering#Ниточка|Ниточка]]). Nothing at all until the
 * block asks for one — a table without `stroke` counts no streaks and marks no cells.
 *
 * The streak is counted over the whole vault, which is what the index already holds: the days
 * beyond the edge of the table are looked up in it exactly as the drawn ones are. What was
 * found out there stays on the row, so a day that changes later can be answered for without
 * reading the vault again.
 */
function rowStroke(
	row: HTMLTableRowElement,
	view: TrackerView,
	trackPath: string,
): (StrokeMark | null)[] {
	if (!view.stroke) return [];

	const closed = (date: string): boolean =>
		cellState(findEntries(view.entries, trackPath, date)) === "done";
	const edges = streakEdges({
		days: view.columns.map((column) => column.iso),
		order: view.dates,
		closed,
	});

	row.setAttr(STROKE_EDGES_ATTRIBUTE, `${edges.before} ${edges.after}`);
	return strokeMarks(view.columns.map((column) => closed(column.iso)), edges);
}

/**
 * Redraws the thread of one row after a day of it changed ([[rendering#Ниточка|Ниточка]]).
 *
 * The days are read back from the cells, which have just been repainted, and the days outside
 * the window from the row, which has carried them since the render. So a checkmark taken back
 * breaks its streak at once, and no note of the vault is opened to find that out.
 *
 * A row of a table that asked for no thread carries no edges and is left alone.
 */
export function paintRowStroke(row: HTMLElement): void {
	const edges = strokeEdgesOf(row);
	if (edges === null) return;

	const cells = Array.from(row.querySelectorAll<HTMLElement>(".process-tracker__cell"));
	const marks = strokeMarks(cells.map((cell) => cell.dataset.state === "done"), edges);
	cells.forEach((cell, index) => markStroke(cell, marks[index] ?? null));
}

/** What the row knows about the streaks running past the window; `null` — no thread here. */
function strokeEdgesOf(row: HTMLElement): StrokeEdges | null {
	const written = row.getAttribute(STROKE_EDGES_ATTRIBUTE);
	if (written === null) return null;

	const [before, after] = written.split(" ").map(Number);
	if (!Number.isFinite(before) || !Number.isFinite(after)) return null;
	return { before, after };
}

function markStroke(cell: HTMLElement, mark: StrokeMark | null): void {
	if (mark === null) cell.removeAttribute(STROKE_ATTRIBUTE);
	else cell.setAttr(STROKE_ATTRIBUTE, mark);
}

/**
 * The colour a track asked for, written on the row and not yet painted ([[rendering]]).
 *
 * Nothing is painted here on purpose. A colour can be a form without a colour behind it —
 * `var(--color-gren)` reads as one and resolves to nothing — and a rule fed such a value
 * paints nothing at all, which on a done day means an empty-looking box. Whether a value
 * paints is a question for the rendered table, so the row states its request and the render
 * child answers it ([[rendering#Пробник|Пробник]]); until then the row looks as it always did.
 */
function requestColor(row: HTMLTableRowElement, color: string | null): void {
	if (color === null) return;
	row.setAttr(TRACK_COLOR_ATTRIBUTE, color);
}

/** The colour a row asked for; `""` when its track asked for none. */
export function rowColorRequest(row: HTMLElement): string {
	return (row.getAttribute(TRACK_COLOR_ATTRIBUTE) ?? "").trim();
}

/**
 * Paints the row: the colour is known to paint something, so the rules may read it.
 *
 * The class says the same thing the variable does — the difference is that CSS can select on
 * it. A rule that read the variable alone would have to state what to do without one, and for
 * a plain property that answer is "the initial value", which for a background means
 * transparent: a theme's own checkbox would be wiped out by a rule meant to leave it alone.
 */
export function paintRow(row: HTMLElement, color: string): void {
	row.addClass(COLORED_CLASS);
	row.style.setProperty(TRACK_COLOR_PROPERTY, color);
}

/**
 * Leaves the row to the theme. The request stays on it: a theme can be changed under a table
 * that is already on screen, and the next measurement asks about the same colour again.
 */
export function unpaintRow(row: HTMLElement): void {
	row.removeClass(COLORED_CLASS);
	row.style.removeProperty(TRACK_COLOR_PROPERTY);
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
 * A cell the thread runs through carries `data-stroke`, which says where the line enters
 * and leaves it; the stylesheet draws the line itself ([[rendering]]).
 *
 * The click itself is handled once for the whole table, by `CellPointerChild`.
 */
function renderCheckCell(
	row: HTMLTableRowElement,
	track: TrackCard,
	column: DateColumn,
	entries: readonly Entry[],
	stroke: StrokeMark | null,
): void {
	const state = cellState(entries);
	const cell = row.createEl("td", {
		cls: "process-tracker__cell",
		attr: { "data-date": column.iso, "data-track": track.path, "data-state": state },
	});
	if (column.isToday) cell.addClass("is-today");
	markStroke(cell, stroke);
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

	// The thread of the row follows the cell: a day just closed can finish a streak, and a
	// checkmark taken back breaks one. A row without a thread returns from here at once.
	if (cell.parentElement !== null) paintRowStroke(cell.parentElement);
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
