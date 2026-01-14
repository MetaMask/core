import {
  convertListToTrie,
  deepCopyPathTrie,
  deleteFromTrie,
  insertToTrie,
  isTerminal,
  matchedPathPrefix,
} from './PathTrie';
import type { PathTrie } from './PathTrie';

const emptyPathTrie: PathTrie = {};

describe('PathTrie', () => {
  describe('isTerminal', () => {
    it.each([
      [{}, true],
      [{ child: {} }, false],
      [{ path1: {}, path2: {} }, false],
      [undefined, false],
      [null, false],
    ])('returns %s for %s', (input, expected) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(isTerminal(input as any)).toBe(expected);
    });

    it('handles nested empty objects correctly', () => {
      const nestedEmptyNode = {
        child: {},
      };
      expect(isTerminal(nestedEmptyNode)).toBe(false); // Has properties
      expect(isTerminal(nestedEmptyNode.child)).toBe(true); // Child is empty
    });
  });

  describe('insertToTrie', () => {
    let pathTrie: PathTrie;

    beforeEach(() => {
      pathTrie = {};
    });

    it('inserts a URL to the path trie', () => {
      insertToTrie('example.com/path1/path2', pathTrie);

      expect(pathTrie).toStrictEqual({
        'example.com': {
          path1: {
            path2: {},
          },
        },
      });
    });

    it('inserts sibling path', () => {
      insertToTrie('example.com/path1', pathTrie);
      insertToTrie('example.com/path2', pathTrie);

      expect(pathTrie).toStrictEqual({
        'example.com': {
          path1: {},
          path2: {},
        },
      });
    });

    it('multiple inserts', () => {
      insertToTrie('example.com/path1/path2/path31', pathTrie);
      insertToTrie('example.com/path1/path2/path32', pathTrie);
      insertToTrie('example.com/path1/path2/path33/path4', pathTrie);
      insertToTrie('example.com/path2', pathTrie);

      expect(pathTrie).toStrictEqual({
        'example.com': {
          path1: {
            path2: {
              path31: {},
              path32: {},
              path33: {
                path4: {},
              },
            },
          },
          path2: {},
        },
      });
    });

    it('idempotent', () => {
      insertToTrie('example.com/path1/path2', pathTrie);
      insertToTrie('example.com/path1/path2', pathTrie);

      expect(pathTrie).toStrictEqual({
        'example.com': {
          path1: {
            path2: {},
          },
        },
      });
    });

    it('prunes descendants when adding ancestor', () => {
      insertToTrie('example.com/path1/path2/path3', pathTrie);
      expect(pathTrie).toStrictEqual({
        'example.com': {
          path1: {
            path2: {
              path3: {},
            },
          },
        },
      });

      insertToTrie('example.com/path1', pathTrie);
      expect(pathTrie).toStrictEqual({
        'example.com': {
          path1: {},
        },
      });
    });

    it('does not insert path1/path2 if path1 exists', () => {
      insertToTrie('example.com/path1', pathTrie);
      insertToTrie('example.com/path1/path2', pathTrie);

      expect(pathTrie).toStrictEqual({
        'example.com': {
          path1: {},
        },
      });
    });

    it('does not insert if no path is provided', () => {
      insertToTrie('example.com', pathTrie);

      expect(pathTrie).toStrictEqual(emptyPathTrie);
    });

    it('treats trailing slash as equivalent', () => {
      insertToTrie('example.com/path', pathTrie);
      insertToTrie('example.com/path/', pathTrie);
      expect(pathTrie).toStrictEqual({
        'example.com': { path: {} },
      });
    });

    it('accepts URLs with a scheme', () => {
      insertToTrie('https://example.com/path', pathTrie);
      expect(pathTrie).toStrictEqual({ 'example.com': { path: {} } });
    });
  });

  describe('deleteFromTrie', () => {
    let pathTrie: PathTrie;

    beforeEach(() => {
      pathTrie = {
        'example.com': {
          path11: {
            path2: {},
          },
          path12: {},
        },
      };
    });

    it('deletes a path', () => {
      deleteFromTrie('example.com/path11/path2', pathTrie);
      expect(pathTrie).toStrictEqual({
        'example.com': {
          path12: {},
        },
      });
    });

    it('deletes all paths', () => {
      deleteFromTrie('example.com/path11/path2', pathTrie);
      deleteFromTrie('example.com/path12', pathTrie);
      expect(pathTrie).toStrictEqual(emptyPathTrie);
    });

    it('deletes descendants if the path is not terminal', () => {
      deleteFromTrie('example.com/path11', pathTrie);
      expect(pathTrie).toStrictEqual({
        'example.com': {
          path12: {},
        },
      });
    });

    it('idempotent', () => {
      deleteFromTrie('example.com/path11/path2', pathTrie);
      deleteFromTrie('example.com/path11/path2', pathTrie);
      expect(pathTrie).toStrictEqual({
        'example.com': {
          path12: {},
        },
      });
    });

    it('does nothing if the path does not exist within the trie', () => {
      deleteFromTrie('example.com/nonexistent', pathTrie);
      expect(pathTrie).toStrictEqual(pathTrie);
    });

    it('does nothing if the hostname does not exist', () => {
      deleteFromTrie('nonexistent.com/path11/path2', pathTrie);
      expect(pathTrie).toStrictEqual(pathTrie);
    });

    it('does nothing if no path is provided', () => {
      deleteFromTrie('example.com', pathTrie);
      expect(pathTrie).toStrictEqual(pathTrie);
    });

    it('deletes with a scheme', () => {
      deleteFromTrie('https://example.com/path11/path2', pathTrie);
      expect(pathTrie).toStrictEqual({
        'example.com': {
          path12: {},
        },
      });
    });
  });

  describe('matchedPathPrefix', () => {
    let pathTrie: PathTrie;

    beforeEach(() => {
      pathTrie = {
        'example.com': {
          path11: {
            path2: {},
          },
        },
      };
    });

    it.each([
      {
        path: 'example.com/path11/path2',
        expected: 'example.com/path11/path2',
      },
      { path: 'example.com/path11', expected: null },
      {
        path: 'example.com/path11/path3',
        expected: null,
      },
      { path: 'example.com', expected: null },
      {
        path: 'nonexistent.com/path11/path2',
        expected: null,
      },
      {
        path: 'https://example.com/path11/path2/path3',
        expected: 'example.com/path11/path2',
      },
    ])('$path returns $expected', ({ path, expected }) => {
      expect(matchedPathPrefix(path, pathTrie)).toBe(expected);
    });
  });

  describe('deepCopyPathTrie', () => {
    it('creates a deep copy of a simple trie', () => {
      const original: PathTrie = {
        'example.com': {
          path1: {},
          path2: {},
        },
      };

      const copy = deepCopyPathTrie(original);

      expect(copy).toStrictEqual(original);
      expect(copy).not.toBe(original);
      expect(copy['example.com']).not.toBe(original['example.com']);
    });

    it('creates a deep copy of a complex nested trie', () => {
      const original: PathTrie = {
        'example.com': {
          path1: {
            subpath1: {
              deeppath: {},
            },
            subpath2: {},
          },
          path2: {},
        },
        'another.com': {
          different: {
            nested: {},
          },
        },
      };

      const copy = deepCopyPathTrie(original);

      expect(copy).toStrictEqual(original);
      expect(copy).not.toBe(original);
      expect(copy['example.com']).not.toBe(original['example.com']);
      expect(copy['example.com'].path1).not.toBe(original['example.com'].path1);
      expect(copy['example.com'].path1.subpath1).not.toBe(
        original['example.com'].path1.subpath1,
      );
      expect(copy['another.com']).not.toBe(original['another.com']);
    });

    it('handles empty trie', () => {
      const original: PathTrie = {};
      const copy = deepCopyPathTrie(original);

      expect(copy).toStrictEqual({});
      expect(copy).not.toBe(original);
    });

    it('handles undefined input gracefully', () => {
      const copy = deepCopyPathTrie(undefined);
      expect(copy).toStrictEqual({});
    });

    it('handles null input gracefully', () => {
      const copy = deepCopyPathTrie(null);
      expect(copy).toStrictEqual({});
    });
  });
});

