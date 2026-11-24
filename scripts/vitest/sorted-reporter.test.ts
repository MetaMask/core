import { afterEach, describe, expect, it, vi } from 'vitest';
import { DefaultReporter } from 'vitest/node';
import type { TestModule } from 'vitest/node';

import SortedReporter from './sorted-reporter.ts';

/**
 * Create a fake test module.
 *
 * @param project - The project name.
 * @param label - The blob label, if any.
 * @param moduleId - The module path.
 * @returns The fake module.
 */
function createModule(
  project: string,
  label: string | undefined,
  moduleId: string,
): TestModule {
  return {
    project: { name: project },
    meta: () => ({ __vitest_label__: label }),
    moduleId,
  } as unknown as TestModule;
}

describe('SortedReporter', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('prints files sorted by package, label, and path at the end of the run', () => {
    const printed: string[] = [];
    vi.spyOn(DefaultReporter.prototype, 'onTestModuleEnd').mockImplementation(
      (testModule) => {
        printed.push(testModule.moduleId);
      },
    );
    const onTestRunEnd = vi
      .spyOn(DefaultReporter.prototype, 'onTestRunEnd')
      .mockImplementation(() => {
        printed.push('summary');
      });

    const reporter = new SortedReporter();
    reporter.isTTY = false;

    reporter.onTestModuleEnd(createModule('b', '22.x', 'b-22'));
    reporter.onTestModuleEnd(createModule('a', '24.x', 'a-24'));
    reporter.onTestModuleEnd(createModule('a', '22.x', 'a-22-2'));
    reporter.onTestModuleEnd(createModule('a', '9.x', 'a-9'));
    reporter.onTestModuleEnd(createModule('a', '22.x', 'a-22-1'));
    expect(printed).toStrictEqual([]);

    reporter.onTestRunEnd([], [], 'passed');

    expect(printed).toStrictEqual([
      'a-9',
      'a-22-1',
      'a-22-2',
      'a-24',
      'b-22',
      'summary',
    ]);
    expect(onTestRunEnd).toHaveBeenCalledTimes(1);
  });

  it('prints files as they finish in a TTY', () => {
    const onTestModuleEnd = vi
      .spyOn(DefaultReporter.prototype, 'onTestModuleEnd')
      .mockImplementation(() => undefined);

    const reporter = new SortedReporter();
    reporter.isTTY = true;
    reporter.onTestModuleEnd(createModule('a', undefined, 'a'));

    expect(onTestModuleEnd).toHaveBeenCalledTimes(1);
  });
});
