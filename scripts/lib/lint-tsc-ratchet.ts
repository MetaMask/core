import { execa } from 'execa';
import path from 'path';
import { fileURLToPath } from 'url';

import {
  findAddedSuppressions,
  printAddedSuppressions,
  readSuppressions,
} from './tsc-suppressions.ts';
import type { TscSuppressions } from './tsc-suppressions.ts';

const REPO_ROOT = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
);

const SUPPRESSIONS_FILE_NAME = 'tsc-suppressions.json';

/**
 * The first parent of the merge commit that CI checks a pull request out as,
 * which is the branch the work is destined for.
 */
const DEFAULT_BASE_REF = 'HEAD^1';

/**
 * Checks that no type errors have been added to the suppressions file.
 *
 * `lint:tsc:check` keeps errors that are not suppressed from landing, but its
 * escape hatch — regenerating the file — can be used to paper over new errors
 * rather than fix them. This closes that hatch: measured against the base
 * branch, the file may only shrink.
 *
 * CI checks a pull request out as the merge of the branch into its base, so the
 * base is simply the first parent, and the file in the working tree already has
 * the base's own changes folded in. That leaves this to compare two files, with
 * no merge base to work out and nothing to fetch.
 *
 * Pass a ref to compare against something else, which is useful when running
 * this outside of CI, where there is no merge commit.
 *
 * @param argv - The arguments passed to this script.
 */
export async function lintTscRatchet(argv: readonly string[]): Promise<void> {
  const baseRef = argv[0] ?? DEFAULT_BASE_REF;

  // Left to throw if the ref or the file is missing, as a check that cannot
  // find its baseline must not wave the change through.
  const { stdout } = await execa(
    'git',
    ['show', `${baseRef}:${SUPPRESSIONS_FILE_NAME}`],
    { cwd: REPO_ROOT },
  );
  const base = JSON.parse(stdout) as TscSuppressions;

  const current = await readSuppressions(
    path.join(REPO_ROOT, SUPPRESSIONS_FILE_NAME),
  );
  const added = findAddedSuppressions({ current, base });
  printAddedSuppressions(added);

  if (added.length > 0) {
    process.exitCode = 1;
  }
}
