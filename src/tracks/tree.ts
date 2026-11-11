// Process Tracker — the tree of tracks: which track stands under which ([[nested-tracks]]).
// Pure module: no Obsidian API, covered by test/tree.test.ts.

/** A track card as the tree sees it: its path, and the notes its `track` property links to. */
export interface TrackLinks {
	path: string;
	/** The paths those links lead to. Not every one is a track: the tree keeps the ones that are. */
	parents: readonly string[];
}

/**
 * The tracks as a tree ([[expectation]] §12). A card links to its parent and a parent keeps no
 * list of its children, so the tree is read off the children.
 */
export interface TrackTree {
	/** The children of every track that has any, in the order the tracks were given. */
	children: ReadonlyMap<string, readonly string[]>;
	/** Where each track stood in that order: what stands below a track is listed by it. */
	order: ReadonlyMap<string, number>;
}

/** The answer for a track nothing stands under; shared, so a lookup allocates nothing. */
const NO_TRACKS: readonly string[] = Object.freeze([]);

/**
 * Builds the tree from the cards and the links of their `track` property.
 *
 * Only a track is a parent: a link that leads to a note outside `tracks` is the link of an
 * entry to its track, or of nothing the tree knows, and is left out. A card that links to
 * itself is not its own child, and a parent named twice is one parent.
 *
 * The order of `tracks` is the order of everything the tree answers with — the caller hands
 * them in sorted the way its table is ([[nested-tracks]]).
 */
export function buildTrackTree(tracks: readonly TrackLinks[]): TrackTree {
	const order = new Map<string, number>();
	tracks.forEach((track, index) => {
		if (!order.has(track.path)) order.set(track.path, index);
	});

	const children = new Map<string, string[]>();
	for (const track of tracks) {
		for (const parent of track.parents) {
			if (parent === track.path || !order.has(parent)) continue;

			const known = children.get(parent);
			if (known === undefined) children.set(parent, [track.path]);
			else if (!known.includes(track.path)) known.push(track.path);
		}
	}
	return { children, order };
}

/** The tracks that link straight to this one. */
export function childrenOf(tree: TrackTree, path: string): readonly string[] {
	return tree.children.get(path) ?? NO_TRACKS;
}

/**
 * Everything below a track: its children, their children and so on, each once, in the order
 * the tracks were given.
 *
 * Links that run in a circle are cut where they come back: a track already met is not entered
 * again, and the track asked about is never its own descendant ([[expectation]] §11).
 */
export function descendantsOf(tree: TrackTree, path: string): string[] {
	const met = new Set<string>([path]);
	const found: string[] = [];
	const queue = [path];
	for (let next = 0; next < queue.length; next++) {
		for (const child of childrenOf(tree, queue[next])) {
			if (met.has(child)) continue;
			met.add(child);
			found.push(child);
			queue.push(child);
		}
	}
	return found.sort((left, right) => (tree.order.get(left) ?? 0) - (tree.order.get(right) ?? 0));
}
