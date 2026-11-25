import type {
  DerivedIdentity,
  DerivedIdentityMigration,
} from '@metamask/chomp-api-service';
import type { Hex } from '@metamask/utils';
import { describe, expect, it } from 'vitest';

import type {
  BindingMigrationPhase,
  BindingMigratorStatus,
} from './binding-migration.js';
import type { MoneyAccountLifecycle } from './get-money-account-lifecycle.js';
import { getDefaultMoneyAccountLifecycleControllerState } from './money-account-lifecycle-controller.js';
import type { MoneyAccountLifecycleControllerState } from './money-account-lifecycle-controller.js';
import { moneyAccountLifecycleControllerSelectors } from './selectors.js';

const { selectHasUnfinishedBindingMigrations, selectBlockedBindingMigrations } =
  moneyAccountLifecycleControllerSelectors;

const PREVIOUS_ADDRESS: Hex = '0x00000000000000000000000000000000000000aa';
const CURRENT_ADDRESS: Hex = '0x00000000000000000000000000000000000000dd';

const MIGRATION: DerivedIdentityMigration = {
  from: PREVIOUS_ADDRESS,
  to: CURRENT_ADDRESS,
  steps: [],
  transfer: null,
  premiumTransfer: null,
};

const MIGRATING_IDENTITY: DerivedIdentity = {
  currentAddress: PREVIOUS_ADDRESS,
  previousAddresses: [],
  status: 'MIGRATING',
  migration: MIGRATION,
};

const MIGRATING: MoneyAccountLifecycle = {
  type: 'migrating',
  identity: MIGRATING_IDENTITY,
};

const TRANSFERRING: MoneyAccountLifecycle = {
  type: 'migrating',
  identity: {
    ...MIGRATING_IDENTITY,
    migration: {
      ...MIGRATION,
      transfer: { requestId: 'request-id', status: 'PENDING' },
    },
  },
};

const MIGRATED: MoneyAccountLifecycle = {
  type: 'mfa',
  identity: {
    currentAddress: CURRENT_ADDRESS,
    previousAddresses: [PREVIOUS_ADDRESS],
    status: 'DONE',
    migration: null,
  },
};

function buildState(
  lifecycle: MoneyAccountLifecycle,
  migrators: [BindingMigrationPhase, BindingMigratorStatus['status']][],
): MoneyAccountLifecycleControllerState {
  return {
    ...getDefaultMoneyAccountLifecycleControllerState(),
    moneyAccounts: { [PREVIOUS_ADDRESS]: lifecycle },
    bindingMigrations: {
      migrationId: '0x01',
      previousAddress: PREVIOUS_ADDRESS,
      currentAddress: CURRENT_ADDRESS,
      migrators: Object.fromEntries(
        migrators.map(([phase, status], index) => [
          `migrator-${index}`,
          { phase, status, details: null, lastResult: null, lastError: null },
        ]),
      ),
    },
  };
}

describe('moneyAccountLifecycleControllerSelectors', () => {
  describe('selectHasUnfinishedBindingMigrations', () => {
    it('is false when no binding migration is recorded', () => {
      expect(
        selectHasUnfinishedBindingMigrations(
          getDefaultMoneyAccountLifecycleControllerState(),
        ),
      ).toBe(false);
    });

    it.each(['pending', 'unknown'] as const)(
      'is true when a migrator that can still run is %s',
      (status) => {
        expect(
          selectHasUnfinishedBindingMigrations(
            buildState(MIGRATING, [
              ['afterLink', 'completed'],
              ['beforeFundsTransfer', status],
            ]),
          ),
        ).toBe(true);
      },
    );

    it.each(['completed', 'not_required', 'blocked'] as const)(
      'is false when every migrator is %s',
      (status) => {
        expect(
          selectHasUnfinishedBindingMigrations(
            buildState(MIGRATING, [['afterDone', status]]),
          ),
        ).toBe(false);
      },
    );

    it.each([
      ['the funds transfer has started', TRANSFERRING],
      ['the money account has migrated', MIGRATED],
    ])(
      'ignores afterLink and beforeFundsTransfer migrators once %s',
      (_description, lifecycle) => {
        const state = buildState(lifecycle, [
          ['afterLink', 'unknown'],
          ['beforeFundsTransfer', 'pending'],
        ]);

        expect(selectHasUnfinishedBindingMigrations(state)).toBe(false);
        expect(
          selectHasUnfinishedBindingMigrations(
            buildState(lifecycle, [['afterDone', 'pending']]),
          ),
        ).toBe(true);
      },
    );
  });

  describe('selectBlockedBindingMigrations', () => {
    it('is empty when no binding migration is recorded', () => {
      expect(
        selectBlockedBindingMigrations(
          getDefaultMoneyAccountLifecycleControllerState(),
        ),
      ).toStrictEqual([]);
    });

    it('lists the ids of blocked migrators, whatever their phase', () => {
      expect(
        selectBlockedBindingMigrations(
          buildState(MIGRATED, [
            ['afterLink', 'blocked'],
            ['afterDone', 'pending'],
            ['afterDone', 'blocked'],
          ]),
        ),
      ).toStrictEqual(['migrator-0', 'migrator-2']);
    });

    it('returns the same array while the binding migrations are unchanged', () => {
      const state = buildState(MIGRATED, [['afterDone', 'blocked']]);

      expect(selectBlockedBindingMigrations(state)).toBe(
        selectBlockedBindingMigrations({ ...state }),
      );
    });
  });
});
