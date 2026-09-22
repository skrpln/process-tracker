// Process Tracker — the settings tab of the plugin ([[architecture]]).
// Adapter module: describes two fields and writes them into the settings, nothing else.

import { PluginSettingTab, Setting } from "obsidian";
import type { App, SettingDefinitionItem } from "obsidian";
import type ProcessTrackerPlugin from "./main.ts";
import { DEFAULT_SETTINGS, normalizeEntryFolder, normalizeTrackTag } from "./settings.ts";
import type { ProcessTrackerSettings } from "./settings.ts";

/** One field of the tab: what it is called, what it says, how a typed value is cleaned up. */
interface Field {
	key: keyof ProcessTrackerSettings;
	name: string;
	desc: string;
	placeholder: string;
	normalize: (value: unknown) => string;
}

/** The two settings of [[expectation]] §10: the tag of a track card, the folder of entries. */
const FIELDS: readonly Field[] = [
	{
		key: "trackTag",
		name: "Track tag",
		desc:
			"Only notes with this tag become tracks. The # is optional, and nested " +
			"tags count: process_tracker/health matches process_tracker.",
		placeholder: DEFAULT_SETTINGS.trackTag,
		normalize: normalizeTrackTag,
	},
	{
		key: "entryFolder",
		name: "Entry folder",
		desc:
			"Folder for new entry notes. Empty means the vault root; a template that " +
			"moves the note decides for itself.",
		placeholder: "Vault root",
		normalize: normalizeEntryFolder,
	},
];

/**
 * Every keystroke is cleaned up and saved — Obsidian has no Save button, and a settings tab
 * that loses what was typed is worse than none.
 *
 * The fields are described once and drawn two ways. Obsidian 1.13 and later draw them from
 * `getSettingDefinitions` and find them in the search of the settings window; an older
 * Obsidian calls `display`, which draws the same fields by hand.
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

	getSettingDefinitions(): SettingDefinitionItem[] {
		return FIELDS.map(
			(field): SettingDefinitionItem => ({
				name: field.name,
				desc: field.desc,
				control: { type: "text", key: field.key, placeholder: field.placeholder },
			}),
		);
	}

	getControlValue(key: string): unknown {
		const field = fieldOf(key);
		return field === undefined ? undefined : this.plugin.settings[field.key];
	}

	async setControlValue(key: string, value: unknown): Promise<void> {
		const field = fieldOf(key);
		if (field === undefined) return;
		this.plugin.settings[field.key] = field.normalize(value);
		await this.plugin.saveSettings();
	}

	display(): void {
		this.containerEl.empty();
		for (const field of FIELDS) {
			new Setting(this.containerEl)
				.setName(field.name)
				.setDesc(field.desc)
				.addText((text) =>
					text
						.setPlaceholder(field.placeholder)
						.setValue(this.plugin.settings[field.key])
						.onChange((value) => this.setControlValue(field.key, value)),
				);
		}
	}
}

function fieldOf(key: string): Field | undefined {
	return FIELDS.find((field) => field.key === key);
}
