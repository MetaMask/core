import { DefaultReporter } from 'vitest/node';
import type { TestModule } from 'vitest/node';

/**
 * Get the `VITEST_BLOB_LABEL` (e.g., the Node.js version) of the run that
 * produced a test module. It is only set when merging blob reports.
 *
 * @param testModule - The test module.
 * @returns The label, or an empty string if there is none.
 */
function getLabel(testModule: TestModule): string {
  return testModule.meta().__vitest_label__ ?? '';
}

/**
 * Compare two test modules by package name, then label, then path.
 *
 * @param a - The first test module.
 * @param b - The second test module.
 * @returns The sort order of the modules.
 */
function compareModules(a: TestModule, b: TestModule): number {
  const byProject = a.project.name.localeCompare(b.project.name);
  if (byProject !== 0) {
    return byProject;
  }

  const byLabel = getLabel(a).localeCompare(getLabel(b), undefined, {
    numeric: true,
  });

  if (byLabel !== 0) {
    return byLabel;
  }

  return a.moduleId.localeCompare(b.moduleId);
}

/**
 * The default reporter, but without a TTY (e.g., in CI) it prints the files
 * sorted by package, label, and path, instead of in the order they finish,
 * which is random because files run in parallel. All files are printed at the
 * end of the run, so there is no live output.
 */
export default class SortedReporter extends DefaultReporter {
  readonly #finished: TestModule[] = [];

  onTestModuleEnd(testModule: TestModule): void {
    if (this.isTTY) {
      super.onTestModuleEnd(testModule);
      return;
    }

    this.#finished.push(testModule);
  }

  onTestRunEnd(...args: Parameters<DefaultReporter['onTestRunEnd']>): void {
    for (const testModule of this.#finished.sort(compareModules)) {
      super.onTestModuleEnd(testModule);
    }

    this.#finished.length = 0;
    super.onTestRunEnd(...args);
  }
}
