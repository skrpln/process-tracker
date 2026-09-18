// Unit tests for the interaction table of a cell.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cellAction } from "../src/entry/actions.ts";

describe("cellAction", () => {
	it("starts a draft on an empty day", () => {
		assert.deepEqual(cellAction("empty", 0, false), { kind: "create", done: false });
	});

	it("starts a done note on an empty day with the modifier", () => {
		assert.deepEqual(cellAction("empty", 0, true), { kind: "create", done: true });
	});

	it("opens the note of a draft", () => {
		assert.deepEqual(cellAction("draft", 1, false), { kind: "open" });
	});

	it("opens the note of a done day", () => {
		assert.deepEqual(cellAction("done", 1, false), { kind: "open" });
	});

	it("checks a draft with the modifier", () => {
		assert.deepEqual(cellAction("draft", 1, true), { kind: "toggle", done: true });
	});

	it("unchecks a done day with the modifier", () => {
		assert.deepEqual(cellAction("done", 1, true), { kind: "toggle", done: false });
	});

	it("does nothing on a day that holds several entries", () => {
		assert.deepEqual(cellAction("draft", 2, false), { kind: "nothing" });
		assert.deepEqual(cellAction("done", 3, false), { kind: "nothing" });
	});

	it("closes the whole day with the modifier while one entry is open", () => {
		assert.deepEqual(cellAction("draft", 2, true), { kind: "toggleDay", done: true });
	});

	it("opens the whole day with the modifier when every entry is closed", () => {
		assert.deepEqual(cellAction("done", 2, true), { kind: "toggleDay", done: false });
	});
});
