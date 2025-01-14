import { ESLint } from 'eslint';
import fs from 'fs';
import path from 'path';
import yargs from 'yargs';

const EXISTING_WARNINGS_FILE = path.resolve(
  __dirname,
  '../eslint-warning-thresholds.json',
);

/**
 * An object mapping rule IDs to their warning counts.
 */
type WarningCounts = Record<string, number>;

/**
 * An object indicating the difference in warnings for a specific rule.
 */
type WarningComparison = {
  /** The ID of the ESLint rule. */
  ruleId: string;
  /** The previous count of warnings for the rule. */
  threshold: number;
  /** The current count of warnings for the rule. */
  count: number;
  /** The difference between the count and the threshold for the rule. */
  difference: number;
};

/**
 * The warning severity of level of an ESLint rule.
 */
const WARNING = 1;

// Run the script.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

/**
 * The entrypoint to this script.
 */
async function main() {
  const { cache, fix, quiet } = parseCommandLineArguments();

  const eslint = new ESLint({ cache, fix });
  const results = await runESLint(eslint, { fix, quiet });
  const hasErrors = results.some((result) => result.errorCount > 0);

  if (!quiet && !hasErrors) {
    evaluateWarnings(results);
  }
}

/**
 * Uses `yargs` to parse the arguments given to the script.
 *
 * @returns The parsed arguments.
 */
function parseCommandLineArguments() {
  return yargs(process.argv.slice(2))
    .option('cache', {
      type: 'boolean',
      description: 'Cache results to speed up future runs',
      default: false,
    })
    .option('fix', {
      type: 'boolean',
      description: 'Automatically fix problems',
      default: false,
    })
    .option('quiet', {
      type: 'boolean',
      description:
        'Only report errors, disabling the warnings quality gate in the process',
      default: false,
    })
    .help().argv;
}

/**
 * Runs ESLint on the project files.
 *
 * @param eslint - The ESLint instance.
 * @param options - The options for running ESLint.
 * @param options.quiet - Whether to only report errors (true) or not (false).
 * @param options.fix - Whether to automatically fix problems (true) or not
 * (false).
 * @returns A promise that resolves to the lint results.
 */
async function runESLint(
  eslint: ESLint,
  options: { quiet: boolean; fix: boolean },
): Promise<ESLint.LintResult[]> {
  let results = await eslint.lintFiles(['.']);
  const errorResults = ESLint.getErrorResults(results);

  if (errorResults.length > 0) {
    process.exitCode = 1;
  }

  if (options.quiet) {
    results = errorResults;
  }

  const formatter = await eslint.loadFormatter('stylish');
  const resultText = formatter.format(results);
  console.log(resultText);

  if (options.fix) {
    await ESLint.outputFixes(results);
  }

  return results;
}

/**
 * This function represents the ESLint warnings quality gate, which will cause
 * linting to pass or fail depending on how many new warnings have been
 * produced.
 *
 * - If we have no record of warnings from a previous run, then we simply
 * capture the new warnings in a file and continue.
 * - If we have a record of warnings from a previous run and there are any
 * changes to the number of warnings overall, then we list which ESLint rules
 * had increases and decreases. If are were more warnings overall then we fail,
 * otherwise we pass.
 *
 * @param results - The results of running ESLint.
 */
function evaluateWarnings(results: ESLint.LintResult[]) {
  const warningThresholds = loadWarningThresholds();
  const warningCounts = getWarningCounts(results);

  if (Object.keys(warningThresholds).length === 0) {
    console.log(
      'The following ESLint warnings were produced and will be captured as thresholds for future runs:\n',
    );
    for (const [ruleId, count] of Object.entries(warningCounts)) {
      console.log(`- ${ruleId}: ${count}`);
    }
    saveWarningThresholds(warningCounts);
  } else {
    const comparisons = compareWarnings(warningThresholds, warningCounts);

    const changes = comparisons.filter(
      (comparison) => comparison.difference !== 0,
    );
    const regressions = comparisons.filter(
      (comparison) => comparison.difference > 0,
    );

    if (changes.length > 0) {
      if (regressions.length > 0) {
        console.log(
          '🛑 New ESLint warnings have been introduced and need to be resolved for linting to pass:\n',
        );
        process.exitCode = 1;
      } else {
        console.log(
          'The overall number of ESLint warnings have decreased, good work! ❤️ \n',
        );
        // We are still seeing differences on CI when it comes to linting
        // results. Never write the thresholds file in that case.
        // eslint-disable-next-line n/no-process-env
        if (!process.env.CI) {
          saveWarningThresholds(warningCounts);
        }
      }

      for (const { ruleId, threshold, count, difference } of changes) {
        console.log(
          `- ${ruleId}: ${threshold} -> ${count} (${difference > 0 ? '+' : ''}${difference})`,
        );
      }
    }
  }
}

