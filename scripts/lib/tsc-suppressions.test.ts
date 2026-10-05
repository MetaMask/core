import { jest } from '@jest/globals';
import {
  createSandbox,
  readFile,
  readJsonFile,
  writeJsonFile,
} from '@metamask/utils/node';
import path from 'path';

import {
  addSuppressions,
  buildSuppressions,
  compareErrorsToSuppressions,
  compareStrings,
  isTscError,
  parseTscOutput,
  printReport,
  pruneSuppressions,
  readSuppressions,
  writeSuppressions,
} from './tsc-suppressions.ts';

const { withinSandbox } = createSandbox('lib/tsc-suppressions');

describe('parseTscOutput', () => {
  it('parses an error that has a file, line, and column', () => {
    const lines = [
      "packages/foo/src/foo.test.ts(12,5): error TS2322: Type 'string' is not assignable to type 'number'.",
    ];

    expect(parseTscOutput(lines)).toStrictEqual([
      {
        filePath: 'packages/foo/src/foo.test.ts',
        fileLine: '12',
        code: 'TS2322',
        message: "Type 'string' is not assignable to type 'number'.",
      },
    ]);
  });

  it('parses multiple errors within the same file', () => {
    const lines = [
      'packages/foo/src/foo.test.ts(12,5): error TS2322: Nope.',
      'packages/foo/src/foo.test.ts(40,1): error TS2322: Nope again.',
    ];

    expect(parseTscOutput(lines)).toHaveLength(2);
  });

  it('ignores the indented lines that elaborate on an error', () => {
    const lines = [
      'packages/foo/src/foo.test.ts(12,5): error TS2769: No overload matches this call.',
      '  The last overload gave the following error.',
      "    Argument of type 'A' is not assignable to parameter of type 'B'.",
    ];

    expect(parseTscOutput(lines)).toStrictEqual([
      {
        filePath: 'packages/foo/src/foo.test.ts',
        fileLine: '12',
        code: 'TS2769',
        message: 'No overload matches this call.',
      },
    ]);
  });

  it('ignores lines that are not errors', () => {
    const lines = [
      'packages/foo/src/foo.test.ts(12,5): error TS2322: Nope.',
      '',
      'Found 1 error in 1 file.',
    ];

    expect(parseTscOutput(lines)).toHaveLength(1);
  });

  it('parses a diagnostic that tsc reports without a file', () => {
    expect(
      parseTscOutput(["error TS6053: File 'nope.ts' not found."]),
    ).toStrictEqual([
      {
        filePath: undefined,
        fileLine: undefined,
        code: 'TS6053',
        message: "File 'nope.ts' not found.",
      },
    ]);
  });

  it('returns no diagnostics when given no lines', () => {
    expect(parseTscOutput([])).toStrictEqual([]);
  });
});

describe('isTscError', () => {
  it('treats a diagnostic that belongs to a file as a type error', () => {
    expect(
      isTscError({
        filePath: 'a.ts',
        fileLine: '12',
        code: 'TS2322',
        message: 'Nope.',
      }),
    ).toBe(true);
  });

  it('does not treat a diagnostic without a file as a type error', () => {
    expect(
      isTscError({ filePath: undefined, code: 'TS6053', message: 'Nope.' }),
    ).toBe(false);
  });
});

describe('compareStrings', () => {
  it('orders by code unit rather than by locale', () => {
    // A locale-aware comparison sorts these the other way around.
    expect(compareStrings('Z', 'a')).toBeLessThan(0);
    expect(compareStrings('a', 'Z')).toBeGreaterThan(0);
  });

  it('treats identical strings as equal', () => {
    expect(compareStrings('a', 'a')).toBe(0);
  });
});

