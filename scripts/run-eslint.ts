import chalk from 'chalk';
import { ESLint } from 'eslint';
import fs from 'fs';
import path from 'path';
import yargs from 'yargs';

const PROJECT_DIRECTORY = path.resolve(__dirname, '..');

const WARNING_THRESHOLDS_FILE = path.join(
  PROJECT_DIRECTORY,
  'eslint-warning-thresholds.json',
);

/**
 * A two-level object mapping path to files in which warnings appear to the IDs
 * of rules for those warnings, then from rule IDs to the number of warnings for
 * the rule.
 *
 * @example
 * ``` ts
 * {
 *   "foo.ts": {
 *     "rule1": 3,
 *     "rule2": 4
 *   },
 *   "bar.ts": {
 *     "rule3": 17,
 *     "rule4": 5
 *   }
 * }
 * ```
 */
type WarningCounts = Record<string, Record<string, number>>;

/**
 * An object indicating the difference in warnings for a specific rule.
 */
type WarningComparison = {
  /** The file path of the ESLint rule. */
  filePath: string;
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
      chalk.blue(
        'The following lint violations were produced and will be captured as thresholds for future runs:\n',
      ),
    );
    for (const [filePath, ruleCounts] of Object.entries(warningCounts)) {
      console.log(chalk.underline(filePath));
      for (const [ruleId, count] of Object.entries(ruleCounts)) {
        console.log(`  ${chalk.cyan(ruleId)}: ${count}`);
      }
    }
    saveWarningThresholds(warningCounts);
  } else {
    const comparisonsByFile = compareWarnings(warningThresholds, warningCounts);

    const changes = Object.values(comparisonsByFile)
      .flat()
      .filter((comparison) => comparison.difference !== 0);
    const regressions = Object.values(comparisonsByFile)
      .flat()
      .filter((comparison) => comparison.difference > 0);

    if (changes.length > 0) {
      if (regressions.length > 0) {
        console.log(
          chalk.red(
            '🛑 New lint violations have been introduced and need to be resolved for linting to pass:\n',
          ),
        );

        for (const [filePath, fileChanges] of Object.entries(
          comparisonsByFile,
        )) {
          if (fileChanges.some((fileChange) => fileChange.difference > 0)) {
            console.log(chalk.underline(filePath));
            for (const {
              ruleId,
              threshold,
              count,
              difference,
            } of fileChanges) {
              if (difference > 0) {
                console.log(
                  `  ${chalk.cyan(ruleId)}: ${threshold} -> ${count} (${difference > 0 ? chalk.red(`+${difference}`) : chalk.green(difference)})`,
                );
              }
            }
          }
        }

        process.exitCode = 1;
      } else {
        console.log(
          chalk.green(
            'The overall number of ESLint warnings has decreased, good work! ❤️ \n',
          ),
        );

        for (const [filePath, fileChanges] of Object.entries(
          comparisonsByFile,
        )) {
          if (fileChanges.some((fileChange) => fileChange.difference !== 0)) {
            console.log(chalk.underline(filePath));
            for (const {
              ruleId,
              threshold,
              count,
              difference,
            } of fileChanges) {
              if (difference !== 0) {
                console.log(
                  `  ${chalk.cyan(ruleId)}: ${threshold} -> ${count} (${difference > 0 ? chalk.red(`+${difference}`) : chalk.green(difference)})`,
                );
              }
            }
          }
        }

        console.log(
          `\n${chalk.yellow.bold(path.basename(WARNING_THRESHOLDS_FILE))}${chalk.yellow(' has been updated with the new counts. Please make sure to commit the changes.')}`,
        );

        saveWarningThresholds(warningCounts);
      }
    }
  }
}

/**
 * Loads previous warning thresholds from a file.
 *
 * @returns The warning thresholds loaded from file.
 */
