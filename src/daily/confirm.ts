// Process Tracker — the question asked before a journal is created ([[daily-notes]]).

import { Modal, Setting } from "obsidian";
import type { App } from "obsidian";

/**
 * Asks whether to create the journal at this path, and answers with the choice. Closing the
 * window any other way — Escape, a click beside it — is a no.
 */
export function confirmJournal(app: App, path: string): Promise<boolean> {
	return new Promise((resolve) => {
		new JournalModal(app, path, resolve).open();
	});
}

/**
 * A window of Obsidian's own, so the theme dresses it as it dresses every other question the
 * app asks. The path is shown in full: with `daily_note_dir` the journal goes somewhere other
 * than the daily notes folder, and the reader sees where before it is there.
 */
class JournalModal extends Modal {
	private answered = false;

	constructor(
		app: App,
		private readonly path: string,
		private readonly answer: (create: boolean) => void,
	) {
		super(app);
	}

	onOpen(): void {
		this.titleEl.setText("Create daily note");
		this.contentEl.createEl("p", { text: `There is no ${this.path} yet. Create it?` });

		new Setting(this.contentEl)
			.addButton((button) =>
				button
					.setButtonText("Create")
					.setCta()
					.onClick(() => this.choose(true)),
			)
			.addButton((button) => button.setButtonText("Cancel").onClick(() => this.choose(false)));

		// Enter says yes, as the button that is lit up promises — unless a button has the
		// focus: then Enter is that button's, and Tab to Cancel followed by Enter is a no.
		this.scope.register([], "Enter", (event: KeyboardEvent) => {
			if ((event.target as HTMLElement | null)?.tagName === "BUTTON") return true;
			this.choose(true);
			return false;
		});
	}

	onClose(): void {
		this.contentEl.empty();
		if (!this.answered) this.answer(false);
	}

	private choose(create: boolean): void {
		this.answered = true;
		this.answer(create);
		this.close();
	}
}
