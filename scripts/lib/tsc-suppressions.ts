import { readJsonFile, writeFile } from '@metamask/utils/node';

/**
 * A type error reported by `tsc`.
 */
export type TscError = {
  filePath: string;
  code: string;
  message: string;
};

/**
 * The number of type errors of a given code that are knowingly ignored within a
 * given file.
 */
export type Suppression = {
  count: number;
};

/**
 * All of the type errors that are knowingly ignored across the repo, keyed by
 * file and then by error code.
 *
 * This mirrors the shape of `eslint-suppressions.json`. Note that error
 * messages are deliberately left out of the key: their wording changes between
 * TypeScript releases, which would invalidate the whole file at once.
 */
export type TscSuppressions = Record<string, Record<string, Suppression>>;

/**
 * A group of errors of the same code within the same file which exceeds the
 * number of errors that are suppressed there.
 */
export type UnsuppressedError = {
  filePath: string;
  code: string;
  count: number;
  suppressedCount: number;
  messages: string[];
};

/**
 * A suppression that covers more errors than its file now produces, meaning
 * that some of the errors it covers have been fixed.
 */
export type StaleSuppression = {
  filePath: string;
  code: string;
  count: number;
  suppressedCount: number;
};

/**
 * The result of checking the type errors in the repo against the suppressions
 * file.
 */
export type TscSuppressionsReport = {
  unsuppressedErrors: UnsuppressedError[];
  staleSuppressions: StaleSuppression[];
  didPass: boolean;
};

/**
 * Matches a line such as:
 *
 * `packages/foo/src/foo.test.ts(12,5): error TS2322: Type 'string' is not ...`
 *
 * Lines that elaborate on an error are indented, so they never match.
 */
