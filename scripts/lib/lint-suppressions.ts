import { execa } from 'execa';
import path from 'path';
import { fileURLToPath } from 'url';

import {
  TSC_SUPPRESSIONS_FILE_NAME,
  readSuppressions,
} from './tsc-suppressions.ts';

const REPO_ROOT = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
);

/**
 * The file in which the lint problems that are knowingly ignored are recorded.
 */
const OXLINT_SUPPRESSIONS_FILE_NAME = 'oxlint-suppressions.json';

/**
 * The suppressions files this guards, which Oxlint and the type error checker
 * write in the same shape.
 */
const SUPPRESSIONS_FILE_NAMES = [
  OXLINT_SUPPRESSIONS_FILE_NAME,
  TSC_SUPPRESSIONS_FILE_NAME,
];

/**
 * The branch this work is destined for when there is no merge commit to read it
 * from, as there is not when running this locally.
 */
const FALLBACK_BASE_REF = 'origin/main';

/**
 * Problems that are knowingly ignored, counted by file and then by the rule or
 * error code that reports them. Oxlint and the type error checker both write
 * their suppressions this way.
 */
export type Suppressions = Record<string, Record<string, { count: number }>>;

/**
 * A suppression that covers more problems than the baseline it is compared
 * against, meaning that problems have been added rather than fixed.
 */
export type AddedSuppression = {
  filePath: string;
  rule: string;
  count: number;
  baseCount: number;
};

/**
 * Finds the suppressions that cover more problems than a baseline does.
 *
 * Suppressions are meant to be worked off, never added to: a problem that is
 * new should be fixed rather than recorded. Removing suppressions, or shrinking
 * their counts, is always allowed.
 *
 * @param args - The arguments to this function.
 * @param args.current - The suppressions as they now stand.
 * @param args.base - The suppressions to measure them against.
 * @returns Every suppression that grew or appeared, in file order.
 */
export function findAddedSuppressions({
  current,
  base,
}: {
  current: Suppressions;
  base: Suppressions;
}): AddedSuppression[] {
  const added: AddedSuppression[] = [];

  for (const [filePath, currentByRule] of Object.entries(current)) {
    for (const [rule, { count }] of Object.entries(currentByRule)) {
      const baseCount = base[filePath]?.[rule]?.count ?? 0;
      if (count > baseCount) {
        added.push({ filePath, rule, count, baseCount });
      }
    }
  }

  return added;
}

/**
 * Prints the suppressions that have been added to a file, if any.
 *
 * @param fileName - The suppressions file the additions were found in.
 * @param added - The added suppressions to print.
 */
export function printAddedSuppressions(
  fileName: string,
  added: AddedSuppression[],
): void {
  if (added.length === 0) {
    console.log(`✅ Nothing has been added to ${fileName}. Good job!`);
    return;
  }

  console.log(`❌ Detected suppressions added to ${fileName}:\n`);
  for (const suppression of added) {
    console.log(
      `  ${suppression.filePath}: ${suppression.rule} (${suppression.count} suppressed, was ${suppression.baseCount})`,
    );
  }
  console.log(
    '\nSuppressions may only be removed, never added. Fix the errors rather than suppressing them.',
  );
}

/**
 * Finds the commit holding the suppressions files to measure against.
 *
 * CI checks a pull request out as the merge of the branch into its base, so the
 * base is its first parent, and the files in the working tree already have the
 * base's own changes folded in. A merge commit made by hand is the other way
 * round, its first parent being the branch, so the shape of the commit is not
 * enough to go on and only CI's checkout is taken at face value. Anywhere else
 * the merge base with the target branch stands in for it.
 *
 * @param targetRef - The branch this work is destined for.
 * @returns The ref to read the baseline from.
 */
async function resolveBaseRef(targetRef: string): Promise<string> {
  if (process.env.GITHUB_ACTIONS === 'true') {
    return 'HEAD^1';
  }

  const { stdout } = await execa('git', ['merge-base', 'HEAD', targetRef], {
    cwd: REPO_ROOT,
  });
  return stdout.trim();
}

/**
 * Checks that no problems have been added to any of the suppressions files.
 *
 * The lint and type error checks keep new problems from landing, but their
 * escape hatch — regenerating a suppressions file — can be used to paper over
 * one rather than fix it. This closes that hatch: measured against the base
 * branch, these files may only shrink.
 *
 * Pass a branch to measure against one other than `origin/main`.
 *
 * @param argv - The arguments passed to this script.
 */
export async function lintSuppressions(argv: readonly string[]): Promise<void> {
  const baseRef = await resolveBaseRef(argv[0] ?? FALLBACK_BASE_REF);
  let didPass = true;

  for (const fileName of SUPPRESSIONS_FILE_NAMES) {
    // Left to throw if the ref or the file is missing, as a check that cannot
    // find its baseline must not wave the change through.
    const { stdout } = await execa('git', ['show', `${baseRef}:${fileName}`], {
      cwd: REPO_ROOT,
    });
    const base = JSON.parse(stdout) as Suppressions;
    const current = await readSuppressions(path.join(REPO_ROOT, fileName));

    const added = findAddedSuppressions({ current, base });
    printAddedSuppressions(fileName, added);
    didPass = didPass && added.length === 0;
  }

  if (!didPass) {
    process.exitCode = 1;
  }
}
