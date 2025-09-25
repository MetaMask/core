import {
  convertListToTrie,
  deleteFromTrie,
  isTerminalPath,
  insertToTrie,
  type PathTrie,
} from './PathTrie';

const emptyPathTrie: PathTrie = {};

describe('PathTrie', () => {
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

  describe('isTerminalPath', () => {
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
      ['terminal path', 'example.com/path11/path2', true],
      ['ancestor path', 'example.com/path11', false],
      ['non-existent path', 'example.com/path11/path3', false],
      ['no path', 'example.com', false],
      ['no hostname', 'nonexistent.com/path11/path2', false],
      ['with a scheme', 'https://example.com/path11/path2', true],
    ])('returns %s if the path is %s', (_name, path, expected) => {
      expect(isTerminalPath(path, pathTrie)).toBe(expected);
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
    const result = convertListToTrie(undefined as any);
    expect(result).toStrictEqual({});
  });

  it('handles non-array input gracefully', () => {
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
