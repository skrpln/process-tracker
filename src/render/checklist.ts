// Process Tracker — the checklist: a block drawn as the tasks of one day ([[checklist-view]]).
// Knows nothing about the vault: everything it needs comes as data.

import { MarkdownRenderChild } from "obsidian";
import { formatMonthYear } from "../dates/grid.ts";
import { nestedEntries } from "../entry/nested.ts";
import { findEntries } from "../entry/state.ts";
import type { EntryIndex } from "../entry/state.ts";
import type { DateColumn, TrackCard } from "../model/types.ts";
import { paintColors } from "./child.ts";
import type { LiveTables } from "./child.ts";
import { TASK_LIST_CLASSES } from "./popup.ts";
import {
	CELL_CLASS,
	PROBE_CLASS,
	PROBE_COLOR_CLASS,
	dressRow,
	paintCell,
	renderEmptyState,
	renderPeriodCaption,
} from "./table.ts";

/** Class of the checklist: the line above it and the list. The pointer works over it. */
export const CHECKLIST_CLASS = "process-tracker__checklist";

/** Class of the line above the list: the title of the block, or the day it names. */
const TITLE_CLASS = "process-tracker__checklist-title";

/** The answer for a track with nothing below it; shared, so a lookup allocates nothing. */
const NO_TRACKS: readonly string[] = Object.freeze([]);

/** Everything the checklist needs; assembled by the plugin entry point. */
export interface ChecklistView {
	tracks: TrackCard[];
	/** The day of the list: every box is the cell of this day. */
	day: DateColumn;
	/** Entries of the vault; decide the state of every box. */
	entries: EntryIndex;
	/** The tracks below each row that has any, as a table takes them ([[nested-tracks]]). */
	descendants: ReadonlyMap<string, readonly string[]>;
	/** Colour of this list, for the tracks whose card names none. `null` — the theme decides. */
	trackColor: string | null;
	/** The line above the list, placeholders unfilled; `null` — no line. */
	caption: string | null;
	/** Only used by the empty state, to name the tag the user has configured. */
	trackTag: string;
	/** Only used by the empty state, to tell an empty vault from an empty filter. */
	trackFilter: string | null;
	/** How many tracks `show: due` left out; only used by the empty state. */
	notDue: number;
	/** Whether the block names the day itself, in `start`; only used by the empty state. */
	dayNamed: boolean;
}

/** Elements the children of the block work with. */
export interface ChecklistElements {
	/** The whole checklist: the pointer listens here, and the plugin repaints the boxes in it. */
	list: HTMLElement;
	/** The hidden element the theme is asked through whether a colour paints ([[rendering]]). */
	probe: HTMLElement;
}

/**
 * Renders the block as a checklist of one day, or an empty-state message. Returns the elements
 * the children of the block work with, or `null` when there is no list.
 *
 * A row is a track, and its box is the cell of that track for the day of the list: the box
 * carries the class and the `data-` attributes a cell of the table carries, so the click, the
 * popups and the repaint on a change in the vault find it as they find a cell, and no second
 * copy of any of them exists ([[checklist-view]]).
 *
 * The markup is the one Obsidian renders a task list of a note into — `ul.contains-task-list`,
 * `li.task-list-item`, the box a child of its item — so a theme dresses the list as it dresses
 * every other checklist of the vault. The box carries no `data-line`: that is how Obsidian
 * tells a task of the note from a box that is not its to toggle.
 *
 * The name of a track is the plain `a.internal-link` it is in the first column of the table:
 * Obsidian opens it, and the pointer child hands it to the preview.
 */
export function renderChecklist(
	container: HTMLElement,
	view: ChecklistView,
): ChecklistElements | null {
	const root = container.createDiv({ cls: "process-tracker" });
	if (view.tracks.length === 0) {
		renderEmptyState(root, {
			trackTag: view.trackTag,
			trackFilter: view.trackFilter,
			notDue: view.notDue,
			dueDay: view.dayNamed ? view.day.iso : undefined,
		});
		return null;
	}

	const list = root.createDiv({ cls: CHECKLIST_CLASS });
	if (view.caption !== null) {
		renderPeriodCaption(
			list.createDiv({ cls: TITLE_CLASS }),
			view.caption,
			formatMonthYear(view.day),
		);
	}

	const items = list.createEl("ul", { cls: TASK_LIST_CLASSES });
	for (const track of view.tracks) {
		const item = items.createEl("li", { cls: "task-list-item" });
		const below = view.descendants.get(track.path) ?? NO_TRACKS;
		dressRow(item, track, below, view.trackColor);

		const box = item.createEl("input", {
			cls: `task-list-item-checkbox ${CELL_CLASS}`,
			type: "checkbox",
			attr: { "data-date": view.day.iso, "data-track": track.path },
		});
		item.createEl("a", {
			cls: "internal-link",
			text: track.name,
			attr: { href: track.path, "data-href": track.path },
		});
		// Written by the function that repaints a cell, so the two cannot drift apart.
		paintCell(
			box,
			findEntries(view.entries, track.path, view.day.iso),
			nestedEntries(view.entries, below, view.day.iso),
		);
	}

	const probe = list.createDiv({ cls: PROBE_CLASS }).createDiv({ cls: PROBE_COLOR_CLASS });
	return { list, probe };
}

/**
 * The life of one checklist on screen. A list has nothing to measure — no columns, no rows to
 * keep in step — so of everything the render child of a table does, two things are left
 * ([[checklist-view]]).
 *
 * It announces the list for as long as the block lives, so a change in the vault repaints its
 * boxes as it repaints the cells of a table. And it asks the theme whether the colours the
 * tracks named paint anything — once the list is in a document, the only place a theme
 * answers: asked in `onload`, before Obsidian has put the block in its note, every colour
 * comes back empty ([[rendering#Пробник|Пробник]]).
 */
export class ChecklistChild extends MarkdownRenderChild {
	constructor(
		containerEl: HTMLElement,
		private readonly list: HTMLElement,
		private readonly probe: HTMLElement,
		private readonly tables: LiveTables,
	) {
		super(containerEl);
	}

	onload(): void {
		this.tables.add(this.list);
		this.register(() => this.tables.delete(this.list));
		this.register(this.list.onNodeInserted(() => paintColors(this.list, this.probe)));
	}
}
