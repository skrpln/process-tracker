// Process Tracker — keeps every month caption inside the visible part of its cell.

import { labelOffset } from "./label-position.ts";

/**
 * One pass over the captions of a rendered table. Reads geometry first and writes
 * transforms after, so the browser lays out once per frame.
 */
export function syncMonthLabels(scroll: HTMLElement): void {
	const labels = Array.from(
		scroll.querySelectorAll<HTMLElement>(".process-tracker__month-label"),
	);
	if (labels.length === 0) return;

	const view = scroll.getBoundingClientRect();
	const corner = scroll.querySelector<HTMLElement>(".process-tracker__corner");
	const viewLeft = view.left + (corner?.getBoundingClientRect().width ?? 0);

	const offsets = labels.map((label) => {
		const cell = label.parentElement;
		if (cell === null) return 0;
		const rect = cell.getBoundingClientRect();
		return labelOffset({
			cellLeft: rect.left,
			cellRight: rect.right,
			viewLeft,
			viewRight: view.right,
			labelWidth: label.offsetWidth,
		});
	});

	labels.forEach((label, index) => {
		label.style.transform = `translateX(${Math.round(offsets[index])}px)`;
	});
}
