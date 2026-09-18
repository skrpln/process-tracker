// Unit tests for the interaction table of a cell.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cellAction } from "../src/entry/actions.ts";

describe("cellAction", () => {
	it("starts a draft on an empty day", () => {
		assert.deepEqual(cellAction("empty", false), { kind: "create", done: false });
	});

	it("starts a done note on an empty day with the modifier", () => {
		assert.deepEqual(cellAction("empty", true), { kind: "create", done: true });
	});

	it("opens the note of a draft", () => {
		assert.deepEqual(cellAction("draft", false), { kind: "open" });
	});

	it("opens the note of a done day", () => {
		assert.deepEqual(cellAction("done", false), { kind: "open" });
	});

	it("checks a draft with the modifier", () => {
		assert.deepEqual(cellAction("draft", true), { kind: "toggle", done: true });
	});

	it("unchecks a done day with the modifier", () => {
		assert.deepEqual(cellAction("done", true), { kind: "toggle", done: false });
	});
});
