// Process Tracker — the settings tab of the plugin ([[architecture]]).
// Adapter module: draws two fields and writes them into the settings, nothing else.

import { PluginSettingTab, Setting } from "obsidian";
import type { App } from "obsidian";
import type ProcessTrackerPlugin from "./main.ts";
import { DEFAULT_SETTINGS, normalizeEvidenceFolder, normalizeTrackTag } from "./settings.ts";

/**
 * The two settings of [[expectation]] §10: the tag that marks a track card and the folder
 * new evidence goes to. Every keystroke is cleaned up and saved — Obsidian has no Save
 * button, and a settings tab that loses what was typed is worse than none.
 *
 * A changed setting reaches a table at its next render: the plugin builds the table from the
 * code block of the note, and only Obsidian can ask a note to render again.
 */
export class ProcessTrackerSettingTab extends PluginSettingTab {
	constructor(
		app: App,
		private readonly plugin: ProcessTrackerPlugin,
	) {
		super(app, plugin);
	}

	display(): void {
		this.containerEl.empty();

		new Setting(this.containerEl)
			.setName("Track tag")
			.setDesc(
				"Only notes with this tag become tracks. The # is optional, and nested " +
					"tags count: process_tracker/health matches process_tracker.",
			)
			.addText((text) =>
				text
					.setPlaceholder(DEFAULT_SETTINGS.trackTag)
					.setValue(this.plugin.settings.trackTag)
					.onChange(async (value) => {
						this.plugin.settings.trackTag = normalizeTrackTag(value);
						await this.plugin.saveSettings();
					}),
			);

		new Setting(this.containerEl)
			.setName("Entry folder")
			.setDesc(
				"Folder for new entry notes. Empty means the vault root; a template that " +
					"moves the note decides for itself.",
			)
			.addText((text) =>
				text
					.setPlaceholder("Vault root")
					.setValue(this.plugin.settings.evidenceFolder)
					.onChange(async (value) => {
						this.plugin.settings.evidenceFolder = normalizeEvidenceFolder(value);
						await this.plugin.saveSettings();
					}),
			);
	}
}
