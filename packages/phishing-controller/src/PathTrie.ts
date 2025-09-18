import { getHostnameAndPathComponents } from './utils';

export type PathNode = {
  [key: string]: PathNode;
};

export type PathTrie = Record<string, PathNode>;

/**
 * Insert a URL into the trie, mutating `pathTrie` in place.
 * - If an ancestor path already exists as a terminal ({}), do nothing.
 * - If inserting an ancestor of existing entries, prune descendants by setting that node to {}.
 * - If no path segments exist (bare host or "/"), do nothing.
 */
export const insertToTrie = (url: string, pathTrie: PathTrie) => {
  var { hostname, pathComponents } = getHostnameAndPathComponents(url);

  if (pathComponents.length === 0 || !hostname) {
    return;
  }

  hostname = hostname.toLowerCase();
  if (!pathTrie[hostname]) {
    pathTrie[hostname] = {} as PathNode;
  }

  let curr: PathNode = pathTrie[hostname];
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

export const deleteFromTrie = (url: string, pathTrie: PathTrie) => {
  var { hostname, pathComponents } = getHostnameAndPathComponents(url);

  if (pathComponents.length === 0 || !pathTrie[hostname]) {
    return;
  }

  const pathToNode: { node: PathNode; key: string }[] = [
    { node: pathTrie, key: hostname },
  ];
  let curr: PathNode = pathTrie[hostname];
  for (let i = 0; i < pathComponents.length; i++) {
    const pathComponent = pathComponents[i];

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

export const isTerminalPath = (url: string, pathTrie: PathTrie): boolean => {
  var { hostname, pathComponents } = getHostnameAndPathComponents(url);

  hostname = hostname.toLowerCase();
  if (pathComponents.length === 0 || !hostname || !pathTrie[hostname]) {
    return false;
  }

  let curr: PathNode = pathTrie[hostname];
  for (let i = 0; i < pathComponents.length; i++) {
    const pathComponent = pathComponents[i];
    if (!curr[pathComponent]) {
      return false;
    }
    curr = curr[pathComponent];
  }
  return isTerminal(curr);
};

const isTerminal = (node: PathNode): boolean => {
  return Object.keys(node).length === 0;
};
