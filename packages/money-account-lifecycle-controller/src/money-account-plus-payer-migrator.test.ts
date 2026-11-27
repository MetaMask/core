import type {
  DerivedIdentity,
  DerivedIdentityMigration,
} from '@metamask/chomp-api-service';
import type { Subscription } from '@metamask/subscription-controller';
import { createDeferredPromise } from '@metamask/utils';
import type { Hex } from '@metamask/utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  MFA_ACCOUNT_ADDRESS,
  MIGRATING_IDENTITY,
  MONEY_ACCOUNT_ADDRESS,
  MONEY_ACCOUNT_PLUS_SUBSCRIPTION,
  SFA_IDENTITY,
  SUBSCRIPTION_DELEGATION_HASH,
  SUCCESSOR_ADDRESS,
  buildBindingMigrator,
  buildCryptoSubscription,
  buildLinkedIdentityResponse,
  withController,
} from '../tests/helpers.js';
import type { BindingMigratorState } from './binding-migration.js';
import { MONEY_ACCOUNT_PLUS_PAYER_MIGRATOR_ID } from './index.js';
import type { MoneyAccountLifecycleController } from './money-account-lifecycle-controller.js';
import { moneyAccountLifecycleControllerSelectors } from './selectors.js';

const MPC_ADDRESS = MFA_ACCOUNT_ADDRESS.toLowerCase() as Hex;

const OTHER_ADDRESS: Hex = '0x00000000000000000000000000000000000000ee';

const SUBSCRIPTION_INTENT_STEPS: DerivedIdentityMigration['steps'] = [
  { step: 'SUCCESSOR_SUBSCRIPTION_INTENT', completed: false },
  { step: 'ROOT_DELEGATION', completed: false },
];

const PREMIUM_MIGRATING_IDENTITY: DerivedIdentity = {
  ...MIGRATING_IDENTITY,
  migration: {
    ...MIGRATING_IDENTITY.migration,
    steps: SUBSCRIPTION_INTENT_STEPS,
  },
};

const PREMIUM_MIGRATING_TO_MPC_IDENTITY: DerivedIdentity = {
  ...MIGRATING_IDENTITY,
  migration: {
    ...MIGRATING_IDENTITY.migration,
    to: MPC_ADDRESS,
    steps: SUBSCRIPTION_INTENT_STEPS,
  },
};

function getPayerMigrator(
  controller: MoneyAccountLifecycleController,
): BindingMigratorState | undefined {
  return controller.state.bindingMigrations?.migrators[
    MONEY_ACCOUNT_PLUS_PAYER_MIGRATOR_ID
  ];
}

