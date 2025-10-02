import { getHostnameAndPathComponents } from './utils';

export type PathNode = {
  [key: string]: PathNode;
};

export type PathTrie = Record<string, PathNode>;

const isTerminal = (node: PathNode): boolean => {
  return Object.keys(node).length === 0;
};

/**
 * Insert a URL into the trie.
 *
 * @param url - The URL to insert into the trie.
 * @param pathTrie - The trie to insert the URL into.
 */
export const insertToTrie = (url: string, pathTrie: PathTrie) => {
  const { hostname, pathComponents } = getHostnameAndPathComponents(url);

  if (pathComponents.length === 0 || !hostname) {
    return;
  }

  const lowerHostname = hostname.toLowerCase();
  if (!pathTrie[lowerHostname]) {
    pathTrie[lowerHostname] = {} as PathNode;
  }

  let curr: PathNode = pathTrie[lowerHostname];
  for (let i = 0; i < pathComponents.length; i++) {
    const pathComponent = pathComponents[i];
    const isLast = i === pathComponents.length - 1;
    const exists = curr[pathComponent] !== undefined;

    if (exists) {
      if (!isLast && isTerminal(curr[pathComponent])) {
        return;
      }

      if (isLast) {
        // Prune descendants if the current path component is not terminal
        if (!isTerminal(curr[pathComponent])) {
          curr[pathComponent] = {};
        }
        return;
      }
      curr = curr[pathComponent];
      continue;
    }

    if (isLast) {
      curr[pathComponent] = {};
      return;
    }
    const next: PathNode = {};
    curr[pathComponent] = next;
    curr = next;
  }
};

/**
 * Delete a URL from the trie.
 *
 * @param url - The URL to delete from the trie.
 * @param pathTrie - The trie to delete the URL from.
 */
export const deleteFromTrie = (url: string, pathTrie: PathTrie) => {
  const { hostname, pathComponents } = getHostnameAndPathComponents(url);

  const lowerHostname = hostname.toLowerCase();
  if (pathComponents.length === 0 || !pathTrie[lowerHostname]) {
    return;
  }

  const pathToNode: { node: PathNode; key: string }[] = [
    { node: pathTrie, key: lowerHostname },
  ];
  let curr: PathNode = pathTrie[lowerHostname];
  for (const pathComponent of pathComponents) {
    if (!curr[pathComponent]) {
      return;
    }

    pathToNode.push({ node: curr, key: pathComponent });
    curr = curr[pathComponent];
  }

  const lastEntry = pathToNode[pathToNode.length - 1];
  delete lastEntry.node[lastEntry.key];
  for (let i = pathToNode.length - 2; i >= 0; i--) {
    const { node, key } = pathToNode[i];
    if (isTerminal(node[key])) {
      delete node[key];
    } else {
      break;
    }
  }
};

/**
 * Get the concatenated hostname and path components all the way down to the
 * terminal node in the trie that is prefixed in the passed URL. It will only
 * return a string if the terminal node in the trie is contained in the passed
 * URL.
 *
 * @param url - The URL to check.
 * @param pathTrie - The trie to check the URL in.
 * @returns The matched path prefix, or null if no match is found.
 */
export const matchedPathPrefix = (
  url: string,
  pathTrie: PathTrie,
): string | null => {
  const { hostname, pathComponents } = getHostnameAndPathComponents(url);

  const lowerHostname = hostname.toLowerCase();
  if (pathComponents.length === 0 || !hostname || !pathTrie[lowerHostname]) {
    return null;
  }

  let matchedPath = `${hostname}/`;
  let curr: PathNode = pathTrie[lowerHostname];
  for (const pathComponent of pathComponents) {
    if (!curr[pathComponent]) {
      return null;
    }
    curr = curr[pathComponent];
    // If we've reached a terminal node, then we can return the matched path.
    if (isTerminal(curr)) {
      matchedPath += pathComponent;
      return matchedPath;
    }
    matchedPath += `${pathComponent}/`;
  }
  return null;
};

/**
 * Converts a list ofpaths into a PathTrie structure. This assumes that the
 * entries are only hostname+pathname format.
 *
 * @param paths - Array of hostname+pathname
 * @returns PathTrie structure for efficient path checking
 */
export const convertListToTrie = (paths: string[] = []): PathTrie => {
  const pathTrie: PathTrie = {};
  if (!paths || !Array.isArray(paths)) {
    return pathTrie;
  }
  for (const path of paths) {
    insertToTrie(path, pathTrie);
  }
  return pathTrie;
};

/**
 * Creates a deep copy of a PathNode structure.
 *
 * @param original - The original PathNode to copy.
 * @returns A deep copy of the PathNode.
 */
const deepCopyPathNode = (original: PathNode): PathNode => {
  const copy: PathNode = {};

  for (const [key, childNode] of Object.entries(original)) {
    copy[key] = deepCopyPathNode(childNode);
  }

  return copy;
};

/**
 * Creates a deep copy of a PathTrie structure.
 *
 * @param original - The original PathTrie to copy.
 * @returns A deep copy of the PathTrie.
 */
export const deepCopyPathTrie = (original: PathTrie): PathTrie => {
  return deepCopyPathNode(original) as PathTrie;
};
