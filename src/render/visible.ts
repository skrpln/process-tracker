// Process Tracker — which date columns the reader sees, and which year owns them.
// Pure arithmetic: no DOM, covered by test/visible.test.ts.

export interface ViewportMetrics {
	/** Horizontal scroll offset of the container. */
	scrollLeft: number;
	/** Inner width of the container. */
	viewWidth: number;
	/** Width of the pinned first column, which covers the left edge of the view. */
	pinnedWidth: number;
	/** Width of one date column; they are all equal. */
	columnWidth: number;
	/** How many date columns the table has. */
	total: number;
}

export interface ColumnRange {
	first: number;
	last: number;
}

/**
 * Indices of the date columns that show up in the visible strip, the pinned column
 * excluded. A column counts as visible as soon as any part of it is in sight.
 * Returns `null` when there is nothing to look at.
 */
export function visibleColumnRange(metrics: ViewportMetrics): ColumnRange | null {
	const { scrollLeft, viewWidth, pinnedWidth, columnWidth, total } = metrics;
	if (columnWidth <= 0 || total <= 0) return null;

	const stripWidth = viewWidth - pinnedWidth;
	if (stripWidth <= 0) return null;

	// Column i covers [i * columnWidth, (i + 1) * columnWidth) once the pinned
	// column is subtracted from both the columns and the viewport.
	const first = clamp(Math.floor(scrollLeft / columnWidth), 0, total - 1);
	const last = clamp(Math.ceil((scrollLeft + stripWidth) / columnWidth) - 1, first, total - 1);
	return { first, last };
}

/**
 * The caption to show above the pinned column, chosen from the captions of the
 * visible columns.
 *
 * At the left edge of the table the first column is in sight, and its caption is the
 * answer — otherwise an exact half-and-half split would leave the caption on the
 * month the reader scrolled away from. Everywhere else the majority rule applies.
 */
export function captionLabel(labels: string[], current: string, atStart: boolean): string {
	if (atStart && labels.length > 0) return labels[0];
	return dominantLabel(labels, current);
}

/**
 * The caption that owns the visible columns: the one taking strictly more than half
 * of them. Until another one crosses that half, the caption keeps what it already
 * shows — so it does not flicker around the boundary.
 */
export function dominantLabel(labels: string[], current: string): string {
	if (labels.length === 0) return current;

	const counts = new Map<string, number>();
	for (const label of labels) counts.set(label, (counts.get(label) ?? 0) + 1);

	for (const [label, count] of counts) {
		if (count * 2 > labels.length) return label;
	}
	return current;
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(Math.max(value, min), max);
}
