// Unit tests for splitting the `track` value into a source and a condition.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { splitTrackQuery } from "../src/tracks/query.ts";

describe("splitTrackQuery", () => {
	it("reports nothing for a filter that is not set", () => {
		assert.deepEqual(splitTrackQuery(null), { source: null, condition: null });
	});

	it("reads a source after FROM", () => {
		assert.deepEqual(splitTrackQuery('FROM "folder"'), {
			source: '("folder")',
			condition: null,
		});
	});

	it("reads a bare expression as a source", () => {
		assert.deepEqual(splitTrackQuery("#health"), { source: "(#health)", condition: null });
	});

	it("splits a source from a condition", () => {
		assert.deepEqual(splitTrackQuery('FROM "folder" WHERE priority > 2'), {
			source: '("folder")',
			condition: "(priority > 2)",
		});
	});

	it("reads a condition without a source", () => {
		assert.deepEqual(splitTrackQuery("WHERE done"), { source: null, condition: "(done)" });
	});

	it("ignores the case of the keywords", () => {
		assert.deepEqual(splitTrackQuery('from "folder" where done'), {
			source: '("folder")',
			condition: "(done)",
		});
	});

	it("joins repeated clauses with and, each part in its own parentheses", () => {
		assert.deepEqual(splitTrackQuery('FROM "a" FROM #b WHERE x WHERE y'), {
			source: '("a") and (#b)',
			condition: "(x) and (y)",
		});
	});

	it("keeps a keyword that sits inside a quoted string", () => {
		assert.deepEqual(splitTrackQuery('FROM "where I live"'), {
			source: '("where I live")',
			condition: null,
		});
	});

	it("keeps a keyword that is part of a longer word", () => {
		assert.deepEqual(splitTrackQuery("FROM #wherever"), {
			source: "(#wherever)",
			condition: null,
		});
	});

	it("keeps a keyword that sits inside brackets", () => {
		assert.deepEqual(splitTrackQuery('FROM outgoing([[where to go]]) WHERE contains(tags, "a")'), {
			source: "(outgoing([[where to go]]))",
			condition: '(contains(tags, "a"))',
		});
	});

	it("does not split an expression that merely contains or, and, not", () => {
		assert.deepEqual(splitTrackQuery("#a or #b and -#c"), {
			source: "(#a or #b and -#c)",
			condition: null,
		});
	});

	it("drops an empty clause", () => {
		assert.deepEqual(splitTrackQuery("FROM   WHERE done"), { source: null, condition: "(done)" });
	});

	it("reports nothing for a filter made of keywords alone", () => {
		assert.deepEqual(splitTrackQuery("  FROM  "), { source: null, condition: null });
	});

	it("trims the parts", () => {
		assert.deepEqual(splitTrackQuery('  FROM   "folder"   WHERE   done  '), {
			source: '("folder")',
			condition: "(done)",
		});
	});
});
