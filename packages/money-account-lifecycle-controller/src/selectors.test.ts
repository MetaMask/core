import { describe, expect, it } from 'vitest';

import type { BindingMigratorStatus } from './binding-migration.js';
import { getDefaultMoneyAccountLifecycleControllerState } from './money-account-lifecycle-controller.js';
import type { MoneyAccountLifecycleControllerState } from './money-account-lifecycle-controller.js';
import { moneyAccountLifecycleControllerSelectors } from './selectors.js';

const { selectHasUnfinishedBindingMigrations } =
  moneyAccountLifecycleControllerSelectors;

function buildState(
  statuses: BindingMigratorStatus['status'][],
): MoneyAccountLifecycleControllerState {
  return {
    ...getDefaultMoneyAccountLifecycleControllerState(),
    bindingMigrations: Object.fromEntries(
      statuses.map((status, index) => [
        `migrator-${index}`,
        {
          phase: 'afterDone',
          status: { status },
          lastResult: null,
          lastError: null,
        },
      ]),
    ),
  };
}

describe('moneyAccountLifecycleControllerSelectors', () => {
  describe('selectHasUnfinishedBindingMigrations', () => {
    it('is false when no binding migration is recorded', () => {
      expect(selectHasUnfinishedBindingMigrations(buildState([]))).toBe(false);
    });

    it('is false when every binding migration is completed or not required', () => {
      expect(
        selectHasUnfinishedBindingMigrations(
          buildState(['completed', 'not_required']),
        ),
      ).toBe(false);
    });

    it.each(['pending', 'blocked', 'unknown'] as const)(
      'is true when a binding migration is %s',
      (status) => {
        expect(
          selectHasUnfinishedBindingMigrations(
            buildState(['completed', status]),
          ),
        ).toBe(true);
      },
    );
  });
});
