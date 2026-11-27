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

const {
  selectHasUnfinishedBindingMigrations,
  selectBlockedBindingMigrations,
  selectSkippedBindingMigrations,
} = moneyAccountLifecycleControllerSelectors;

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

    it.each<[string, BindingMigratorStatus['status']]>([
      ['a later phase', 'unknown'],
      ['the same phase', 'pending'],
    ])(
      'is false when a blocked migrator holds back an unfinished migrator in %s, as startMigration stops at the blocked phase',
      (_description, status) => {
        expect(
          selectHasUnfinishedBindingMigrations(
            buildState(MIGRATING, [
              ['afterLink', 'blocked'],
              ['afterLink', status],
              ['afterDone', status],
            ]),
          ),
        ).toBe(false);
      },
    );

    it('is true when an unfinished migrator comes before a blocked phase', () => {
      expect(
        selectHasUnfinishedBindingMigrations(
          buildState(MIGRATING, [
            ['beforeFundsTransfer', 'blocked'],
            ['afterLink', 'unknown'],
          ]),
        ),
      ).toBe(true);
    });

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

  describe('selectSkippedBindingMigrations', () => {
    it('is empty when no binding migration is recorded', () => {
      expect(
        selectSkippedBindingMigrations(
          getDefaultMoneyAccountLifecycleControllerState(),
        ),
      ).toStrictEqual([]);
    });

    it('is empty while every phase can still run', () => {
      expect(
        selectSkippedBindingMigrations(
          buildState(MIGRATING, [
            ['afterLink', 'unknown'],
            ['beforeFundsTransfer', 'pending'],
          ]),
        ),
      ).toStrictEqual([]);
    });

    it.each([
      ['the funds transfer has started', TRANSFERRING],
      ['the money account has migrated', MIGRATED],
    ])(
      'lists the pending and unknown migrators of passed phases once %s',
      (_description, lifecycle) => {
        expect(
          selectSkippedBindingMigrations(
            buildState(lifecycle, [
              ['afterLink', 'unknown'],
              ['afterLink', 'completed'],
              ['beforeFundsTransfer', 'pending'],
              ['beforeFundsTransfer', 'not_required'],
              ['beforeFundsTransfer', 'blocked'],
              ['afterDone', 'unknown'],
            ]),
          ),
        ).toStrictEqual(['migrator-0', 'migrator-2']);
      },
    );

    it('returns the same array while the state is unchanged', () => {
      const state = buildState(MIGRATED, [['afterLink', 'unknown']]);

      expect(selectSkippedBindingMigrations(state)).toBe(
        selectSkippedBindingMigrations({ ...state }),
      );
    });
  });
});
