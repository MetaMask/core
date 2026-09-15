import { jest } from '@jest/globals';
import {
  createSandbox,
  readFile,
  readJsonFile,
  writeJsonFile,
} from '@metamask/utils/node';
import path from 'path';

import {
  buildSuppressions,
  compareErrorsToSuppressions,
  parseTscOutput,
  printReport,
  readSuppressions,
  writeSuppressions,
} from './tsc-suppressions.js';

const { withinSandbox } = createSandbox('lib/tsc-suppressions');

describe('parseTscOutput', () => {
  it('parses an error that has a file, line, and column', () => {
    const output =
      "packages/foo/src/foo.test.ts(12,5): error TS2322: Type 'string' is not assignable to type 'number'.";

    expect(parseTscOutput(output)).toStrictEqual([
      {
        filePath: 'packages/foo/src/foo.test.ts',
        code: 'TS2322',
        message: "Type 'string' is not assignable to type 'number'.",
      },
    ]);
  });

  it('parses multiple errors within the same file', () => {
    const output = [
      'packages/foo/src/foo.test.ts(12,5): error TS2322: Nope.',
      'packages/foo/src/foo.test.ts(40,1): error TS2322: Nope again.',
    ].join('\n');

    expect(parseTscOutput(output)).toHaveLength(2);
  });

  it('ignores the indented lines that elaborate on an error', () => {
    const output = [
      'packages/foo/src/foo.test.ts(12,5): error TS2769: No overload matches this call.',
      '  The last overload gave the following error.',
      "    Argument of type 'A' is not assignable to parameter of type 'B'.",
    ].join('\n');

    expect(parseTscOutput(output)).toStrictEqual([
      {
        filePath: 'packages/foo/src/foo.test.ts',
        code: 'TS2769',
        message: 'No overload matches this call.',
      },
    ]);
  });

  it('ignores lines that are not errors', () => {
    const output = [
      'packages/foo/src/foo.test.ts(12,5): error TS2322: Nope.',
      '',
      'Found 1 error in 1 file.',
    ].join('\n');

    expect(parseTscOutput(output)).toHaveLength(1);
  });

  it('parses an error that has no file, using an empty file path', () => {
    const output = "error TS6053: File 'nope.ts' not found.";

    expect(parseTscOutput(output)).toStrictEqual([
      {
        filePath: '',
        code: 'TS6053',
        message: "File 'nope.ts' not found.",
      },
    ]);
  });

  it('returns no errors when given empty output', () => {
    expect(parseTscOutput('')).toStrictEqual([]);
  });
});

describe('buildSuppressions', () => {
  it('counts errors by file and then by error code', () => {
    const errors = [
      { filePath: 'b.ts', code: 'TS2322', message: 'One.' },
      { filePath: 'b.ts', code: 'TS2322', message: 'Two.' },
      { filePath: 'b.ts', code: 'TS7005', message: 'Three.' },
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
      { filePath: 'b.ts', code: 'TS7005', message: 'One.' },
      { filePath: 'a.ts', code: 'TS2322', message: 'Two.' },
      { filePath: 'b.ts', code: 'TS2322', message: 'Three.' },
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

describe('compareErrorsToSuppressions', () => {
  it('reports an error whose code is not suppressed for that file', () => {
    const report = compareErrorsToSuppressions({
      errors: [{ filePath: 'a.ts', code: 'TS2322', message: 'Nope.' }],
      suppressions: {},
    });

    expect(report).toStrictEqual({
      unsuppressedErrors: [
        {
          filePath: 'a.ts',
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
      errors: [{ filePath: 'a.ts', code: 'TS2322', message: 'Nope.' }],
      suppressions: { 'a.ts': { TS7005: { count: 1 } } },
    });

    expect(report.unsuppressedErrors).toStrictEqual([
      {
        filePath: 'a.ts',
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
        { filePath: 'a.ts', code: 'TS2322', message: 'One.' },
        { filePath: 'a.ts', code: 'TS2322', message: 'Two.' },
      ],
      suppressions: { 'a.ts': { TS2322: { count: 1 } } },
    });

    expect(report.unsuppressedErrors).toStrictEqual([
      {
        filePath: 'a.ts',
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
      errors: [{ filePath: 'a.ts', code: 'TS2322', message: 'One.' }],
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
      errors: [{ filePath: 'a.ts', code: 'TS2322', message: 'One.' }],
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

  it('never suppresses an error that has no file, as it is a configuration error', () => {
    const report = compareErrorsToSuppressions({
      errors: [{ filePath: '', code: 'TS6053', message: 'Not found.' }],
      suppressions: { '': { TS6053: { count: 1 } } },
    });

    expect(report.unsuppressedErrors).toStrictEqual([
      {
        filePath: '',
        code: 'TS6053',
        count: 1,
        suppressedCount: 0,
        messages: ['Not found.'],
      },
    ]);
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
      await expect(readSuppressions(sandbox.directoryPath)).rejects.toThrow(
        expect.anything(),
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
    expect(output).toContain('a.ts');
    expect(output).toContain('TS2322');
    expect(output).toContain('One.');
    expect(output).toContain('Two.');
  });

  it('labels an error that has no file', () => {
    printReport({
      unsuppressedErrors: [
        {
          filePath: '',
          code: 'TS6053',
          count: 1,
          suppressedCount: 0,
          messages: ['Not found.'],
        },
      ],
      staleSuppressions: [],
      didPass: false,
    });

    const output = jest.mocked(console.log).mock.calls.flat().join('\n');
    expect(output).toContain('(no file)');
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
    expect(output).toContain('yarn lint:tsc:suppress');
  });
});
