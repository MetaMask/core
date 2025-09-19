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
 * Check if a URL is a terminal path i.e. the last path component is a terminal node.
 *
 * @param url - The URL to check.
 * @param pathTrie - The trie to check the URL in.
 * @returns True if the URL is a terminal path, false otherwise.
 */
export const isTerminalPath = (url: string, pathTrie: PathTrie): boolean => {
  const { hostname, pathComponents } = getHostnameAndPathComponents(url);

  const lowerHostname = hostname.toLowerCase();
  if (pathComponents.length === 0 || !hostname || !pathTrie[lowerHostname]) {
    return false;
  }

  let curr: PathNode = pathTrie[lowerHostname];
  for (const pathComponent of pathComponents) {
    if (!curr[pathComponent]) {
      return false;
    }
    curr = curr[pathComponent];
  }
  return isTerminal(curr);
};
