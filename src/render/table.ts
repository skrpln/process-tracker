// Process Tracker — DOM rendering of the tracker table.
// Knows nothing about the vault: everything it needs comes as data.

import { setTooltip } from "obsidian";
import { fillTitle, titleParts } from "../codeblock/title.ts";
import { formatDay, formatMonthYear, splitMonthYear } from "../dates/grid.ts";
import { nestedEntries } from "../entry/nested.ts";
import type { CellRef, RowRef } from "../entry/refresh.ts";
import {
	cellMark,
	cellState,
	countedEntries,
	entryId,
	findEntries,
	standingIn,
} from "../entry/state.ts";
import type { EntryIndex } from "../entry/state.ts";
import type {
	CellState,
	DateColumn,
	Entry,
	NamesAlign,
	SortDirection,
	TrackCard,
} from "../model/types.ts";
import { resolveTrackColor } from "../tracks/color.ts";
import { streakEdges, strokeMarks } from "./stroke.ts";
import type { StrokeEdges, StrokeMark } from "./stroke.ts";

/**
 * Note of a draft, shown on hover. The preview beside it shows the note itself; this says
 * in one word what the note is still missing ([[expectation]] §8).
 */
const DRAFT_TOOLTIP = "Not done";

/** Class of a day caption with no daily note behind it, where a click can make one. */
export const CREATABLE_CLASS = "is-creatable";

/** Class of the scrolling container; the wheel handler of the plugin looks for it by name. */
export const SCROLL_CLASS = "process-tracker__scroll";

/** Class of the line between the names and the dates, which the first column is dragged by. */
export const RESIZER_CLASS = "process-tracker__resizer";

/** Custom property the width of the first column is written into, in place of the stylesheet's. */
export const NAMES_WIDTH_PROPERTY = "--pt-col-track";

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

/**
 * Custom property that says how far a checkbox stands from the middle of its cell. The thread
 * is moved by it to meet the checkmarks, and a mark to stand where the checkmark would.
 */
export const BOX_SHIFT_PROPERTY = "--pt-box-shift";

/** Class of the wrapper that centres what a cell shows: the checkbox, or the mark over it. */
export const SLOT_CLASS = "process-tracker__slot";

/** Class of the sign a closed day shows instead of its checkmark ([[expectation]] §7). */
export const MARK_CLASS = "process-tracker__mark";

/**
 * Attribute a cell with a mark carries. The stylesheet hides the checkbox by it and puts the
 * sign on a backing where the thread runs ([[rendering]]).
 */
export const MARK_ATTRIBUTE = "data-mark";

/**
 * Attribute a row carries what the table cannot see: how far its streaks run past the left
 * and the right edge of the window, as two numbers. Written only when the block asked for a
 * thread, so its absence is also the answer to whether this row has one.
 */
export const STROKE_EDGES_ATTRIBUTE = "data-stroke-edges";

/** Attribute a cell carries its part of the thread: `start`, `mid` or `end`. */
export const STROKE_ATTRIBUTE = "data-stroke";

/**
 * Attribute a cell names the entries in that only leave a trace in its day: closed on another
 * day, they are listed by the popup and not counted by the cell ([[expectation]] §7). The same
 * addresses stand in `data-entry` too, which names everything the day holds.
 */
export const TRACE_ATTRIBUTE = "data-trace";

/**
 * Attribute a row names the tracks below its own in — its descendants, one path per line, in
 * the order of the table ([[nested-tracks]]). Written only for a track that has some, so its
 * absence is also the answer to whether anything stands below this row.
 */
export const DESCENDANTS_ATTRIBUTE = "data-descendants";

/**
 * Attribute a cell names the entries of the descendants of its track in: the entries that
 * stand in this day below the track, one address per line ([[expectation]] §12).
 */
export const NESTED_ATTRIBUTE = "data-nested";

/**
 * Attribute a cell names the track of each of those entries in, line for line with
 * `data-nested`: an address says where an entry stands, not whose it is.
 */