describe('buildSuppressions', () => {
  it('counts errors by file and then by error code', () => {
    const errors = [
      { filePath: 'b.ts', fileLine: '12', code: 'TS2322', message: 'One.' },
      { filePath: 'b.ts', fileLine: '40', code: 'TS2322', message: 'Two.' },
      { filePath: 'b.ts', fileLine: '56', code: 'TS7005', message: 'Three.' },
    ];

    expect(buildSuppressions(errors)).toStrictEqual({
      'b.ts': {
        TS2322: { count: 2 },
        TS7005: { count: 1 },
      },
    });
  });

  it('sorts files and error codes so the file stays stable across runs', () => {
    const errors = [
      { filePath: 'b.ts', fileLine: '12', code: 'TS7005', message: 'One.' },
      { filePath: 'a.ts', fileLine: '12', code: 'TS2322', message: 'Two.' },
      { filePath: 'b.ts', fileLine: '40', code: 'TS2322', message: 'Three.' },
    ];

    const suppressions = buildSuppressions(errors);

    expect(Object.keys(suppressions)).toStrictEqual(['a.ts', 'b.ts']);
    expect(Object.keys(suppressions['b.ts'] ?? {})).toStrictEqual([
      'TS2322',
      'TS7005',
    ]);
  });

  it('returns an empty object when there are no errors', () => {
    expect(buildSuppressions([])).toStrictEqual({});
  });
});

describe('addSuppressions', () => {
  it('adds a file that is not suppressed yet', () => {
    expect(
      addSuppressions({
        suppressions: {},
        errors: [
          {
            filePath: 'a.ts',
            fileLine: '12',
            code: 'TS2322',
            message: 'Nope.',
          },
        ],
      }),
    ).toStrictEqual({ 'a.ts': { TS2322: { count: 1 } } });
  });

  it('raises a count that has grown', () => {
    expect(
      addSuppressions({
        suppressions: { 'a.ts': { TS2322: { count: 1 } } },
        errors: [
          { filePath: 'a.ts', fileLine: '12', code: 'TS2322', message: 'One.' },
          { filePath: 'a.ts', fileLine: '40', code: 'TS2322', message: 'Two.' },
        ],
      }),
    ).toStrictEqual({ 'a.ts': { TS2322: { count: 2 } } });
  });

  it('leaves a count that has shrunk alone, as that is pruning', () => {
    expect(
      addSuppressions({
        suppressions: { 'a.ts': { TS2322: { count: 5 } } },
        errors: [
          { filePath: 'a.ts', fileLine: '12', code: 'TS2322', message: 'One.' },
        ],
      }),
    ).toStrictEqual({ 'a.ts': { TS2322: { count: 5 } } });
  });

  it('keeps a suppression whose errors have all gone', () => {
    expect(
      addSuppressions({
        suppressions: { 'a.ts': { TS2322: { count: 1 } } },
        errors: [],
      }),
    ).toStrictEqual({ 'a.ts': { TS2322: { count: 1 } } });
  });

  it('sorts what it writes', () => {
    const suppressions = addSuppressions({
      suppressions: { 'b.ts': { TS7005: { count: 1 } } },
      errors: [
        { filePath: 'a.ts', fileLine: '12', code: 'TS2322', message: 'Nope.' },
      ],
    });

    expect(Object.keys(suppressions)).toStrictEqual(['a.ts', 'b.ts']);
  });
});

describe('pruneSuppressions', () => {
  it('lowers a count whose errors have partly gone', () => {
    expect(
      pruneSuppressions({
        suppressions: { 'a.ts': { TS2322: { count: 5 } } },
        errors: [
          { filePath: 'a.ts', fileLine: '12', code: 'TS2322', message: 'One.' },
        ],
      }),
    ).toStrictEqual({ 'a.ts': { TS2322: { count: 1 } } });
  });

  it('removes a file whose errors have all gone', () => {
    expect(
      pruneSuppressions({
        suppressions: { 'a.ts': { TS2322: { count: 1 } } },
        errors: [],
      }),
    ).toStrictEqual({});
  });

  it('removes only the code that no longer occurs', () => {
    expect(
      pruneSuppressions({
        suppressions: {
          'a.ts': { TS2322: { count: 1 }, TS7005: { count: 1 } },
        },
        errors: [
          { filePath: 'a.ts', fileLine: '12', code: 'TS2322', message: 'One.' },
        ],
      }),
    ).toStrictEqual({ 'a.ts': { TS2322: { count: 1 } } });
  });

  it('leaves a count that has grown alone, as that is suppressing', () => {
    expect(
      pruneSuppressions({
        suppressions: { 'a.ts': { TS2322: { count: 1 } } },
        errors: [
          { filePath: 'a.ts', fileLine: '12', code: 'TS2322', message: 'One.' },
          { filePath: 'a.ts', fileLine: '40', code: 'TS2322', message: 'Two.' },
        ],
      }),
    ).toStrictEqual({ 'a.ts': { TS2322: { count: 1 } } });
  });

  it('sorts what it writes', () => {
    const pruned = pruneSuppressions({
      suppressions: {
        'b.ts': { TS2322: { count: 1 } },
        'a.ts': { TS2322: { count: 1 } },
      },
      errors: [
        { filePath: 'a.ts', fileLine: '12', code: 'TS2322', message: 'One.' },
        { filePath: 'b.ts', fileLine: '40', code: 'TS2322', message: 'Two.' },
      ],
    });

    expect(Object.keys(pruned)).toStrictEqual(['a.ts', 'b.ts']);
  });

  it('ignores an error whose file is not suppressed at all', () => {
    expect(
      pruneSuppressions({
        suppressions: {},
        errors: [
          { filePath: 'a.ts', fileLine: '12', code: 'TS2322', message: 'One.' },
        ],
      }),
    ).toStrictEqual({});
  });
});

