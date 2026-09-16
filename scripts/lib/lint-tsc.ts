import execa from 'execa';
import path from 'path';

import {
  buildSuppressions,
  compareErrorsToSuppressions,
  findFilelessDiagnostics,
  parseTscOutput,
  printReport,
  readSuppressions,
  writeSuppressions,
} from './tsc-suppressions.js';

const REPO_ROOT = path.join(import.meta.dirname, '..', '..');

const SUPPRESSIONS_FILE_NAME = 'tsc-suppressions.json';

/**
 * Typechecks every package in the repo and compares the type errors it finds
 * against `tsc-suppressions.json`, failing if any error is not suppressed there
 * or if any suppression no longer covers an error. This keeps packages that are
 * free of type errors from regressing while the existing errors are worked
 * through.
 *
 * Passing `--update` rewrites the suppressions file from the errors that
 * currently exist rather than checking against it.
 *
 * @param argv - The arguments passed to this script.
 */
export async function lintTsc(argv: readonly string[]): Promise<void> {
  const suppressionsFilePath = path.join(REPO_ROOT, SUPPRESSIONS_FILE_NAME);

  const { all, exitCode } = await execa(
    'tsc',
    ['--build', 'tsconfig.lint.json', '--pretty', 'false'],
    { cwd: REPO_ROOT, reject: false, all: true, preferLocal: true },
  );
  const output = all ?? '';
  const errors = parseTscOutput(output);

  // `tsc` exits non-zero whenever it reports type errors, which are expected
  // here and may well be suppressed, so the exit code alone says little. A run
  // is only genuinely broken if it reported a diagnostic that belongs to no
  // file, or if it failed without reporting any type errors at all. Neither can
  // be suppressed, and neither may be mistaken for a clean run.
  const filelessDiagnostics = findFilelessDiagnostics(output);
  if (
    filelessDiagnostics.length > 0 ||
    (exitCode !== 0 && errors.length === 0)
  ) {
    console.log(
      filelessDiagnostics.length > 0 ? filelessDiagnostics.join('\n') : output,
    );
    throw new Error(
      '`tsc` failed for a reason other than the type errors it reported.',
    );
  }

  if (argv.includes('--update')) {
    const suppressions = buildSuppressions(errors);
    await writeSuppressions({
      filePath: suppressionsFilePath,
      suppressions,
    });
    console.log(
      `✅ Updated ${SUPPRESSIONS_FILE_NAME}: now suppressing ${errors.length} type error(s) across ${Object.keys(suppressions).length} file(s).`,
    );
    return;
  }

  const report = compareErrorsToSuppressions({
    errors,
    suppressions: await readSuppressions(suppressionsFilePath),
  });
  printReport(report);

  if (!report.didPass) {
    process.exitCode = 1;
  }
}