export const NESTED_TRACK_ATTRIBUTE = "data-nested-track";

/**
 * Attribute a cell carries the state of the track's own entries in, where an entry closed
 * below made the cell say more than they do. A click works with the track's own entries and
 * reads its state here ([[expectation]] §12).
 */
export const OWN_STATE_ATTRIBUTE = "data-own-state";

/**
 * How the addresses of a day are written into one attribute: one per line. A vault path holds
 * no newline, so the list splits back exactly as it was written.
 */
const ID_SEPARATOR = "\n";

/** The answer for a row with nothing below it; shared, so a row allocates nothing. */
const NO_TRACKS: readonly string[] = Object.freeze([]);

/** A row of the date cells, which names its track in `data-track`. */
const ROW_SELECTOR = ".process-tracker__dates tr[data-track]";

/** Everything the table needs; assembled by the plugin entry point. */
export interface TrackerView {
	tracks: TrackCard[];
	columns: DateColumn[];
	/** Entries of the vault; decide the state of every cell. */
	entries: EntryIndex;
	/**
	 * The tracks below each row that has any: track path -> its descendants, in the order of
	 * the table. Their entries count in the cells of the row ([[nested-tracks]]).
	 */
	descendants: ReadonlyMap<string, readonly string[]>;
	/** Colour of this table, for the tracks whose card names none. `null` — the theme decides. */
	trackColor: string | null;
	/** Whether a streak of closed days is threaded together ([[expectation]] §9). */
	stroke: boolean;
	/** Which way the columns run; the thread of a row is counted along it. */
	dates: SortDirection;
	/** Daily notes of the days in sight: day -> path. A day without one is not in the map. */
	dailyNotes: ReadonlyMap<string, string>;
	/** Whether a day without a daily note can have one made by a click ([[daily-notes]]). */
	dailyNotesCreatable: boolean;
	/** Text of the corner, placeholders unfilled ([[codeblock-syntax]]). */
	title: string;
	/** How the track names and the corner title stand in their column. */
	align: NamesAlign;
	/** Width of the first column in pixels; `null` — the width of the stylesheet. */
	width: number | null;
	/** Only used by the empty state, to name the tag the user has configured. */
	trackTag: string;
	/** Only used by the empty state, to tell an empty vault from an empty filter. */
	trackFilter: string | null;
	/**
	 * How many tracks `show: due` left out. Only used by the empty state, to tell a day with
	 * nothing due from a table with no tracks.
	 */
	notDue: number;
}

/** Elements the render child needs to follow the scrolling table. */
export interface TrackerElements {
	/** Both tables together: the pointer works over the whole thing. */
	frame: HTMLElement;
	/** The line between the two tables, which the first column is dragged by. */
	resizer: HTMLElement;
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
		renderEmptyState(root, view);
		return null;
	}

	const frame = root.createDiv({ cls: "process-tracker__frame" });
	frame.style.setProperty("--pt-names-align", view.align);
	setNamesWidth(frame, view.width);

	const names = frame.createEl("table", {
		cls: "process-tracker__table process-tracker__names",
	});
	const captionCell = renderNamesHead(names, view.columns[0], view.title);
	renderNamesBody(names, view.tracks);

	// The line stands between the tables as an element of its own, so it is always exactly
	// where they meet, however wide the first one is ([[rendering]]).
	const resizer = frame.createDiv({ cls: RESIZER_CLASS });

	const scroll = frame.createDiv({ cls: SCROLL_CLASS });
	const dates = scroll.createEl("table", {
		cls: "process-tracker__table process-tracker__dates",
	});
	const probe = renderProbe(dates);
	renderColumnWidths(dates, view.columns.length);
	renderDatesHead(dates, view.columns, view.dailyNotes, view.dailyNotesCreatable);
	renderDatesBody(dates, view);

	return { frame, resizer, scroll, captionCell, probe };
}

