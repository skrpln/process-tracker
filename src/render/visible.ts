// Process Tracker — which date columns the reader sees, and which year owns them.
// Pure arithmetic: no DOM, covered by test/visible.test.ts.

export interface ViewportMetrics {
	/** Horizontal scroll offset of the container. */
	scrollLeft: number;
	/** Inner width of the container: all of it shows date columns. */
	viewWidth: number;
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
 * Indices of the date columns in sight. A column counts as visible as soon as any part
 * of it shows. Returns `null` when there is nothing to look at.
 */
export function visibleColumnRange(metrics: ViewportMetrics): ColumnRange | null {
	const { scrollLeft, viewWidth, columnWidth, total } = metrics;
	if (columnWidth <= 0 || total <= 0 || viewWidth <= 0) return null;

	// Column i covers [i * columnWidth, (i + 1) * columnWidth) of the scrolling frame.
	const first = clamp(Math.floor(scrollLeft / columnWidth), 0, total - 1);
	const last = clamp(Math.ceil((scrollLeft + viewWidth) / columnWidth) - 1, first, total - 1);
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

/** What a date column has to hold, measured on the table the theme has laid out. */
export interface ColumnMetrics {
	/** Height of a row: the width that makes the cell square. */
	rowHeight: number;
	/** Checkbox of a cell, with the padding and borders the theme gives the cell. */
	checkbox: number;
	/** Day caption of the head, with the padding and borders of its cell. */
	caption: number;
}

/**
 * Width a date column must take, or `null` when nothing needs to change: the table is
 * not laid out yet, or the difference is under half a pixel.
 *
 * The square is the aim, not the rule. A theme decides the size of a checkbox and the
 * padding of a cell, and both live inside the column: Terminal, for one, gives a
 * checkbox six and a half character widths, and Ultra Lobster pads a cell by twenty
 * pixels on each side. So the column takes the largest of the three claims on it —
 * a cell may be wider than it is tall, never narrower, and nothing inside it is cut.
 *
 * Fitting the caption is also what keeps it readable: Obsidian clips an overflowing
 * caption with an ellipsis (`thead > tr > th { text-overflow: ellipsis }`), and a
 * column wide enough for the caption never lets that rule fire.
 */
export function columnWidth(metrics: ColumnMetrics, current: number | null): number | null {
	const claims = [metrics.rowHeight, metrics.checkbox, metrics.caption].filter(
		(value) => Number.isFinite(value) && value > 0,
	);
	if (claims.length === 0) return null;

	const width = Math.round(Math.max(...claims) * 100) / 100;
	if (current !== null && Math.abs(width - current) < 0.5) return null;
	return width;
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(Math.max(value, min), max);
}