const ERROR_REGEXP =
  /^(?<filePath>[^\s(][^(]*)\(\d+,\d+\): error (?<code>TS\d+): (?<message>.*)$/u;

/**
 * Builds the key under which errors are grouped, matching how suppressions are
 * keyed.
 *
 * @param filePath - The path to the file, relative to the repo root.
 * @param code - The TypeScript error code.
 * @returns The key for that combination.
 */
function buildKey(filePath: string, code: string): string {
  return `${filePath}::${code}`;
}

/**
 * Extracts the type errors from the output of `tsc --pretty false`.
 *
 * @param output - The combined stdout and stderr of a `tsc` run.
 * @returns The errors, in the order that `tsc` reported them.
 */
export function parseTscOutput(output: string): TscError[] {
  const errors: TscError[] = [];

  for (const line of output.split('\n')) {
    const match = ERROR_REGEXP.exec(line);
    if (match?.groups) {
      errors.push({
        filePath: String(match.groups.filePath),
        code: String(match.groups.code),
        message: String(match.groups.message),
      });
    }
  }

  return errors;
}

/**
 * Tallies errors by file and then by error code, sorting both so that the
 * suppressions file produces a minimal diff from one run to the next.
 *
 * @param errors - The errors to tally.
 * @returns Suppressions that cover exactly the given errors.
 */
export function buildSuppressions(
  errors: readonly TscError[],
): TscSuppressions {
  const countsByFilePath = new Map<string, Map<string, number>>();

  for (const error of errors) {
    const countsByCode =
      countsByFilePath.get(error.filePath) ?? new Map<string, number>();
    countsByCode.set(error.code, (countsByCode.get(error.code) ?? 0) + 1);
    countsByFilePath.set(error.filePath, countsByCode);
  }

  const suppressions: TscSuppressions = {};
  for (const [filePath, countsByCode] of [...countsByFilePath].sort(
    ([filePathA], [filePathB]) => filePathA.localeCompare(filePathB),
  )) {
    const suppressionsByCode: Record<string, Suppression> = {};
    for (const [code, count] of [...countsByCode].sort(([codeA], [codeB]) =>
      codeA.localeCompare(codeB),
    )) {
      suppressionsByCode[code] = { count };
    }
    suppressions[filePath] = suppressionsByCode;
  }

  return suppressions;
}

/**
 * Checks the given errors against the given suppressions.
 *
 * An error is unsuppressed if its file produces more errors of its code than
 * the suppressions allow. A suppression is stale if its file produces fewer
 * errors of that code than it covers, which means that those errors have been
 * fixed and the suppression should be removed.
 *
 * @param args - The arguments to this function.
 * @param args.errors - The errors from the current run.
 * @param args.suppressions - The suppressions to check against.
 * @returns A report of what is new and what is stale.
 */
export function compareErrorsToSuppressions({
  errors,
  suppressions,
}: {
  errors: readonly TscError[];
  suppressions: TscSuppressions;
}): TscSuppressionsReport {
  // Group the errors by file and code, keeping their messages so that the
  // report can show what was actually found.
  const groups = new Map<
    string,
    { filePath: string; code: string; messages: string[] }
  >();
  for (const error of errors) {
    const group = groups.get(buildKey(error.filePath, error.code));
    if (group) {
      group.messages.push(error.message);
    } else {
      groups.set(buildKey(error.filePath, error.code), {
        filePath: error.filePath,
        code: error.code,
        messages: [error.message],
      });
    }
  }

  const unsuppressedErrors: UnsuppressedError[] = [];
  for (const { filePath, code, messages } of groups.values()) {
    const suppressedCount = suppressions[filePath]?.[code]?.count ?? 0;
    if (messages.length > suppressedCount) {
      unsuppressedErrors.push({
        filePath,
        code,
        count: messages.length,
        suppressedCount,
        messages,
      });
    }
  }

  const staleSuppressions: StaleSuppression[] = [];
  for (const [filePath, suppressedByCode] of Object.entries(suppressions)) {
    for (const [code, { count: suppressedCount }] of Object.entries(
      suppressedByCode,
    )) {
      const count = groups.get(buildKey(filePath, code))?.messages.length ?? 0;
      if (count < suppressedCount) {
        staleSuppressions.push({ filePath, code, count, suppressedCount });
      }
    }
  }

  return {
    unsuppressedErrors,
    staleSuppressions,
    didPass: unsuppressedErrors.length === 0 && staleSuppressions.length === 0,
  };
}

/**
 * Reads the suppressions file, treating a missing file as having no
 * suppressions.
 *
 * @param filePath - The path to the suppressions file.
 * @returns The suppressions that the file holds.
 */
export async function readSuppressions(
  filePath: string,
): Promise<TscSuppressions> {
  try {
    return await readJsonFile<TscSuppressions>(filePath);
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return {};
    }
    throw error;
  }
}

/**
 * Writes the suppressions file, formatted the way that Oxfmt expects so that
 * `lint:misc` stays happy after the file is regenerated.
 *
 * @param args - The arguments to this function.
 * @param args.filePath - The path to the suppressions file.
 * @param args.suppressions - The suppressions to write.
 */
export async function writeSuppressions({
  filePath,
  suppressions,
}: {
  filePath: string;
  suppressions: TscSuppressions;
}): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(suppressions, null, 2)}\n`);
}

/**
 * Prints the results of checking type errors against the suppressions file.
 *
 * @param report - The report to print.
 */
export function printReport(report: TscSuppressionsReport): void {
  if (report.didPass) {
    console.log('✅ No new type errors detected. Good job!');
    return;
  }

  if (report.unsuppressedErrors.length > 0) {
    console.log('❌ Detected type errors that are not suppressed:\n');
    for (const error of report.unsuppressedErrors) {
      console.log(
        `  ${error.filePath}: ${error.code} (${error.count} found, ${error.suppressedCount} suppressed)`,
      );
      for (const message of error.messages) {
        console.log(`    - ${message}`);
      }
    }
    console.log(
      '\nFix these errors, or run `yarn lint:tsc:suppress` if they cannot be fixed yet.',
    );
  }

  if (report.staleSuppressions.length > 0) {
    console.log(
      '\n❌ Detected suppressions that cover type errors which no longer occur:\n',
    );
    for (const suppression of report.staleSuppressions) {
      console.log(
        `  ${suppression.filePath}: ${suppression.code} (${suppression.count} found, ${suppression.suppressedCount} suppressed)`,
      );
    }
    console.log('\nRun `yarn lint:tsc:suppress` to remove these suppressions.');
  }
}
