// Process Tracker — the settings tab of the plugin ([[architecture]]).
// Adapter module: describes three fields and writes them into the settings, nothing else.

import { PluginSettingTab, Setting } from "obsidian";
import type { App, SettingDefinitionItem } from "obsidian";
import type ProcessTrackerPlugin from "./main.ts";
import type { EntriesMode } from "./model/types.ts";
import {
	DEFAULT_SETTINGS,
	normalizeEntriesMode,
	normalizeEntryFolder,
	normalizeTrackTag,
} from "./settings.ts";
import type { ProcessTrackerSettings } from "./settings.ts";

/** One field of the tab: what it is called, what it says, how a value is cleaned up. */
interface FieldBase {
	key: keyof ProcessTrackerSettings;
	name: string;
	desc: string;
	normalize: (value: unknown) => string;
}

interface TextField extends FieldBase {
	type: "text";
	placeholder: string;
}

interface DropdownField extends FieldBase {
	type: "dropdown";
	/** Stored value -> what the reader sees. */
	options: Record<string, string>;
}

type Field = TextField | DropdownField;

/** The words the dropdown of the mode shows; the keys are what `data.json` stores. */
const ENTRIES_OPTIONS: Record<EntriesMode, string> = {
	notes: "Separate notes",
	journal: "Records in the track journal",
};

/**
 * The settings of [[expectation]] §10: the tag of a track card, the folder of entries, and how
 * new entries are made.
 */
const FIELDS: readonly Field[] = [
	{
		type: "text",
		key: "trackTag",
		name: "Track tag",
		desc:
			"Only notes with this tag become tracks. The # is optional, and nested " +
			"tags count: process_tracker/health matches process_tracker.",
		placeholder: DEFAULT_SETTINGS.trackTag,
		normalize: normalizeTrackTag,
	},
	{
		type: "text",
		key: "entryFolder",
		name: "Entry folder",
		desc:
			"Folder for new entry notes. Empty means the vault root; a template that " +
			"moves the note decides for itself.",
		placeholder: "Vault root",
		normalize: normalizeEntryFolder,
	},
	{
		type: "dropdown",
		key: "entries",
		name: "New entries",
		desc:
			"How a click makes an entry: a note of its own, or a record in the journal of " +
			"the track. The entries property of a track card and of a code block override it.",
		options: ENTRIES_OPTIONS,
		normalize: normalizeEntriesMode,
	},
];

/**
 * Every change is cleaned up and saved — Obsidian has no Save button, and a settings tab
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
				control:
					field.type === "text"
						? { type: "text", key: field.key, placeholder: field.placeholder }
						: { type: "dropdown", key: field.key, options: field.options },
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
		// Each field cleans its own value, so the value fits the key it came with.
		(this.plugin.settings as unknown as Record<string, string>)[field.key] = field.normalize(value);
		await this.plugin.saveSettings();
	}

	display(): void {
		this.containerEl.empty();
		for (const field of FIELDS) {
			const setting = new Setting(this.containerEl).setName(field.name).setDesc(field.desc);
			const value = this.plugin.settings[field.key];
			const save = (changed: string) => this.setControlValue(field.key, changed);

			if (field.type === "text") {
				setting.addText((text) =>
					text.setPlaceholder(field.placeholder).setValue(value).onChange(save),
				);
			} else {
				setting.addDropdown((dropdown) =>
					dropdown.addOptions(field.options).setValue(value).onChange(save),
				);
			}
		}
	}
}

function fieldOf(key: string): Field | undefined {
	return FIELDS.find((field) => field.key === key);
}