describe('convertListToTrie', () => {
  it('converts array of URLs with paths to PathTrie structure', () => {
    const paths = [
      'example.com/path1',
      'example.com/path2/subpath',
      'another.com/different/path',
    ];

    const result = convertListToTrie(paths);

    expect(result).toStrictEqual({
      'example.com': {
        path1: {},
        path2: {
          subpath: {},
        },
      },
      'another.com': {
        different: {
          path: {},
        },
      },
    });
  });

  it('handles empty array', () => {
    const result = convertListToTrie([]);
    expect(result).toStrictEqual({});
  });

  it('handles undefined input gracefully', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = convertListToTrie(undefined as any);
    expect(result).toStrictEqual({});
  });

  it('handles non-array input gracefully', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = convertListToTrie('not-an-array' as any);
    expect(result).toStrictEqual({});
  });

  it('filters out invalid URLs', () => {
    const paths = [
      'valid.com/path',
      '', // empty string
      'invalid-url-without-domain',
    ];

    const result = convertListToTrie(paths);

    expect(result).toStrictEqual({
      'valid.com': {
        path: {},
      },
    });
  });

  it('handles multiple paths on same domain correctly', () => {
    const paths = [
      'example.com/path1',
      'example.com/path2/subpath',
      'example.com/path1/deeper',
    ];

    const result = convertListToTrie(paths);

    expect(result).toStrictEqual({
      'example.com': {
        path1: {},
        path2: {
          subpath: {},
        },
      },
    });
  });
});