/**
 * Gives the first column a width of its own, or — for `null` — hands it back to the
 * stylesheet. The render writes the `width` of the block here, and a drag every width the
 * pointer passes ([[rendering]]).
 */
export function setNamesWidth(frame: HTMLElement, width: number | null): void {
	if (width === null) frame.style.removeProperty(NAMES_WIDTH_PROPERTY);
	else frame.style.setProperty(NAMES_WIDTH_PROPERTY, `${width}px`);
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
 * The corner caption: the title of the block, by default the month and the year of the
 * columns in sight. It stands above the track names, out of the scrolling frame, so nothing
 * can carry it away — the render child only rewrites it as the columns go by.
 */
function renderNamesHead(
	table: HTMLTableElement,
	first: DateColumn | undefined,
	title: string,
): HTMLElement {
	const cell = table
		.createEl("thead")
		.createEl("tr")
		.createEl("th", { cls: "process-tracker__period" });
	renderPeriodCaption(cell, title, first === undefined ? "" : formatMonthYear(first));
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
	dailyNotes: ReadonlyMap<string, string>,
	creatable: boolean,
): void {
	const row = table.createEl("thead").createEl("tr");
	for (const column of columns) {
		const cell = row.createEl("th", {
			cls: "process-tracker__date",
			attr: { "data-date": column.iso },
		});
		renderDayCaption(cell, formatDay(column), dailyNotes.get(column.iso) ?? null, creatable);
		if (column.isToday) cell.addClass("is-today");
	}
}

/**
 * The caption of one day ([[expectation]] §9).
 *
 * A day whose daily note is in the vault wears it as a link — the same `a.internal-link` a
 * track name is, so Obsidian's own handler opens it: a click in this tab, a click with the
 * modifier in a new one. Nothing of ours listens for that click; a listener on top of the
 * link opened the note twice when the track names were made links.
 *
 * A day with no daily note stays a plain number, and that is the only sign the table gives:
 * the caption itself says whether there is anything to open. Where a daily note can be made —
 * the daily notes are on and their folder is there — the number answers a click by offering
 * to create one ([[daily-notes]]); the pointer child listens for it, since no link is there
 * for Obsidian to handle.
 *
 * Either way the number sits in an element of its own, so it can be centred on the cell
 * whatever alignment and padding a theme gives the cell ([[rendering]]).
 */
function renderDayCaption(
	cell: HTMLElement,
	text: string,
	dailyNote: string | null,
	creatable: boolean,
): void {
	if (dailyNote !== null) {
		cell.createEl("a", {
			cls: "process-tracker__day internal-link",
			text,
			attr: { href: dailyNote, "data-href": dailyNote },
		});
		return;
	}
	const day = cell.createSpan({ cls: "process-tracker__day", text });
	if (creatable) day.addClass(CREATABLE_CLASS);
}

/**
 * Turns the caption of a day into a link to its daily note, just created by a click on it. The
 * rest of the table stays: the caption is dressed in place, as a render would have drawn it.
 */
export function dressDayCaption(cell: HTMLElement, dailyNote: string): void {
	const text = cell.querySelector(".process-tracker__day")?.textContent ?? "";
	cell.empty();
	renderDayCaption(cell, text, dailyNote, false);
}

function renderDatesBody(table: HTMLTableElement, view: TrackerView): void {
	const body = table.createEl("tbody");
	for (const track of view.tracks) {
		const row = body.createEl("tr", { attr: { "data-track": track.path } });
		const below = view.descendants.get(track.path) ?? NO_TRACKS;
		writeIds(row, DESCENDANTS_ATTRIBUTE, below);
		requestColor(row, resolveTrackColor(track.color, view.trackColor));

		const day = (date: string): Day => ({
			own: findEntries(view.entries, track.path, date),
			nested: nestedEntries(view.entries, below, date),
		});
		const thread = rowStroke(row, view, day);
		view.columns.forEach((column, index) => {
			renderCheckCell(row, track, column, day(column.iso), thread[index] ?? null);
		});
	}
}

/**
 * What one day of a track holds: the track's own entries, and the entries of the tracks below
 * it ([[expectation]] §12).
 */
interface Day {
	own: readonly Entry[];
	nested: readonly Entry[];
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
	day: (date: string) => Day,
): (StrokeMark | null)[] {
	if (!view.stroke) return [];

	// A day closed by an entry below the track is a closed day of the streak too.
	const closed = (date: string): boolean => {
		const { own, nested } = day(date);
		return cellState(own, date, nested) === "done";
	};
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
 * The box shows what the vault says: checked when every entry of the day is closed in it,
 * unchecked for a draft or an empty day. The state also goes on the cell as `data-state`, where
 * the stylesheet picks the draft up and where the click handling reads it back — together with
 * `data-track`, `data-date` and `data-entry`, which address the cell and name the entries
 * behind it, one address per line — a path for a note, a path and a place for a record.
 * `data-trace` names those of them that were closed on another day: the cell does not count
 * them, the popup lists them ([[expectation]] §7).
 *
 * A day with several entries looks like any other day: there is no mark for it, because
 * several entries are a state of affairs and not an error ([[expectation]] §7).
 *
 * A cell the thread runs through carries `data-stroke`, which says where the line enters
 * and leaves it; the stylesheet draws the line itself ([[rendering]]).
 *
 * A closed day of one entry with a `mark` shows the mark instead of the checkmark. The box
 * stays in the cell, hidden: the measurements ask a box its size and its place, and a mark
 * taken back by a click has the box to fall back on.
 *
 * A cell of a track with tracks below it counts their entries too: `data-nested` names them
 * and `data-nested-track` the track of each, and where one of them closed the day over the
 * head of the track's own entries, `data-own-state` keeps the state those alone would give
 * ([[nested-tracks]]).
 *
 * The click itself is handled once for the whole table, by `CellPointerChild`.
 */
function renderCheckCell(
	row: HTMLTableRowElement,
	track: TrackCard,
	column: DateColumn,
	day: Day,
	stroke: StrokeMark | null,
): void {
	const cell = row.createEl("td", {
		cls: "process-tracker__cell",
		attr: { "data-date": column.iso, "data-track": track.path },
	});
	if (column.isToday) cell.addClass("is-today");
	markStroke(cell, stroke);

	// The checkbox is wrapped for the same reason as the day number: the wrapper is ours,
	// so centring it never has to argue with the way a theme styles a checkbox.
	cell.createDiv({ cls: SLOT_CLASS }).createEl("input", {
		cls: "task-list-item-checkbox",
		type: "checkbox",
	});
	showDay(cell, day.own, day.nested);
}

/**
 * Repaints one cell from the entries of its day — the track's own and those below it — after
 * the day changed. The table is not rebuilt: a rebuild would throw away the scroll position
 * of the table the reader is working in.
 */
export function paintCell(
	cell: HTMLElement,
	entries: readonly Entry[],
	nested: readonly Entry[] = [],
): void {
	showDay(cell, entries, nested);

	// The thread of the row follows the cell: a day just closed can finish a streak, and a
	// checkmark taken back breaks one. A row without a thread returns from here at once.
	if (cell.parentElement !== null) paintRowStroke(cell.parentElement);
}

/**
 * Writes a day into its cell: the state, the addresses, the box, the mark and the note of a
 * draft. One function for the render and for the repaint, so the two cannot drift apart.
 */
function showDay(cell: HTMLElement, own: readonly Entry[], nested: readonly Entry[]): void {
	const date = cell.dataset.date ?? "";
	const state = cellState(own, date, nested);
	const ownState = cellState(own, date);
	cell.setAttr("data-state", state);
	if (ownState === state) cell.removeAttribute(OWN_STATE_ATTRIBUTE);
	else cell.setAttr(OWN_STATE_ATTRIBUTE, ownState);

	writeEntryIds(cell, own, date);
	writeIds(cell, NESTED_ATTRIBUTE, nested.map(entryId));
	writeIds(cell, NESTED_TRACK_ATTRIBUTE, nested.map((entry) => entry.trackPath));
	setTooltip(cell, draftTooltip(state, countedEntries(own, date).length));

	const box = cell.querySelector<HTMLInputElement>('input[type="checkbox"]');
	if (box !== null) box.checked = state === "done";
	showMark(cell, cellMark(own, date, nested));
}

/**
 * Puts the mark of a day into its cell, or takes it out. The sign is made only for a day that
 * has one, so a table without marks carries not a single extra element.
 */
function showMark(cell: HTMLElement, mark: string | null): void {
	const slot = cell.querySelector<HTMLElement>(`.${SLOT_CLASS}`);
	const sign = slot?.querySelector<HTMLElement>(`.${MARK_CLASS}`) ?? null;
	if (slot === null || mark === null) {
		cell.removeAttribute(MARK_ATTRIBUTE);
		sign?.remove();
		return;
	}

	cell.setAttr(MARK_ATTRIBUTE, "");
	if (sign === null) slot.createSpan({ cls: MARK_CLASS, text: mark });
	else sign.setText(mark);
}

/**
 * The note of a draft, shown on hover beside the preview of its entry. A day with several
 * entries says nothing here: its popup lists them with a box each, and a tooltip over that
 * popup would only be in the way ([[expectation]] §8).
 */
function draftTooltip(state: CellState, count: number): string {
	return state === "draft" && count === 1 ? DRAFT_TOOLTIP : "";
}

/** The addresses of every entry behind a cell, traces included, in the order the popup lists them. */
export function entryIdsOf(cell: HTMLElement): string[] {
	return idsIn(cell, "data-entry");
}

/** The addresses of the entries a cell holds only as traces, closed on another day. */
export function traceIdsOf(cell: HTMLElement): string[] {
	return idsIn(cell, TRACE_ATTRIBUTE);
}

/** The addresses of the entries a cell counts: what a click on it works with. */
export function countedIdsOf(cell: HTMLElement): string[] {
	const traces = traceIdsOf(cell);
	return entryIdsOf(cell).filter((id) => !traces.includes(id));
}

function idsIn(cell: HTMLElement, attribute: string): string[] {
	const written = cell.getAttribute(attribute) ?? "";
	return written === "" ? [] : written.split(ID_SEPARATOR);
}

function writeEntryIds(cell: HTMLElement, entries: readonly Entry[], date: string): void {
	const traces = entries.filter((entry) => standingIn(entry, date) === "trace");
	writeIds(cell, "data-entry", entries.map(entryId));
	writeIds(cell, TRACE_ATTRIBUTE, traces.map(entryId));
}

function writeIds(cell: HTMLElement, attribute: string, ids: readonly string[]): void {
	if (ids.length === 0) cell.removeAttribute(attribute);
	else cell.setAttr(attribute, ids.join(ID_SEPARATOR));
}

/** An entry below the track of a cell, as the cell names it: whose it is, and where it stands. */
export interface NestedRef {
	trackPath: string;
	id: string;
}

/** The entries of the descendants a cell names, in the order the popup lists them. */
export function nestedOf(cell: HTMLElement): NestedRef[] {
	const tracks = idsIn(cell, NESTED_TRACK_ATTRIBUTE);
	return idsIn(cell, NESTED_ATTRIBUTE).map((id, index) => ({ id, trackPath: tracks[index] ?? "" }));
}

/** The state of the track's own entries: what a click on the cell works with. */
export function ownStateOf(cell: HTMLElement): CellState {
	const state = cell.getAttribute(OWN_STATE_ATTRIBUTE) ?? cell.dataset.state ?? "empty";
	return state as CellState;
}

/** The tracks below the track of a row; none for a row nothing stands under. */
export function descendantsOfRow(row: HTMLElement | null): string[] {
	return row === null ? [] : idsIn(row, DESCENDANTS_ATTRIBUTE);
}

/** The rows of this table that have tracks below their own, each with the list it carries. */
export function rowsWithDescendants(root: HTMLElement): RowRef[] {
	const rows = root.querySelectorAll<HTMLElement>(`${ROW_SELECTOR}[${DESCENDANTS_ATTRIBUTE}]`);
	return Array.from(rows, (row) => ({
		trackPath: row.dataset.track ?? "",
		descendants: descendantsOfRow(row),
	}));
}

/**
 * The cells of this table that show the entry at this address right now — as an entry of
 * their own track, or as one of a track below it.
 */
export function cellsShowing(root: HTMLElement, id: string): HTMLElement[] {
	const own = cellsOf(root, "[data-entry]").filter((cell) => entryIdsOf(cell).includes(id));
	const above = cellsOf(root, `[${NESTED_ATTRIBUTE}]`).filter((cell) =>
		idsIn(cell, NESTED_ATTRIBUTE).includes(id),
	);
	return [...own, ...above];
}

/**
 * The rows of this table the journal at this path can change: the rows of the tracks that
 * keep it — `keeps` answers that — and the rows whose cells show a record of it, which covers
 * a journal just deleted or no longer linked ([[entry#Журнал трека|entry]]).
 *
 * A record closes the cells of the tracks above its own, so the rows that have a keeper of
 * the journal below them, or show a record of it as one from below, are among them
 * ([[nested-tracks]]).
 */
export function rowsOfJournal(
	root: HTMLElement,
	path: string,
	keeps: (trackPath: string) => boolean,
): HTMLElement[] {
	const rows = new Set<HTMLElement>();
	for (const row of Array.from(root.querySelectorAll<HTMLElement>(ROW_SELECTOR))) {
		if (keeps(row.dataset.track ?? "") || descendantsOfRow(row).some(keeps)) rows.add(row);
	}
	// Asked of the browser in one selector: the cells are many, the journals on them are few.
	const record = quote(`${path}#`);
	for (const attribute of ["data-entry", NESTED_ATTRIBUTE]) {
		for (const cell of cellsOf(root, `[${attribute}*=${record}]`)) {
			if (cell.parentElement !== null) rows.add(cell.parentElement);
		}
	}
	return Array.from(rows);
}

/** The cells of one row, in the order of the columns. */
export function cellsOfRow(row: HTMLElement): HTMLElement[] {
	return cellsOf(row, "");
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
 * message names the filter instead of asking for a tag that is probably there. A block of
 * `show: due` that had tracks to choose from and kept none is not missing anything at all.
 */
function renderEmptyState(root: HTMLElement, view: TrackerView): void {
	let text = `No track card matches "track: ${view.trackFilter}".`;
	if (view.notDue > 0) text = "No track is due today.";
	else if (view.trackFilter === null) {
		text = `No track cards found. Tag a note with #${view.trackTag} to add a track.`;
	}
	root.createDiv({ cls: "process-tracker__empty", text });
}

/**
 * Writes the corner caption: the title with the month and the year of `label` filled in.
 * Used by the render child too, which rewrites the caption as the table scrolls.
 *
 * A link of the title is the same `a.internal-link` a track name is: Obsidian opens it, and
 * the pointer child hands it to the preview ([[rendering]]).
 */
export function renderPeriodCaption(cell: HTMLElement, title: string, label: string): void {
	cell.empty();
	const { month, year } = splitMonthYear(label);
	for (const part of titleParts(fillTitle(title, month, year))) {
		if (part.link === undefined) {
			cell.appendText(part.text);
			continue;
		}
		cell.createEl("a", {
			cls: "internal-link",
			text: part.text,
			attr: { href: part.link, "data-href": part.link },
		});
	}
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
