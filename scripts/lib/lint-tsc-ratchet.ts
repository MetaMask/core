import execa from 'execa';
import path from 'path';

import {
  findAddedSuppressions,
  printAddedSuppressions,
  readSuppressions,
} from './tsc-suppressions.js';
import type { TscSuppressions } from './tsc-suppressions.js';

const REPO_ROOT = path.join(import.meta.dirname, '..', '..');

const SUPPRESSIONS_FILE_NAME = 'tsc-suppressions.json';

const DEFAULT_BASE_REF = 'origin/main';

/**
 * Reads the value that follows an option in the given arguments.
 *
 * @param argv - The arguments passed to this script.
 * @param option - The option to look for.
 * @returns The value following the option, or undefined if it is absent.
 */
function getOptionValue(
  argv: readonly string[],
  option: string,
): string | undefined {
  const index = argv.indexOf(option);
  return index === -1 ? undefined : argv[index + 1];
}

/**
 * Runs a Git command, returning nothing if it fails.
 *
 * @param args - The arguments to pass to Git.
 * @returns The trimmed standard output, or undefined if Git exited non-zero.
 */
async function git(args: string[]): Promise<string | undefined> {
  const { stdout, exitCode } = await execa('git', args, {
    cwd: REPO_ROOT,
    reject: false,
  });
  return exitCode === 0 ? stdout.trim() : undefined;
}

/**
 * Finds the commit to compare against.
 *
 * The merge base is preferred, so that suppressions removed on the base branch
 * since this branch was cut are not mistaken for additions. Where it cannot be
 * determined — a shallow clone, say — the base ref itself is used.
 *
 * @param baseRef - The branch this work is destined for.
 * @returns The ref to read the baseline suppressions from.
 */
async function resolveComparisonRef(baseRef: string): Promise<string> {
  return (await git(['merge-base', 'HEAD', baseRef])) ?? baseRef;
}

/**
 * Reads the suppressions file as it stands at the given ref.
 *
 * @param ref - The ref to read the file from.
 * @returns The suppressions it holds, or undefined if the file does not exist
 * there.
 */
async function readSuppressionsAtRef(
  ref: string,
): Promise<TscSuppressions | undefined> {
  const contents = await git(['show', `${ref}:${SUPPRESSIONS_FILE_NAME}`]);
  return contents === undefined
    ? undefined
    : (JSON.parse(contents) as TscSuppressions);
}

/**
 * Checks that no type errors have been added to the suppressions file.
 *
 * `lint:tsc:check` keeps errors that are not suppressed from landing, but its
 * escape hatch — regenerating the file — can be used to paper over new errors
 * rather than fix them. This closes that hatch: measured against the base
 * branch, the file may only shrink.
 *
 * Pass `--base <ref>` to compare against a branch other than `origin/main`.
 *
 * @param argv - The arguments passed to this script.
 */
export async function lintTscRatchet(argv: readonly string[]): Promise<void> {
  const baseRef = getOptionValue(argv, '--base') ?? DEFAULT_BASE_REF;
  const comparisonRef = await resolveComparisonRef(baseRef);

  // A ref that cannot be resolved would leave nothing to compare against, and
  // this check must fail rather than wave the change through.
  if (
    (await git(['rev-parse', '--verify', `${comparisonRef}^{commit}`])) ===
    undefined
  ) {
    throw new Error(
      `Cannot resolve ${comparisonRef}. Fetch the base branch and try again.`,
    );
  }

  const base = await readSuppressionsAtRef(comparisonRef);
  if (base === undefined) {
    console.log(
      `ℹ️ ${SUPPRESSIONS_FILE_NAME} does not exist at ${comparisonRef}, so there is nothing to compare against.`,
    );
    return;
  }

  const current = await readSuppressions(
    path.join(REPO_ROOT, SUPPRESSIONS_FILE_NAME),
  );
  const added = findAddedSuppressions({ current, base });
  printAddedSuppressions(added);

  if (added.length > 0) {
    process.exitCode = 1;
  }
}