describe('Money Account Plus payer binding migrator', () => {
  it('is registered without calling the messenger in the constructor', async () => {
    await withController(({ controller, mocks }) => {
      expect(mocks.getMoneyAccount).not.toHaveBeenCalled();
      expect(mocks.getSubscriptionControllerState).not.toHaveBeenCalled();
      expect(() =>
        controller.registerBindingMigrator({
          ...buildBindingMigrator(),
          id: MONEY_ACCOUNT_PLUS_PAYER_MIGRATOR_ID,
        }),
      ).toThrow(
        "A binding migrator with the id 'money-account-plus-payer' is already registered",
      );
    });
  });

  it('runs once every afterLink migrator has completed, before the migration intents are registered', async () => {
    await withController(async ({ controller, mocks }) => {
      const migrator = buildBindingMigrator({ phase: 'afterLink' });
      controller.registerBindingMigrator(migrator);
      mocks.getSubscriptions.mockResolvedValue([
        MONEY_ACCOUNT_PLUS_SUBSCRIPTION,
      ]);

      await controller.startMigration();

      const [getSubscriptionsOrder] =
        mocks.getSubscriptions.mock.invocationCallOrder;
      expect(getSubscriptionsOrder).toBeGreaterThan(
        migrator.reconcile.mock.invocationCallOrder[0],
      );
      expect(getSubscriptionsOrder).toBeLessThan(
        mocks.registerMigrationIntents.mock.invocationCallOrder[0],
      );
    });
  });

  it('does not move the subscription while an afterLink migrator is incomplete', async () => {
    await withController(async ({ controller, mocks }) => {
      const migrator = buildBindingMigrator({ phase: 'afterLink' });
      migrator.reconcile.mockResolvedValue({
        status: 'blocked',
        reason: 'Denied',
      });
      controller.registerBindingMigrator(migrator);
      mocks.getSubscriptions.mockResolvedValue([
        MONEY_ACCOUNT_PLUS_SUBSCRIPTION,
      ]);

      await expect(controller.startMigration()).rejects.toThrow(
        "Binding migrations did not complete in the 'afterLink' phase",
      );
      expect(mocks.getSubscriptions).not.toHaveBeenCalled();
      expect(mocks.prepareDelegation).not.toHaveBeenCalled();
      expect(mocks.updatePaymentMethod).not.toHaveBeenCalled();
    });
  });

  describe('when signing the subscription delegation takes a while', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('leaves the user several minutes to approve the 2FA prompt', async () => {
      await withController(async ({ controller, mocks }) => {
        mocks.getSubscriptions.mockResolvedValue([
          MONEY_ACCOUNT_PLUS_SUBSCRIPTION,
        ]);
        const signed = createDeferredPromise<{
          delegationHash: Hex;
          disposition: 'created';
        }>();
        mocks.prepareDelegation.mockReturnValue(signed.promise);

        const migration = controller.startMigration();
        await vi.advanceTimersByTimeAsync(4 * 60_000);
        signed.resolve({
          delegationHash: SUBSCRIPTION_DELEGATION_HASH,
          disposition: 'created',
        });

        expect(await migration).toBeUndefined();
        expect(mocks.updatePaymentMethod).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('status', () => {
    it.each<{
      description: string;
      subscriptions: Subscription[];
      identity: DerivedIdentity;
      status: BindingMigratorState['status'];
    }>([
      {
        description: 'the money account still pays',
        subscriptions: [buildCryptoSubscription(MONEY_ACCOUNT_ADDRESS)],
        identity: PREMIUM_MIGRATING_IDENTITY,
        status: 'pending',
      },
      {
        description:
          'the successor pays but CHOMP reports its subscription intent missing',
        subscriptions: [buildCryptoSubscription(SUCCESSOR_ADDRESS)],
        identity: PREMIUM_MIGRATING_IDENTITY,
        status: 'pending',
      },
      {
        description: 'the successor pays and no subscription intent is missing',
        subscriptions: [buildCryptoSubscription(SUCCESSOR_ADDRESS)],
        identity: MIGRATING_IDENTITY,
        status: 'completed',
      },
      {
        description:
          'no eligible subscription is cached while CHOMP reports the subscription intent missing, as the cache may not be loaded yet',
        subscriptions: [],
        identity: PREMIUM_MIGRATING_IDENTITY,
        status: 'unknown',
      },
      {
        description:
          'another address pays while CHOMP reports the subscription intent missing',
        subscriptions: [buildCryptoSubscription(OTHER_ADDRESS)],
        identity: PREMIUM_MIGRATING_IDENTITY,
        status: 'unknown',
      },
      {
        description:
          'no eligible subscription is cached for a migration without a subscription intent',
        subscriptions: [],
        identity: MIGRATING_IDENTITY,
        status: 'not_required',
      },
      {
        description:
          'the money account has migrated without an eligible subscription',
        subscriptions: [],
        identity: {
          currentAddress: SUCCESSOR_ADDRESS,
          previousAddresses: [MONEY_ACCOUNT_ADDRESS],
          status: 'DONE',
          migration: null,
        },
        status: 'not_required',
      },
    ])(
      'is $status when $description',
      async ({ subscriptions, identity, status }) => {
        await withController(
          { mpcAccountAddress: SUCCESSOR_ADDRESS },
          async ({ controller, mocks, init }) => {
            mocks.getSubscriptionControllerState.mockReturnValue({
              subscriptions,
              trialedProducts: [],
            });
            mocks.getDerivedIdentities.mockResolvedValue({
              identities: [identity],
            });

            await init();

            expect(getPayerMigrator(controller)?.status).toBe(status);
          },
        );
      },
    );

    it('is completed once the subscription has moved and CHOMP reports the subscription intent complete', async () => {
      await withController(async ({ controller, mocks }) => {
        mocks.getDerivedIdentities
          .mockResolvedValueOnce({ identities: [SFA_IDENTITY] })
          .mockResolvedValueOnce({ identities: [SFA_IDENTITY] })
          .mockResolvedValue({
            identities: [
              {
                ...MIGRATING_IDENTITY,
                migration: { ...MIGRATING_IDENTITY.migration, to: MPC_ADDRESS },
              },
            ],
          });
        mocks.getSubscriptions.mockResolvedValue([
          MONEY_ACCOUNT_PLUS_SUBSCRIPTION,
        ]);
        mocks.updatePaymentMethod.mockImplementation(async () => {
          mocks.getSubscriptionControllerState.mockReturnValue({
            subscriptions: [buildCryptoSubscription(MPC_ADDRESS)],
            trialedProducts: [],
          });
          return [];
        });

        await controller.startMigration();

        expect(getPayerMigrator(controller)).toStrictEqual({
          phase: 'beforeMigrationIntents',
          status: 'completed',
          details: null,
          lastResult: { status: 'completed' },
          lastError: null,
        });
      });
    });

    it('stays blocked once a run has found no eligible subscription, so clients stop retrying', async () => {
      await withController(async ({ controller, mocks }) => {
        mocks.getDerivedIdentities
          .mockResolvedValueOnce({ identities: [SFA_IDENTITY] })
          .mockResolvedValueOnce({ identities: [SFA_IDENTITY] })
          .mockResolvedValue({
            identities: [PREMIUM_MIGRATING_TO_MPC_IDENTITY],
          });
        mocks.getDerivedIdentityByAddress.mockResolvedValue(
          buildLinkedIdentityResponse(SUBSCRIPTION_INTENT_STEPS),
        );

        await expect(controller.startMigration()).rejects.toThrow(
          'money-account-plus-payer (blocked:',
        );

        expect(getPayerMigrator(controller)?.status).toBe('blocked');
        expect(
          moneyAccountLifecycleControllerSelectors.selectHasUnfinishedBindingMigrations(
            controller.state,
          ),
        ).toBe(false);
        expect(
          moneyAccountLifecycleControllerSelectors.selectBlockedBindingMigrations(
            controller.state,
          ),
        ).toStrictEqual([MONEY_ACCOUNT_PLUS_PAYER_MIGRATOR_ID]);
      });
    });

    it('reads the status again once a later run is no longer blocked', async () => {
      await withController(async ({ controller, mocks }) => {
        mocks.getDerivedIdentities
          .mockResolvedValueOnce({ identities: [SFA_IDENTITY] })
          .mockResolvedValueOnce({ identities: [SFA_IDENTITY] })
          .mockResolvedValue({
            identities: [PREMIUM_MIGRATING_TO_MPC_IDENTITY],
          });
        mocks.getDerivedIdentityByAddress.mockResolvedValue(
          buildLinkedIdentityResponse(SUBSCRIPTION_INTENT_STEPS),
        );
        await expect(controller.startMigration()).rejects.toThrow(
          'money-account-plus-payer (blocked:',
        );
        mocks.getSubscriptions.mockResolvedValue([
          MONEY_ACCOUNT_PLUS_SUBSCRIPTION,
        ]);
        mocks.updatePaymentMethod.mockImplementation(async () => {
          mocks.getSubscriptionControllerState.mockReturnValue({
            subscriptions: [buildCryptoSubscription(MPC_ADDRESS)],
            trialedProducts: [],
          });
          return [];
        });

        await controller.startMigration();

        expect(getPayerMigrator(controller)).toMatchObject({
          status: 'pending',
          lastResult: { status: 'completed' },
        });
      });
    });

    it('is blocked when Money Account Plus has no price for the subscription interval, as retrying cannot help', async () => {
      await withController(async ({ controller, mocks }) => {
        mocks.getSubscriptions.mockResolvedValue([
          MONEY_ACCOUNT_PLUS_SUBSCRIPTION,
        ]);
        mocks.getPricing.mockResolvedValue({
          products: [],
          paymentMethods: [],
        });

        await expect(controller.startMigration()).rejects.toThrow(
          "money-account-plus-payer (blocked: Money Account Plus has no 'month' price)",
        );
        expect(mocks.updatePaymentMethod).not.toHaveBeenCalled();
      });
    });
  });
});
