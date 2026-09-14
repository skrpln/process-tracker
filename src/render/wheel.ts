// Process Tracker — the wheel over the table, turned into horizontal scrolling.
// Pure arithmetic: no DOM, covered by test/wheel.test.ts.

/** Pixels one line is worth when a wheel event counts in lines instead of pixels. */
const LINE_PIXELS = 16;

/** The part of a `WheelEvent` the arithmetic needs. */
export interface WheelGesture {
	deltaX: number;
	deltaY: number;
	/** How the deltas count: 0 — pixels, 1 — lines, 2 — pages. */
	deltaMode: number;
}

/**
 * How far the table scrolls sideways for one gesture of the wheel.
 *
 * The stronger axis wins: a trackpad swipes sideways, a mouse has one wheel and turns it
 * vertically — over the table both mean the columns, and a mouse has no other way to reach
 * them ([[rendering]]). Lines and pages are converted to pixels, because a wheel does not
 * count in pixels on every platform.
 */
export function wheelScroll(gesture: WheelGesture, viewWidth: number): number {
	const { deltaX, deltaY, deltaMode } = gesture;
	const delta = Math.abs(deltaX) >= Math.abs(deltaY) ? deltaX : deltaY;
	if (!Number.isFinite(delta) || delta === 0) return 0;

	if (deltaMode === 1) return delta * LINE_PIXELS;
	if (deltaMode === 2) return Number.isFinite(viewWidth) ? delta * Math.max(viewWidth, 0) : 0;
	return delta;
}