function loadWarningThresholds(): WarningCounts {
  if (fs.existsSync(WARNING_THRESHOLDS_FILE)) {
    const data = fs.readFileSync(WARNING_THRESHOLDS_FILE, 'utf-8');
    return JSON.parse(data);
  }
  return {};
}

/**
 * Saves current warning counts to a file so they can be referenced in a future
 * run.
 *
 * @param newWarningCounts - The new warning thresholds to save.
 */
function saveWarningThresholds(newWarningCounts: WarningCounts): void {
  fs.writeFileSync(
    WARNING_THRESHOLDS_FILE,
    `${JSON.stringify(newWarningCounts, null, 2)}\n`,
    'utf-8',
  );
}

/**
 * Given a list of results from an the ESLint run, counts the number of warnings
 * produced per file and rule.
 *
 * @param results - The ESLint results.
 * @returns A two-level object mapping path to files in which warnings appear to
 * the IDs of rules for those warnings, then from rule IDs to the number of
 * warnings for the rule.
 */
function getWarningCounts(results: ESLint.LintResult[]): WarningCounts {
  const unsortedWarningCounts = results.reduce(
    (workingWarningCounts, result) => {
      const { filePath } = result;
      const relativeFilePath = path.relative(PROJECT_DIRECTORY, filePath);
      for (const message of result.messages) {
        if (message.severity === WARNING && message.ruleId) {
          if (!workingWarningCounts[relativeFilePath]) {
            workingWarningCounts[relativeFilePath] = {};
          }
          workingWarningCounts[relativeFilePath][message.ruleId] =
            (workingWarningCounts[relativeFilePath][message.ruleId] ?? 0) + 1;
        }
      }
      return workingWarningCounts;
    },
    {} as WarningCounts,
  );

  const sortedWarningCounts: WarningCounts = {};
  for (const filePath of Object.keys(unsortedWarningCounts).sort()) {
    // We can safely assume this property is present.
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const unsortedWarningCountsForFile = unsortedWarningCounts[filePath]!;
    sortedWarningCounts[filePath] = Object.keys(unsortedWarningCountsForFile)
      .sort(sortRules)
      .reduce(
        (acc, ruleId) => {
          // We can safely assume this property is present.
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          acc[ruleId] = unsortedWarningCountsForFile[ruleId]!;
          return acc;
        },
        {} as Record<string, number>,
      );
  }
  return sortedWarningCounts;
}

/**
 * Compares previous and current warning counts.
 *
 * @param warningThresholds - The previously recorded warning thresholds
 * (organized by file and then rule).
 * @param warningCounts - The current warning counts (organized by file and then
 * rule).
 * @returns An object mapping file paths to arrays of objects indicating
 * comparisons in warnings.
 */
function compareWarnings(
  warningThresholds: WarningCounts,
  warningCounts: WarningCounts,
): Record<string, WarningComparison[]> {
  const comparisons: Record<string, WarningComparison[]> = {};
  const filePaths = Array.from(
    new Set([...Object.keys(warningThresholds), ...Object.keys(warningCounts)]),
  );

  for (const filePath of filePaths) {
    const ruleIds = Array.from(
      new Set([
        ...Object.keys(warningThresholds[filePath] || {}),
        ...Object.keys(warningCounts[filePath] || {}),
      ]),
    );

    comparisons[filePath] = ruleIds
      .map((ruleId) => {
        const threshold = warningThresholds[filePath]?.[ruleId] ?? 0;
        const count = warningCounts[filePath]?.[ruleId] ?? 0;
        const difference = count - threshold;
        return { filePath, ruleId, threshold, count, difference };
      })
      .sort((a, b) => sortRules(a.ruleId, b.ruleId));
  }

  return Object.keys(comparisons)
    .sort()
    .reduce(
      (sortedComparisons, filePath) => {
        // We can safely assume this property is present.
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        sortedComparisons[filePath] = comparisons[filePath]!;
        return sortedComparisons;
      },
      {} as Record<string, WarningComparison[]>,
    );
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
