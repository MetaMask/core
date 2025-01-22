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
 * The parsed command-line arguments.
 */
type CommandLineArguments = {
  /**
   * Whether to cache results to speed up future runs (true) or not (false).
   */
  cache: boolean;
  /**
   * A list of specific files to lint.
   */
  files: string[];
  /**
   * Whether to automatically fix lint errors (true) or not (false).
   */
  fix: boolean;
  /**
   * Whether to only report errors, disabling the warnings quality gate in the
   * process (true) or not (false).
   */
  quiet: boolean;
};

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
 * The severity level for an ESLint message.
 */
enum ESLintMessageSeverity {
  Warning = 1,
  // This isn't a variable.
  // eslint-disable-next-line @typescript-eslint/no-shadow
  Error = 2,
}

/**
 * The result of applying the quality gate.
 */
enum QualityGateStatus {
  /**
   * The number of lint warnings increased.
   */
  Increase = 'increase',
  /**
   * The number of lint warnings decreased.
   */
  Decrease = 'decrease',
  /**
   * There was no change to the number of lint warnings.
   */
  NoChange = 'no-change',
  /**
   * The warning thresholds file did not previously exist.
   */
  Initialized = 'initialized',
}

// Run the script.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

/**
 * The entrypoint to this script.
 */
async function main() {
  const { cache, fix, files: givenFiles, quiet } = parseCommandLineArguments();

  const eslint = new ESLint({
    cache,
    errorOnUnmatchedPattern: false,
    fix,
    ruleFilter: ({ severity }) =>
      !quiet || severity === ESLintMessageSeverity.Error,
  });

  const fileFilteredResults = await eslint.lintFiles(
    givenFiles.length > 0 ? givenFiles : ['.'],
  );

  const filteredResults = quiet
    ? ESLint.getErrorResults(fileFilteredResults)
    : fileFilteredResults;

  await printResults(eslint, filteredResults);

  if (fix) {
    await ESLint.outputFixes(fileFilteredResults);
  }
  const hasErrors = filteredResults.some((result) => result.errorCount > 0);

  const qualityGateStatus = applyWarningThresholdsQualityGate({
    results: filteredResults,
  });

  if (hasErrors || qualityGateStatus === QualityGateStatus.Increase) {
    process.exitCode = 1;
  }
}

/**
 * Uses `yargs` to parse the arguments given to the script.
 *
 * @returns The parsed arguments.
 */
function parseCommandLineArguments(): CommandLineArguments {
  const { cache, fix, quiet, ...rest } = yargs(process.argv.slice(2))
    .option('cache', {
      type: 'boolean',
      description: 'Cache results to speed up future runs',
      default: false,
    })
    .option('fix', {
      type: 'boolean',
      description:
        'Automatically fix all problems; pair with --quiet to only fix errors',
      default: false,
    })
    .option('quiet', {
      type: 'boolean',
      description: 'Only report or fix errors',
      default: false,
    })
    .help()
    .string('_').argv;

  // Type assertion: The types for `yargs`'s `string` method are wrong.
  const files = rest._ as string[];

  return { cache, fix, quiet, files };
}

/**
 * Uses the given results to print the output that `eslint` usually generates.
 *
 * @param eslint - The ESLint instance.
 * @param results - The results from running `eslint`.
 */
async function printResults(
  eslint: ESLint,
  results: ESLint.LintResult[],
): Promise<void> {
  const formatter = await eslint.loadFormatter('stylish');
  const resultText = await formatter.format(results);
  if (resultText.length > 0) {
    console.log(resultText);
  }
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
 * @param args - The arguments.
 * @param args.results - The results from running `eslint`.
 * param args.countFileEvenIfNoWarnings - Includes a file in the returned
 * object even if there are no recorded warnings for it.
 * param args.fileUpdateStrategy - How to update the warning thresholds file.
 * @returns True if the number of warnings has increased compared to the
 * existing number of warnings, false if they have decreased or stayed the same.
 */
function applyWarningThresholdsQualityGate({
  results,
}: {
  results: ESLint.LintResult[];
}): QualityGateStatus {
  const warningThresholds = loadWarningThresholds();
  const warningCounts = getWarningCounts({
    results,
  });

  const completeWarningCounts = removeFilesWithoutWarnings({
    ...warningThresholds,
    ...warningCounts,
  });

  if (Object.keys(warningThresholds).length === 0) {
    console.log(
      chalk.blue(
        'The following lint violations were produced and will be captured as thresholds for future runs:\n',
      ),
    );

    for (const [filePath, ruleCounts] of Object.entries(
      completeWarningCounts,
    )) {
      console.log(chalk.underline(filePath));
      for (const [ruleId, count] of Object.entries(ruleCounts)) {
        console.log(`  ${chalk.cyan(ruleId)}: ${count}`);
      }
    }

    saveWarningThresholds(completeWarningCounts);

    return QualityGateStatus.Initialized;
  }

  const comparisonsByFile = compareWarnings(
    warningThresholds,
    completeWarningCounts,
  );

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

      for (const [filePath, fileChanges] of Object.entries(comparisonsByFile)) {
        if (fileChanges.some((fileChange) => fileChange.difference > 0)) {
          console.log(chalk.underline(filePath));
          for (const { ruleId, threshold, count, difference } of fileChanges) {
            if (difference > 0) {
              console.log(
                `  ${chalk.cyan(ruleId)}: ${threshold} -> ${count} (${difference > 0 ? chalk.red(`+${difference}`) : chalk.green(difference)})`,
              );
            }
          }
        }
      }

      return QualityGateStatus.Increase;
    }

    console.log(
      chalk.green(
        'The overall number of lint warnings has decreased, good work! ❤️ \n',
      ),
    );

    for (const [filePath, fileChanges] of Object.entries(comparisonsByFile)) {
      if (fileChanges.some((fileChange) => fileChange.difference !== 0)) {
        console.log(chalk.underline(filePath));
        for (const { ruleId, threshold, count, difference } of fileChanges) {
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

    saveWarningThresholds(completeWarningCounts);

    return QualityGateStatus.Decrease;
  }

  return QualityGateStatus.NoChange;
}

/**
 * Removes properties from the given warning counts object that have no warnings.
 *
 * @param warningCounts - The warning counts.
 * @returns The transformed warning counts.
 */
function removeFilesWithoutWarnings(warningCounts: WarningCounts) {
  return Object.entries(warningCounts).reduce(
    (newWarningCounts: WarningCounts, [filePath, warnings]) => {
      if (Object.keys(warnings).length === 0) {
        return newWarningCounts;
      }
      return { ...newWarningCounts, [filePath]: warnings };
    },
    {},
  );
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
 * @param args - The arguments.
 * @param args.results - The results from running `eslint`.
 * param args.countFileEvenIfNoWarnings - Includes a file in the returned
 * object even if there are no recorded warnings for it.
 * @returns A two-level object mapping path to files in which warnings appear to
 * the IDs of rules for those warnings, then from rule IDs to the number of
 * warnings for the rule.
 */
function getWarningCounts({
  results,
}: {
  results: ESLint.LintResult[];
}): WarningCounts {
  const unsortedWarningCounts = results.reduce(
    (workingWarningCounts, result) => {
      const { filePath } = result;
      const relativeFilePath = path.relative(PROJECT_DIRECTORY, filePath);
      if (!workingWarningCounts[relativeFilePath]) {
        workingWarningCounts[relativeFilePath] = {};
      }
      for (const message of result.messages) {
        if (
          message.severity === ESLintMessageSeverity.Warning &&
          message.ruleId
        ) {
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