describe('compareErrorsToSuppressions', () => {
  it('reports an error whose code is not suppressed for that file', () => {
    const report = compareErrorsToSuppressions({
      errors: [
        { filePath: 'a.ts', fileLine: '12', code: 'TS2322', message: 'Nope.' },
      ],
      suppressions: {},
    });

    expect(report).toStrictEqual({
      unsuppressedErrors: [
        {
          filePath: 'a.ts',
          fileLine: '12',
          code: 'TS2322',
          count: 1,
          suppressedCount: 0,
          messages: ['Nope.'],
        },
      ],
      staleSuppressions: [],
      didPass: false,
    });
  });

  it('reports an error whose code differs from the codes suppressed for that file', () => {
    const report = compareErrorsToSuppressions({
      errors: [
        { filePath: 'a.ts', fileLine: '12', code: 'TS2322', message: 'Nope.' },
      ],
      suppressions: { 'a.ts': { TS7005: { count: 1 } } },
    });

    expect(report.unsuppressedErrors).toStrictEqual([
      {
        filePath: 'a.ts',
        fileLine: '12',
        code: 'TS2322',
        count: 1,
        suppressedCount: 0,
        messages: ['Nope.'],
      },
    ]);
  });

  it('reports an error when a file has more errors of a code than are suppressed', () => {
    const report = compareErrorsToSuppressions({
      errors: [
        { filePath: 'a.ts', fileLine: '12', code: 'TS2322', message: 'One.' },
        { filePath: 'a.ts', fileLine: '40', code: 'TS2322', message: 'Two.' },
      ],
      suppressions: { 'a.ts': { TS2322: { count: 1 } } },
    });

    expect(report.unsuppressedErrors).toStrictEqual([
      {
        filePath: 'a.ts',
        fileLine: '12',
        code: 'TS2322',
        count: 2,
        suppressedCount: 1,
        messages: ['One.', 'Two.'],
      },
    ]);
    expect(report.didPass).toBe(false);
  });

  it('passes when the number of errors matches the number suppressed', () => {
    const report = compareErrorsToSuppressions({
      errors: [
        { filePath: 'a.ts', fileLine: '12', code: 'TS2322', message: 'One.' },
      ],
      suppressions: { 'a.ts': { TS2322: { count: 1 } } },
    });

    expect(report).toStrictEqual({
      unsuppressedErrors: [],
      staleSuppressions: [],
      didPass: true,
    });
  });

  it('reports a stale suppression when a file has fewer errors than are suppressed', () => {
    const report = compareErrorsToSuppressions({
      errors: [
        { filePath: 'a.ts', fileLine: '12', code: 'TS2322', message: 'One.' },
      ],
      suppressions: { 'a.ts': { TS2322: { count: 3 } } },
    });

    expect(report.staleSuppressions).toStrictEqual([
      { filePath: 'a.ts', code: 'TS2322', count: 1, suppressedCount: 3 },
    ]);
    expect(report.didPass).toBe(false);
  });

  it('reports a stale suppression when a file no longer has any errors', () => {
    const report = compareErrorsToSuppressions({
      errors: [],
      suppressions: { 'a.ts': { TS2322: { count: 1 } } },
    });

    expect(report.staleSuppressions).toStrictEqual([
      { filePath: 'a.ts', code: 'TS2322', count: 0, suppressedCount: 1 },
    ]);
  });

  it('passes when there are neither errors nor suppressions', () => {
    const report = compareErrorsToSuppressions({
      errors: [],
      suppressions: {},
    });

    expect(report.didPass).toBe(true);
  });
});

