// Unit tests for the tree of tracks: children, descendants, circles.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildTrackTree, childrenOf, descendantsOf } from "../src/tracks/tree.ts";
import type { TrackLinks } from "../src/tracks/tree.ts";

function track(path: string, ...parents: string[]): TrackLinks {
	return { path, parents };
}

/** Home → harmony → two tasks; Home → purchases. Given in the order a table would sort them. */
const HOME = [
	track("bedding.md", "harmony.md"),
	track("dusting.md", "harmony.md"),
	track("harmony.md", "home.md"),
	track("home.md"),
	track("purchases.md", "home.md"),
];

describe("buildTrackTree", () => {
	it("reads the children off the links of the cards", () => {
		const tree = buildTrackTree(HOME);
		assert.deepEqual(childrenOf(tree, "home.md"), ["harmony.md", "purchases.md"]);
		assert.deepEqual(childrenOf(tree, "harmony.md"), ["bedding.md", "dusting.md"]);
	});

	it("answers with nothing for a track nothing stands under", () => {
		const tree = buildTrackTree(HOME);
		assert.deepEqual(childrenOf(tree, "dusting.md"), []);
		assert.deepEqual(childrenOf(tree, "no such track.md"), []);
	});

	it("keeps the children in the order the tracks were given", () => {
		const tree = buildTrackTree([
			track("b.md", "root.md"),
			track("root.md"),
			track("a.md", "root.md"),
		]);
		assert.deepEqual(childrenOf(tree, "root.md"), ["b.md", "a.md"]);
	});

	it("takes a track with several parents as a child of each", () => {
		const tree = buildTrackTree([
			track("a.md"),
			track("b.md"),
			track("shared.md", "a.md", "b.md"),
		]);
		assert.deepEqual(childrenOf(tree, "a.md"), ["shared.md"]);
		assert.deepEqual(childrenOf(tree, "b.md"), ["shared.md"]);
	});

	it("leaves out a link to a note that is no track", () => {
		const tree = buildTrackTree([track("task.md", "project note.md"), track("home.md")]);
		assert.equal(tree.children.size, 0);
	});

	it("does not make a track its own child", () => {
		const tree = buildTrackTree([track("home.md", "home.md")]);
		assert.deepEqual(childrenOf(tree, "home.md"), []);
	});

	it("counts a parent named twice once", () => {
		const tree = buildTrackTree([track("home.md"), track("task.md", "home.md", "home.md")]);
		assert.deepEqual(childrenOf(tree, "home.md"), ["task.md"]);
	});
});

describe("descendantsOf", () => {
	it("gathers the children, their children and so on", () => {
		const tree = buildTrackTree(HOME);
		assert.deepEqual(descendantsOf(tree, "home.md"), [
			"bedding.md",
			"dusting.md",
			"harmony.md",
			"purchases.md",
		]);
		assert.deepEqual(descendantsOf(tree, "harmony.md"), ["bedding.md", "dusting.md"]);
	});

	it("answers with nothing for a track with no children", () => {
		assert.deepEqual(descendantsOf(buildTrackTree(HOME), "purchases.md"), []);
	});

	it("lists them in the order the tracks were given, whatever the depth", () => {
		const tree = buildTrackTree([
			track("z-leaf.md", "middle.md"),
			track("root.md"),
			track("middle.md", "root.md"),
			track("a-leaf.md", "middle.md"),
		]);
		assert.deepEqual(descendantsOf(tree, "root.md"), ["z-leaf.md", "middle.md", "a-leaf.md"]);
	});

	it("names a track reached by two ways once", () => {
		const tree = buildTrackTree([
			track("a.md", "root.md"),
			track("b.md", "root.md"),
			track("root.md"),
			track("shared.md", "a.md", "b.md"),
		]);
		assert.deepEqual(descendantsOf(tree, "root.md"), ["a.md", "b.md", "shared.md"]);
	});

	it("cuts links that run in a circle", () => {
		const tree = buildTrackTree([track("a.md", "b.md"), track("b.md", "a.md")]);
		assert.deepEqual(descendantsOf(tree, "a.md"), ["b.md"]);
		assert.deepEqual(descendantsOf(tree, "b.md"), ["a.md"]);
	});

	it("never makes a track its own descendant, however long the circle", () => {
		const tree = buildTrackTree([
			track("a.md", "c.md"),
			track("b.md", "a.md"),
			track("c.md", "b.md"),
			track("leaf.md", "c.md"),
		]);
		assert.deepEqual(descendantsOf(tree, "a.md"), ["b.md", "c.md", "leaf.md"]);
		assert.deepEqual(descendantsOf(tree, "c.md"), ["a.md", "b.md", "leaf.md"]);
	});
});
