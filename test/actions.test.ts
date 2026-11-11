// Unit tests for the interaction table of a cell.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cellAction, clickAction } from "../src/entry/actions.ts";

describe("cellAction", () => {
	it("starts a draft on an empty day", () => {
		assert.deepEqual(cellAction("empty", 0, "open"), { kind: "create", done: false });
	});

	it("starts a done note on an empty day when asked for the status", () => {
		assert.deepEqual(cellAction("empty", 0, "status"), { kind: "create", done: true });
	});

	it("opens the note of a draft", () => {
		assert.deepEqual(cellAction("draft", 1, "open"), { kind: "open" });
	});

	it("opens the note of a done day", () => {
		assert.deepEqual(cellAction("done", 1, "open"), { kind: "open" });
	});

	it("checks a draft when asked for the status", () => {
		assert.deepEqual(cellAction("draft", 1, "status"), { kind: "toggle", done: true });
	});

	it("unchecks a done day when asked for the status", () => {
		assert.deepEqual(cellAction("done", 1, "status"), { kind: "toggle", done: false });
	});

	it("opens nothing on a day that holds several entries", () => {
		assert.deepEqual(cellAction("draft", 2, "open"), { kind: "nothing" });
		assert.deepEqual(cellAction("done", 3, "open"), { kind: "nothing" });
	});

	it("closes the whole day while one entry is open", () => {
		assert.deepEqual(cellAction("draft", 2, "status"), { kind: "toggleDay", done: true });
	});

	it("opens the whole day when every entry is closed", () => {
		assert.deepEqual(cellAction("done", 2, "status"), { kind: "toggleDay", done: false });
	});
});

describe("clickAction", () => {
	it("gives the plain click the action the settings name", () => {
		assert.equal(clickAction("open", false), "open");
		assert.equal(clickAction("status", false), "status");
	});

	it("gives the click with the modifier the other of the two", () => {
		assert.equal(clickAction("open", true), "status");
		assert.equal(clickAction("status", true), "open");
	});

	it("keeps the table of a cell one for both gestures", () => {
		// A checklist set to close by a plain click: the plain click checks, the modifier opens.
		assert.deepEqual(cellAction("draft", 1, clickAction("status", false)), {
			kind: "toggle",
			done: true,
		});
		assert.deepEqual(cellAction("draft", 1, clickAction("status", true)), { kind: "open" });
	});
});
