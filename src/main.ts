// Process Tracker — plugin entry point.
// Wires the pure layers together: parse -> select -> date grid -> render.

import { Notice, Plugin } from "obsidian";
import type { MarkdownPostProcessorContext, TFile } from "obsidian";
import { parseCodeBlock } from "./codeblock/parse.ts";
import { CODE_BLOCK_LANGUAGE, DEFAULT_DAYS } from "./constants.ts";
import { buildDateColumns } from "./dates/grid.ts";
import { cellAction } from "./evidence/actions.ts";
import { collectEvidence } from "./evidence/source.ts";
import { buildEvidenceIndex, findEvidence } from "./evidence/state.ts";
import { createEvidence, setEvidenceDone } from "./evidence/write.ts";
import { TrackerRenderChild } from "./render/child.ts";
import { CellClickChild } from "./render/clicks.ts";
import type { CellTarget } from "./render/clicks.ts";
import { paintCell, renderError, renderTracker, renderWarnings } from "./render/table.ts";
import { DEFAULT_SETTINGS, normalizeSettings } from "./settings.ts";
import type { ProcessTrackerSettings } from "./settings.ts";
import { applyTrackFilter } from "./tracks/dataview.ts";
import { selectTracks } from "./tracks/select.ts";
import { collectTrackCards } from "./tracks/source.ts";

export default class ProcessTrackerPlugin extends Plugin {
	settings: ProcessTrackerSettings = { ...DEFAULT_SETTINGS };

	async onload(): Promise<void> {
		this.settings = normalizeSettings(await this.loadData());
		this.registerMarkdownCodeBlockProcessor(
			CODE_BLOCK_LANGUAGE,
			(source, element, context) => this.renderBlock(source, element, context),
		);
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	/**
	 * Renders one code block. State is never cached: the table is rebuilt from
	 * the metadata cache on every render.
	 */
	private renderBlock(
		source: string,
		element: HTMLElement,
		context: MarkdownPostProcessorContext,
	): void {
		element.empty();
		try {
			const { options, warnings } = parseCodeBlock(source);

			// The tag filter comes first: the `track` expression then works on a handful
			// of track cards instead of the whole vault.
			const cards = collectTrackCards(this.app);
			const tagged = selectTracks(cards, this.settings.trackTag, options.sort);
			const tracks = applyTrackFilter(
				this.app,
				tagged,
				options.track,
				context.sourcePath,
				warnings,
			);
			const columns = buildDateColumns({
				start: options.start,
				today: new Date(),
				days: options.days ?? DEFAULT_DAYS,
				order: options.dates,
			});

			const elements = renderTracker(element, {
				tracks,
				columns,
				evidence: buildEvidenceIndex(collectEvidence(this.app)),
				trackTag: this.settings.trackTag,
				trackFilter: options.track,
			});
			renderWarnings(element, warnings);

			if (elements !== null) {
				// The day captions carry no month, so the corner caption follows the scroll.
				context.addChild(
					new TrackerRenderChild(element, elements.scroll, elements.captionCell, columns),
				);
				context.addChild(
					new CellClickChild(element, elements.scroll, (target, mod) => {
						void this.runCellAction(target, mod);
					}),
				);
			}
		} catch (error) {
			renderError(element, error instanceof Error ? error.message : String(error));
		}
	}

	/**
	 * Performs what a click asks for ([[expectation]] §8) and repaints the one cell that
	 * changed. Only that cell: a table redrawn on every click would lose its scroll
	 * position, and noticing changes made elsewhere in the vault is the business of the
	 * subscription that arrives in Phase 6.
	 */
	private async runCellAction(target: CellTarget, mod: boolean): Promise<void> {
		const action = cellAction(target.state, mod);
		try {
			if (action.kind === "create") {
				const file = await createEvidence(
					this.app,
					target.trackPath,
					target.date,
					action.done,
					this.settings.evidenceFolder,
				);
				paintCell(target.cell, action.done ? "done" : "draft", file.path);
				return;
			}

			const file = this.evidenceFile(target);
			if (file === null) throw new Error(`the evidence note of ${target.date} is gone`);

			if (action.kind === "toggle") {
				await setEvidenceDone(this.app, file.path, action.done);
				paintCell(target.cell, action.done ? "done" : "draft", file.path);
				return;
			}
			await this.app.workspace.getLeaf("tab").openFile(file);
		} catch (error) {
			new Notice(
				`Process Tracker: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}

	/**
	 * The note behind a cell. The path written into the cell can go stale between renders
	 * — Templater moves a new note while it renders it — so a path that leads nowhere is
	 * answered by looking the evidence up in the vault again, not by opening a link, which
	 * would quietly create an empty note at the old address.
	 */
	private evidenceFile(target: CellTarget): TFile | null {
		if (target.evidencePath !== null) {
			const file = this.app.vault.getFileByPath(target.evidencePath);
			if (file !== null) return file;
		}

		const index = buildEvidenceIndex(collectEvidence(this.app));
		const found = findEvidence(index, target.trackPath, target.date);
		return found === null ? null : this.app.vault.getFileByPath(found.path);
	}
}
