import { execa } from 'execa';
import path from 'path';
import { fileURLToPath } from 'url';

import {
  TSC_SUPPRESSIONS_FILE_NAME,
  addSuppressions,
  compareErrorsToSuppressions,
  isTscError,
  parseTscOutput,
  printReport,
  pruneSuppressions,
  readSuppressions,
  writeSuppressions,
} from './tsc-suppressions.ts';

const REPO_ROOT = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
);

/**
 * Typechecks every package in the repo and compares the type errors it finds
 * against `tsc-suppressions.json`, failing if any error is not suppressed there
 * or if any suppression no longer covers an error. This keeps packages that are
 * free of type errors from regressing while the existing errors are worked
 * through.
 *
 * Passing `--suppress-all` records the errors that are not suppressed yet, and
 * `--prune-suppressions` drops the suppressions whose errors have been fixed.
 * Either one writes the file rather than checking against it, and passing both
 * rewrites it from the errors that currently exist.
 *
 * @param argv - The arguments passed to this script.
 */
export async function lintTscSuppressions(
  argv: readonly string[],
): Promise<void> {
  const suppressionsFilePath = path.join(REPO_ROOT, TSC_SUPPRESSIONS_FILE_NAME);

  // `lines` has execa split the output for us, rather than buffering it all
  // into one string only to split it again here.
  const { all, exitCode } = await execa(
    'tsc',
    ['--build', 'tsconfig.lint.json', '--pretty', 'false'],
    {
      cwd: REPO_ROOT,
      reject: false,
      all: true,
      lines: true,
      preferLocal: true,
    },
  );
  const lines = all ?? [];
  const diagnostics = parseTscOutput(lines);
  const errors = diagnostics.filter(isTscError);

  // `tsc` exits non-zero whenever it reports type errors, which are expected
  // here and may well be suppressed, so the exit code alone says little. A run
  // is only genuinely broken if it reported a diagnostic that belongs to no
  // file, or if it failed without reporting any type errors at all. Neither can
  // be suppressed, and neither may be mistaken for a clean run.
  const filelessDiagnostics = diagnostics.filter(
    (diagnostic) => !isTscError(diagnostic),
  );
  if (
    filelessDiagnostics.length > 0 ||
    (exitCode !== 0 && errors.length === 0)
  ) {
    console.log(
      filelessDiagnostics.length > 0
        ? filelessDiagnostics
            .map(({ code, message }) => `error ${code}: ${message}`)
            .join('\n')
        : lines.join('\n'),
    );
    throw new Error(
      '`tsc` failed for a reason other than the type errors it reported.',
    );
  }

  const shouldAdd = argv.includes('--suppress-all');
  const shouldPrune = argv.includes('--prune-suppressions');

  if (shouldAdd || shouldPrune) {
    const existing = await readSuppressions(suppressionsFilePath);
    const added = shouldAdd
      ? addSuppressions({ suppressions: existing, errors })
      : existing;
    const suppressions = shouldPrune
      ? pruneSuppressions({ suppressions: added, errors })
      : added;

    await writeSuppressions({
      filePath: suppressionsFilePath,
      suppressions,
    });

    const total = Object.values(suppressions)
      .flatMap((byCode) => Object.values(byCode))
      .reduce((sum, { count }) => sum + count, 0);
    console.log(
      `✅ Updated ${TSC_SUPPRESSIONS_FILE_NAME}: now suppressing ${total} type error(s) across ${Object.keys(suppressions).length} file(s).`,
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