/**
 * Loads previous warning counts from a file.
 *
 * @returns An object mapping rule IDs to their previous warning counts.
 */
function loadWarningThresholds(): WarningCounts {
  if (fs.existsSync(EXISTING_WARNINGS_FILE)) {
    const data = fs.readFileSync(EXISTING_WARNINGS_FILE, 'utf-8');
    return JSON.parse(data);
  }
  return {};
}

/**
 * Saves current warning counts to a file so they can be used for a future run.
 *
 * @param warningCounts - An object mapping rule IDs to their current warning
 * counts.
 */
function saveWarningThresholds(warningCounts: WarningCounts): void {
  fs.writeFileSync(
    EXISTING_WARNINGS_FILE,
    `${JSON.stringify(warningCounts, null, 2)}\n`,
    'utf-8',
  );
}

/**
 * Given a list of results from an the ESLint run, counts the number of warnings
 * produced per rule.
 *
 * @param results - The ESLint results.
 * @returns An object mapping rule IDs to their warning counts, sorted by rule
 * ID.
 */
function getWarningCounts(results: ESLint.LintResult[]): WarningCounts {
  const warningCounts = results.reduce((acc, result) => {
    for (const message of result.messages) {
      if (message.severity === WARNING && message.ruleId) {
        acc[message.ruleId] = (acc[message.ruleId] ?? 0) + 1;
      }
    }
    return acc;
  }, {} as WarningCounts);

  return Object.keys(warningCounts)
    .sort(sortRules)
    .reduce((sortedWarningCounts, key) => {
      return { ...sortedWarningCounts, [key]: warningCounts[key] };
    }, {} as WarningCounts);
}

/**
 * Compares previous and current warning counts.
 *
 * @param warningThresholds - An object mapping rule IDs to the warning
 * thresholds established in a previous run.
 * @param warningCounts - An object mapping rule IDs to the current warning
 * counts.
 * @returns An array of objects indicating comparisons in warnings.
 */
function compareWarnings(
  warningThresholds: WarningCounts,
  warningCounts: WarningCounts,
): WarningComparison[] {
  const ruleIds = Array.from(
    new Set([...Object.keys(warningThresholds), ...Object.keys(warningCounts)]),
  );
  return ruleIds
    .map((ruleId) => {
      const threshold = warningThresholds[ruleId] ?? 0;
      const count = warningCounts[ruleId] ?? 0;
      const difference = count - threshold;
      return { ruleId, threshold, count, difference };
    })
    .sort((a, b) => sortRules(a.ruleId, b.ruleId));
}

/**
 * Sorts rule IDs, ensuring that rules with namespaces appear before rules
 * without.
 *
 * @param ruleIdA - The first rule ID.
 * @param ruleIdB - The second rule ID.
 * @returns A negative number if the first rule ID should come before the
 * second, a positive number if the first should come _after_ the second, or 0
 * if they should stay where they are.
 * @example
 * ``` typescript
 * sortRules(
 *   '@typescript-eslint/naming-convention',
 *   '@typescript-eslint/explicit-function-return-type'
 * ) //=> 1 (sort A after B)
 * sortRules(
 *   'explicit-function-return-type',
 *   '@typescript-eslint/naming-convention'
 * ) //=> 1 (sort A after B)
 */
function sortRules(ruleIdA: string, ruleIdB: string): number {
  const [namespaceA, ruleA] = ruleIdA.includes('/')
    ? ruleIdA.split('/')
    : ['', ruleIdA];
  const [namespaceB, ruleB] = ruleIdB.includes('/')
    ? ruleIdB.split('/')
    : ['', ruleIdB];
  if (namespaceA && !namespaceB) {
    return -1;
  }
  if (!namespaceA && namespaceB) {
    return 1;
  }
  return namespaceA.localeCompare(namespaceB) || ruleA.localeCompare(ruleB);
}
