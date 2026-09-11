// Process Tracker — where a month caption sits while the table scrolls.
// Pure geometry: no DOM, covered by test/label-position.test.ts.

export interface LabelGeometry {
	/** Left and right edges of the merged month cell, in any single coordinate system. */
	cellLeft: number;
	cellRight: number;
	/** Edges of the area the reader actually sees: between the pinned column and the right edge. */
	viewLeft: number;
	viewRight: number;
	labelWidth: number;
}

/**
 * Offset of the caption from the left edge of its cell, so that the caption stays
 * centred in the visible part of that cell and never leaves the cell.
 * Returns 0 when the cell is out of sight — the caption is hidden anyway.
 */
export function labelOffset(geometry: LabelGeometry): number {
	const { cellLeft, cellRight, viewLeft, viewRight, labelWidth } = geometry;

	const visibleLeft = Math.max(cellLeft, viewLeft);
	const visibleRight = Math.min(cellRight, viewRight);
	if (visibleRight <= visibleLeft) return 0;

	const centred = (visibleLeft + visibleRight) / 2 - labelWidth / 2;
	const rightmost = cellRight - labelWidth;
	if (rightmost <= cellLeft) return 0;

	return clamp(centred, cellLeft, rightmost) - cellLeft;
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(Math.max(value, min), max);
}
