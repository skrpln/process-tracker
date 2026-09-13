// Process Tracker — plugin entry point.
// Wires the pure layers together: parse -> select -> date grid -> render.

import { Plugin } from "obsidian";
import type { MarkdownPostProcessorContext } from "obsidian";
import { parseCodeBlock } from "./codeblock/parse.ts";
import { CODE_BLOCK_LANGUAGE, DEFAULT_DAYS } from "./constants.ts";
import { buildDateColumns } from "./dates/grid.ts";
import { collectEvidence } from "./evidence/source.ts";
import { buildEvidenceIndex } from "./evidence/state.ts";
import { TrackerRenderChild } from "./render/child.ts";
import { renderError, renderTracker, renderWarnings } from "./render/table.ts";
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

			// The day captions carry no month, so the corner caption always follows the scroll.
			if (elements !== null) {
				context.addChild(
					new TrackerRenderChild(element, elements.scroll, elements.captionCell, columns),
				);
			}
		} catch (error) {
			renderError(element, error instanceof Error ? error.message : String(error));
		}
	}
}