describe('readSuppressions', () => {
  it('reads the suppressions that the file holds', async () => {
    expect.assertions(1);

    await withinSandbox(async (sandbox) => {
      const filePath = path.join(sandbox.directoryPath, 'suppressions.json');
      const suppressions = { 'a.ts': { TS2322: { count: 1 } } };
      await writeJsonFile(filePath, suppressions);

      expect(await readSuppressions(filePath)).toStrictEqual(suppressions);
    });
  });

  it('treats a missing file as having no suppressions', async () => {
    expect.assertions(1);

    await withinSandbox(async (sandbox) => {
      const filePath = path.join(sandbox.directoryPath, 'nonexistent.json');

      expect(await readSuppressions(filePath)).toStrictEqual({});
    });
  });

  it('re-throws an error that is not about a missing file', async () => {
    expect.assertions(1);

    await withinSandbox(async (sandbox) => {
      // A directory can be opened but not read as a file.
      // Reading a directory as a file fails with EISDIR, which the code
      // passes through rather than treating as a missing file.
      await expect(readSuppressions(sandbox.directoryPath)).rejects.toThrow(
        'EISDIR',
      );
    });
  });
});

describe('writeSuppressions', () => {
  it('writes the suppressions to the file', async () => {
    expect.assertions(1);

    await withinSandbox(async (sandbox) => {
      const filePath = path.join(sandbox.directoryPath, 'suppressions.json');
      const suppressions = { 'a.ts': { TS2322: { count: 1 } } };

      await writeSuppressions({ filePath, suppressions });

      expect(await readJsonFile(filePath)).toStrictEqual(suppressions);
    });
  });

  it('indents the file and ends it with a newline, as Oxfmt expects', async () => {
    expect.assertions(1);

    await withinSandbox(async (sandbox) => {
      const filePath = path.join(sandbox.directoryPath, 'suppressions.json');

      await writeSuppressions({
        filePath,
        suppressions: { 'a.ts': { TS2322: { count: 1 } } },
      });

      expect(await readFile(filePath)).toBe(
        `{\n  "a.ts": {\n    "TS2322": {\n      "count": 1\n    }\n  }\n}\n`,
      );
    });
  });
});

describe('printReport', () => {
  beforeEach(() => {
    jest.spyOn(console, 'log').mockReturnValue(undefined);
  });

  it('announces success when there is nothing to report', () => {
    printReport({
      unsuppressedErrors: [],
      staleSuppressions: [],
      didPass: true,
    });

    expect(console.log).toHaveBeenCalledWith(
      '✅ No new type errors detected. Good job!',
    );
  });

  it('prints each unsuppressed error along with its messages', () => {
    printReport({
      unsuppressedErrors: [
        {
          filePath: 'a.ts',
          fileLine: '12',
          code: 'TS2322',
          count: 2,
          suppressedCount: 1,
          messages: ['One.', 'Two.'],
        },
      ],
      staleSuppressions: [],
      didPass: false,
    });

    const output = jest.mocked(console.log).mock.calls.flat().join('\n');
    expect(output).toContain('a.ts:12');
    expect(output).toContain('TS2322');
    expect(output).toContain('One.');
    expect(output).toContain('Two.');
  });

  it('prints each stale suppression', () => {
    printReport({
      unsuppressedErrors: [],
      staleSuppressions: [
        { filePath: 'a.ts', code: 'TS2322', count: 0, suppressedCount: 1 },
      ],
      didPass: false,
    });

    const output = jest.mocked(console.log).mock.calls.flat().join('\n');
    expect(output).toContain('a.ts');
    expect(output).toContain('yarn lint:tsc:prune');
  });
});
