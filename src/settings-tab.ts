// Process Tracker — the settings tab of the plugin ([[architecture]]).
// Adapter module: describes the fields and writes them into the settings, nothing else.

import { PluginSettingTab, Setting } from "obsidian";
import type { App, SettingDefinitionItem } from "obsidian";
import type ProcessTrackerPlugin from "./main.ts";
import { DEFAULT_PROPERTY_NAMES } from "./constants.ts";
import type { EntriesMode, NamesAlign, PropertyNames } from "./model/types.ts";
import {
	DEFAULT_SETTINGS,
	normalizeAlign,
	normalizeEntriesMode,
	normalizeEntryFolder,
	normalizePropertyName,
	normalizeTrackTag,
} from "./settings.ts";
import type { ProcessTrackerSettings } from "./settings.ts";

/** One field of the tab: what it is called, what it says, how a value is cleaned up. */
interface FieldBase {
	key: Exclude<keyof ProcessTrackerSettings, "properties">;
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

/** The words the dropdown of the alignment shows; the keys are what `data.json` stores. */
const ALIGN_OPTIONS: Record<NamesAlign, string> = {
	left: "Left",
	center: "Center",
	right: "Right",
};

/**
 * The settings of [[expectation]] §10: the tag of a track card, the folder of entries, how new
 * entries are made, and how the first column stands.
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
	{
		type: "dropdown",
		key: "align",
		name: "First column alignment",
		desc:
			"How the track names and the corner title stand in their column. The align " +
			"parameter of a code block overrides it.",
		options: ALIGN_OPTIONS,
		normalize: normalizeAlign,
	},
];

/** One property whose name can be set, and what the reader is told about it. */
interface PropertyField {
	key: keyof PropertyNames;
	desc: string;
}

/**
 * The properties of [[expectation]] §10, in two groups: those of an entry note and those of a
 * track card. A field is called by the default name of its property and shows that name while
 * it is empty — an empty field means the default.
 */
const PROPERTY_GROUPS: readonly { heading: string; fields: readonly PropertyField[] }[] = [
	{
		heading: "Entry properties",
		fields: [
			{
				key: "track",
				desc:
					"Links an entry note to its track, and a track to its parent track: one " +
					"link, or a list of them.",
			},
			{ key: "done", desc: "Checks the day: true or false." },
			{
				key: "created",
				desc: "The day an entry was made. A click on a cell writes the day of that cell.",
			},
			{
				key: "closed",
				desc:
					"The day and time an entry was closed: written when the entry is checked, " +
					"removed when it is unchecked.",
			},
			{
				key: "date",
				desc:
					"The day of an entry made by an earlier version. It stands in for created " +
					"and closed where those are missing.",
			},
			{ key: "mark", desc: "One sign a checked day shows instead of its checkmark." },
		],
	},
	{
		heading: "Track properties",
		fields: [
			{ key: "trackName", desc: "Row title of a track; the file name otherwise." },
			{ key: "trackColor", desc: "Color of the checkmarks of a track." },
			{ key: "template", desc: "Links a track to the template of its new entries." },
			{ key: "entries", desc: "How a click makes an entry of a track: notes or journal." },
			{ key: "journal", desc: "Links a track to its journal." },
		],
	},
];

/** What the key of a control starts with when the control names a property. */
const PROPERTY_PREFIX = "properties.";

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
		const fields = FIELDS.map(
			(field): SettingDefinitionItem => ({
				name: field.name,
				desc: field.desc,
				control:
					field.type === "text"
						? { type: "text", key: field.key, placeholder: field.placeholder }
						: { type: "dropdown", key: field.key, options: field.options },
			}),
		);
		const groups = PROPERTY_GROUPS.map(
			(group): SettingDefinitionItem => ({
				type: "group",
				heading: group.heading,
				items: group.fields.map((field) => ({
					name: DEFAULT_PROPERTY_NAMES[field.key],
					desc: field.desc,
					control: {
						type: "text",
						key: PROPERTY_PREFIX + field.key,
						placeholder: DEFAULT_PROPERTY_NAMES[field.key],
					},
				})),
			}),
		);
		return [...fields, ...groups];
	}

	getControlValue(key: string): unknown {
		const property = propertyOf(key);
		if (property !== undefined) return this.plugin.settings.properties[property];

		const field = fieldOf(key);
		return field === undefined ? undefined : this.plugin.settings[field.key];
	}

	async setControlValue(key: string, value: unknown): Promise<void> {
		const property = propertyOf(key);
		if (property !== undefined) {
			// A new object, not a changed one: the defaults must stay what they are.
			this.plugin.settings.properties = {
				...this.plugin.settings.properties,
				[property]: normalizePropertyName(value, property),
			};
			await this.plugin.saveSettings();
			return;
		}

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

		for (const group of PROPERTY_GROUPS) {
			new Setting(this.containerEl).setName(group.heading).setHeading();
			for (const field of group.fields) {
				const name = DEFAULT_PROPERTY_NAMES[field.key];
				new Setting(this.containerEl)
					.setName(name)
					.setDesc(field.desc)
					.addText((text) =>
						text
							.setPlaceholder(name)
							.setValue(this.plugin.settings.properties[field.key])
							.onChange((changed) =>
								this.setControlValue(PROPERTY_PREFIX + field.key, changed),
							),
					);
			}
		}
	}
}

function fieldOf(key: string): Field | undefined {
	return FIELDS.find((field) => field.key === key);
}

/** The property a control names, or `undefined` when the key is one of the plain fields. */
function propertyOf(key: string): keyof PropertyNames | undefined {
	if (!key.startsWith(PROPERTY_PREFIX)) return undefined;
	const name = key.slice(PROPERTY_PREFIX.length);
	return Object.prototype.hasOwnProperty.call(DEFAULT_PROPERTY_NAMES, name)
		? (name as keyof PropertyNames)
		: undefined;
}
