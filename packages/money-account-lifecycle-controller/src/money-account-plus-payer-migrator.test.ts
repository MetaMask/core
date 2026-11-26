import type {
  DerivedIdentity,
  DerivedIdentityMigration,
} from '@metamask/chomp-api-service';
import type { Subscription } from '@metamask/subscription-controller';
import type { Hex } from '@metamask/utils';
import { describe, expect, it } from 'vitest';

import {
  MFA_ACCOUNT_ADDRESS,
  MIGRATING_IDENTITY,
  MONEY_ACCOUNT_ADDRESS,
  MONEY_ACCOUNT_KEY,
  MONEY_ACCOUNT_PLUS_SUBSCRIPTION,
  SFA_IDENTITY,
  SUBSCRIPTION_DELEGATION_HASH,
  SUCCESSOR_ADDRESS,
  buildLinkedIdentityResponse,
  getLifecycle,
  withController,
} from '../tests/helpers.js';
import { BindingMigrationIncompleteError } from './binding-migration.js';
import type { MoneyAccountLifecycleController } from './money-account-lifecycle-controller.js';

const MPC_ADDRESS = MFA_ACCOUNT_ADDRESS.toLowerCase() as Hex;

const OTHER_ADDRESS: Hex = '0x00000000000000000000000000000000000000ee';

const NO_ELIGIBLE_SUBSCRIPTION_REASON =
  'The premium migration needs an active Money Account Plus subscription paid in crypto by the Money Account or the MPC Money Account';

const SUBSCRIPTION_INTENT_MISSING = buildLinkedIdentityResponse([
  { step: 'SUCCESSOR_SUBSCRIPTION_INTENT', completed: false },
  { step: 'ROOT_DELEGATION', completed: false },
]);

const PREMIUM_MIGRATION: DerivedIdentityMigration = {
  ...MIGRATING_IDENTITY.migration,
  steps: [
    { step: 'SUCCESSOR_SUBSCRIPTION_INTENT', completed: false },
    { step: 'ROOT_DELEGATION', completed: false },
  ],
};

function buildCryptoSubscription(payerAddress: Hex): Subscription {
  return {
    ...MONEY_ACCOUNT_PLUS_SUBSCRIPTION,
    paymentMethod: {
      type: 'crypto',
      crypto: { payerAddress, chainId: '0x8f', tokenSymbol: 'mUSD' },
    },
  };
}

function getPayerMigrator(
  controller: MoneyAccountLifecycleController,
): NonNullable<
  MoneyAccountLifecycleController['state']['bindingMigrations']
>['migrators'][string] {
  const migrator =
    controller.state.bindingMigrations?.migrators['money-account-plus-payer'];
  if (!migrator) {
    throw new Error('The payer migrator is not recorded');
  }
  return migrator;
}

const INELIGIBLE_SUBSCRIPTIONS: {
  description: string;
  subscriptions: Subscription[];
}[] = [
  { description: 'there is no subscription', subscriptions: [] },
  {
    description: 'the subscription is canceled',
    subscriptions: [{ ...MONEY_ACCOUNT_PLUS_SUBSCRIPTION, status: 'canceled' }],
  },
  {
    description: 'the subscription is past due',
    subscriptions: [{ ...MONEY_ACCOUNT_PLUS_SUBSCRIPTION, status: 'past_due' }],
  },
  {
    description: 'the subscription is for another product',
    subscriptions: [
      {
        ...MONEY_ACCOUNT_PLUS_SUBSCRIPTION,
        products: [
          { name: 'shield', currency: 'usd', unitAmount: 999, unitDecimals: 2 },
        ],
      },
    ],
  },
  {
    description: 'the subscription is paid by card',
    subscriptions: [
      {
        ...MONEY_ACCOUNT_PLUS_SUBSCRIPTION,
        paymentMethod: { type: 'card', card: { brand: 'visa', last4: '4242' } },
      },
    ],
  },
  {
    description: 'another address pays for the subscription',
    subscriptions: [buildCryptoSubscription(OTHER_ADDRESS)],
  },
];

describe('Money Account Plus payer binding migrator', () => {
  it('is registered without calling the messenger in the constructor', async () => {
    await withController(({ controller, mocks }) => {
      expect(mocks.getMoneyAccount).not.toHaveBeenCalled();
      expect(mocks.getSubscriptionControllerState).not.toHaveBeenCalled();
      expect(() =>
        controller.registerBindingMigrator({
          id: 'money-account-plus-payer',
          phase: 'afterLink',
          reconcile: async () => ({ status: 'completed' }),
          getStatus: () => ({ status: 'completed' }),
        }),
      ).toThrow(
        "A binding migrator with the id 'money-account-plus-payer' is already registered",
      );
    });
  });

  describe('when startMigration runs it', () => {
    it('moves a subscription the money account pays to the MPC Money Account after linking it and before registering the migration intents', async () => {
      await withController(async ({ controller, mocks }) => {
        mocks.getSubscriptions.mockResolvedValue([
          MONEY_ACCOUNT_PLUS_SUBSCRIPTION,
        ]);

        await controller.startMigration();

        expect(mocks.prepareDelegation).toHaveBeenCalledTimes(1);
        expect(mocks.prepareDelegation).toHaveBeenCalledWith({
          product: 'money_account_plus',
          recurringInterval: 'month',
          payerAddress: MPC_ADDRESS,
          isTrialRequested: false,
        });
        expect(mocks.updatePaymentMethod).toHaveBeenCalledTimes(1);
        expect(mocks.updatePaymentMethod).toHaveBeenCalledWith({
          paymentType: 'crypto',
          subscriptionId: MONEY_ACCOUNT_PLUS_SUBSCRIPTION.id,
          chainId: '0x8f',
          payerAddress: MPC_ADDRESS,
          tokenSymbol: 'mUSD',
          recurringInterval: 'month',
          billingCycles: 12,
          cryptoAuthMethod: 'delegation',
          delegationHash: SUBSCRIPTION_DELEGATION_HASH,
        });
        const [linkOrder] =
          mocks.upgradeSuccessorAccount.mock.invocationCallOrder;
        const [prepareOrder] = mocks.prepareDelegation.mock.invocationCallOrder;
        const [updateOrder] =
          mocks.updatePaymentMethod.mock.invocationCallOrder;
        const [registerOrder] =
          mocks.registerMigrationIntents.mock.invocationCallOrder;
        expect(prepareOrder).toBeGreaterThan(linkOrder);
        expect(updateOrder).toBeGreaterThan(prepareOrder);
        expect(registerOrder).toBeGreaterThan(updateOrder);
      });
    });

    it('records that it completed', async () => {
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
          phase: 'afterLink',
          status: 'completed',
          details: null,
          lastResult: { status: 'completed' },
          lastError: null,
        });
      });
    });

    it.each(['active', 'trialing', 'provisional'] as const)(
      'moves a subscription that is %s',
      async (status) => {
        await withController(async ({ controller, mocks }) => {
          mocks.getSubscriptions.mockResolvedValue([
            { ...MONEY_ACCOUNT_PLUS_SUBSCRIPTION, status },
          ]);

          await controller.startMigration();

          expect(mocks.updatePaymentMethod).toHaveBeenCalledTimes(1);
        });
      },
    );

    it('moves a subscription paid by the money account whatever the case of the payer address', async () => {
      await withController(async ({ controller, mocks }) => {
        mocks.getSubscriptions.mockResolvedValue([
          buildCryptoSubscription(MONEY_ACCOUNT_KEY as Hex),
        ]);

        await controller.startMigration();

        expect(mocks.updatePaymentMethod).toHaveBeenCalledTimes(1);
      });
    });

    it('uses the billing cycles of the subscription interval', async () => {
      await withController(async ({ controller, mocks }) => {
        mocks.getSubscriptions.mockResolvedValue([
          { ...MONEY_ACCOUNT_PLUS_SUBSCRIPTION, interval: 'year' },
        ]);

        await controller.startMigration();

        expect(mocks.prepareDelegation).toHaveBeenCalledWith(
          expect.objectContaining({ recurringInterval: 'year' }),
        );
        expect(mocks.updatePaymentMethod).toHaveBeenCalledWith(
          expect.objectContaining({
            recurringInterval: 'year',
            billingCycles: 1,
          }),
        );
      });
    });

    it('moves the active Money Account Plus subscription when there are several subscriptions', async () => {
      await withController(async ({ controller, mocks }) => {
        mocks.getSubscriptions.mockResolvedValue([
          {
            ...MONEY_ACCOUNT_PLUS_SUBSCRIPTION,
            id: 'canceled-subscription-id',
            status: 'canceled',
          },
          MONEY_ACCOUNT_PLUS_SUBSCRIPTION,
        ]);

        await controller.startMigration();

        expect(mocks.updatePaymentMethod).toHaveBeenCalledWith(
          expect.objectContaining({
            subscriptionId: MONEY_ACCOUNT_PLUS_SUBSCRIPTION.id,
          }),
        );
      });
    });

    it.each([
      ...INELIGIBLE_SUBSCRIPTIONS,
      {
        description: 'the MPC Money Account already pays for the subscription',
        subscriptions: [buildCryptoSubscription(MFA_ACCOUNT_ADDRESS)],
      },
    ])(
      'registers the migration intents without moving a subscription when $description',
      async ({ subscriptions }) => {
        await withController(async ({ controller, mocks }) => {
          mocks.getSubscriptions.mockResolvedValue(subscriptions);

          await controller.startMigration();

          expect(mocks.getSubscriptions).toHaveBeenCalledTimes(1);
          expect(mocks.prepareDelegation).not.toHaveBeenCalled();
          expect(mocks.updatePaymentMethod).not.toHaveBeenCalled();
          expect(mocks.registerMigrationIntents).toHaveBeenCalledTimes(1);
        });
      },
    );

    it('throws an incomplete binding migration error without moving the subscription when Money Account Plus has no price for the subscription interval', async () => {
      await withController(async ({ controller, mocks }) => {
        mocks.getSubscriptions.mockResolvedValue([
          MONEY_ACCOUNT_PLUS_SUBSCRIPTION,
        ]);
        mocks.getPricing.mockResolvedValue({
          products: [],
          paymentMethods: [],
        });

        await expect(controller.startMigration()).rejects.toStrictEqual(
          new BindingMigrationIncompleteError('afterLink', [
            {
              migratorId: 'money-account-plus-payer',
              result: {
                status: 'pending',
                reason: "Money Account Plus has no 'month' price",
              },
            },
          ]),
        );
        expect(mocks.prepareDelegation).not.toHaveBeenCalled();
        expect(mocks.updatePaymentMethod).not.toHaveBeenCalled();
        expect(mocks.registerMigrationIntents).not.toHaveBeenCalled();
      });
    });

    it('records the migrating lifecycle and reports the error when moving the subscription fails', async () => {
      await withController(async ({ controller, mocks }) => {
        mocks.getDerivedIdentities
          .mockResolvedValueOnce({ identities: [SFA_IDENTITY] })
          .mockResolvedValueOnce({ identities: [SFA_IDENTITY] })
          .mockResolvedValueOnce({ identities: [MIGRATING_IDENTITY] });
        mocks.getSubscriptions.mockResolvedValue([
          MONEY_ACCOUNT_PLUS_SUBSCRIPTION,
        ]);
        const error = new Error('Failed to update the payment method');
        mocks.updatePaymentMethod.mockRejectedValueOnce(error);

        await expect(controller.startMigration()).rejects.toStrictEqual(
          new BindingMigrationIncompleteError('afterLink', [
            {
              migratorId: 'money-account-plus-payer',
              result: {
                status: 'pending',
                reason: 'Failed to update the payment method',
              },
            },
          ]),
        );
        expect(mocks.captureException).toHaveBeenCalledWith(error);
        expect(mocks.registerMigrationIntents).not.toHaveBeenCalled();
        expect(mocks.startFundsTransfer).not.toHaveBeenCalled();
        expect(getLifecycle(controller)).toStrictEqual({
          type: 'migrating',
          identity: MIGRATING_IDENTITY,
        });
      });
    });

    it('throws without registering the migration intents or refetching identities when the wallet locks while moving the subscription', async () => {
      await withController(async ({ controller, gates, mocks }) => {
        mocks.getSubscriptions.mockResolvedValue([
          MONEY_ACCOUNT_PLUS_SUBSCRIPTION,
        ]);
        mocks.updatePaymentMethod.mockImplementationOnce(async () => {
          gates.isUnlocked = false;
          return [];
        });

        await expect(controller.startMigration()).rejects.toThrow(
          'Money Account migration is not available',
        );
        expect(mocks.registerMigrationIntents).not.toHaveBeenCalled();
        expect(mocks.getDerivedIdentities).toHaveBeenCalledTimes(2);
      });
    });

    describe('when CHOMP reports the subscription intent of the MPC Money Account missing', () => {
      it('moves a subscription the money account pays without asking CHOMP', async () => {
        await withController(async ({ controller, mocks }) => {
          mocks.getDerivedIdentityByAddress.mockResolvedValue(
            SUBSCRIPTION_INTENT_MISSING,
          );
          mocks.getSubscriptions.mockResolvedValue([
            MONEY_ACCOUNT_PLUS_SUBSCRIPTION,
          ]);

          await controller.startMigration();

          expect(mocks.getDerivedIdentityByAddress).not.toHaveBeenCalled();
          expect(mocks.updatePaymentMethod).toHaveBeenCalledTimes(1);
        });
      });

      it('prepares the subscription delegation of the MPC Money Account again, without updating the payment method, when it already pays', async () => {
        await withController(async ({ controller, mocks }) => {
          mocks.getDerivedIdentityByAddress.mockResolvedValue(
            SUBSCRIPTION_INTENT_MISSING,
          );
          mocks.getSubscriptions.mockResolvedValue([
            buildCryptoSubscription(MFA_ACCOUNT_ADDRESS),
          ]);

          await controller.startMigration();

          expect(mocks.getDerivedIdentityByAddress).toHaveBeenCalledWith(
            MONEY_ACCOUNT_KEY,
          );
          expect(mocks.prepareDelegation).toHaveBeenCalledTimes(1);
          expect(mocks.prepareDelegation).toHaveBeenCalledWith({
            product: 'money_account_plus',
            recurringInterval: 'month',
            payerAddress: MPC_ADDRESS,
            isTrialRequested: false,
          });
          expect(mocks.updatePaymentMethod).not.toHaveBeenCalled();
          expect(
            mocks.registerMigrationIntents.mock.invocationCallOrder[0],
          ).toBeGreaterThan(
            mocks.prepareDelegation.mock.invocationCallOrder[0],
          );
        });
      });

      it.each(INELIGIBLE_SUBSCRIPTIONS)(
        'is blocked, and throws before registering the migration intents, when $description',
        async ({ subscriptions }) => {
          await withController(async ({ controller, mocks }) => {
            mocks.getDerivedIdentityByAddress.mockResolvedValue(
              SUBSCRIPTION_INTENT_MISSING,
            );
            mocks.getSubscriptions.mockResolvedValue(subscriptions);

            await expect(controller.startMigration()).rejects.toStrictEqual(
              new BindingMigrationIncompleteError('afterLink', [
                {
                  migratorId: 'money-account-plus-payer',
                  result: {
                    status: 'blocked',
                    reason: NO_ELIGIBLE_SUBSCRIPTION_REASON,
                  },
                },
              ]),
            );
            expect(mocks.prepareDelegation).not.toHaveBeenCalled();
            expect(mocks.registerMigrationIntents).not.toHaveBeenCalled();
            expect(mocks.getDerivedIdentities).toHaveBeenCalledTimes(3);
          });
        },
      );

      it.each([
        { description: 'no identity', response: null },
        {
          description: 'no migration',
          response: {
            ...SUBSCRIPTION_INTENT_MISSING,
            identity: {
              ...SUBSCRIPTION_INTENT_MISSING.identity,
              migration: null,
            },
          },
        },
      ])(
        'leaves registering the migration intents to fail when CHOMP reports $description for the money account',
        async ({ response }) => {
          await withController(async ({ controller, mocks }) => {
            mocks.getDerivedIdentityByAddress.mockResolvedValue(response);

            await controller.startMigration();

            expect(mocks.prepareDelegation).not.toHaveBeenCalled();
            expect(mocks.registerMigrationIntents).toHaveBeenCalledTimes(1);
          });
        },
      );
    });

    it('registers the migration intents without moving a subscription once CHOMP reports the subscription intent complete', async () => {
      await withController(async ({ controller, mocks }) => {
        mocks.getDerivedIdentityByAddress.mockResolvedValue(
          buildLinkedIdentityResponse([
            { step: 'SUCCESSOR_SUBSCRIPTION_INTENT', completed: true },
            { step: 'ROOT_DELEGATION', completed: false },
          ]),
        );

        await controller.startMigration();

        expect(mocks.prepareDelegation).not.toHaveBeenCalled();
        expect(mocks.registerMigrationIntents).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('status', () => {
    it.each<{
      description: string;
      subscriptions: Subscription[];
      migration: DerivedIdentityMigration;
      status: string;
    }>([
      {
        description: 'the money account still pays',
        subscriptions: [buildCryptoSubscription(MONEY_ACCOUNT_ADDRESS)],
        migration: PREMIUM_MIGRATION,
        status: 'pending',
      },
      {
        description: 'the successor pays',
        subscriptions: [buildCryptoSubscription(SUCCESSOR_ADDRESS)],
        migration: PREMIUM_MIGRATION,
        status: 'completed',
      },
      {
        description: 'no eligible subscription is paid for a premium migration',
        subscriptions: [buildCryptoSubscription(OTHER_ADDRESS)],
        migration: PREMIUM_MIGRATION,
        status: 'blocked',
      },
      {
        description:
          'no eligible subscription is paid for a migration without a subscription intent',
        subscriptions: [],
        migration: MIGRATING_IDENTITY.migration,
        status: 'not_required',
      },
    ])(
      'is $status when $description',
      async ({ subscriptions, migration, status }) => {
        await withController(async ({ controller, mocks, init }) => {
          mocks.getSubscriptionControllerState.mockReturnValue({
            subscriptions,
            trialedProducts: [],
          });
          mocks.getDerivedIdentities.mockResolvedValue({
            identities: [{ ...MIGRATING_IDENTITY, migration }],
          });

          await init();

          expect(getPayerMigrator(controller).status).toBe(status);
        });
      },
    );

    it('is not_required for a migrated money account without an eligible subscription', async () => {
      const migrated: DerivedIdentity = {
        currentAddress: MFA_ACCOUNT_ADDRESS,
        previousAddresses: [MONEY_ACCOUNT_ADDRESS],
        status: 'DONE',
        migration: null,
      };
      await withController(
        { mpcAccountAddress: MFA_ACCOUNT_ADDRESS },
        async ({ controller, mocks, init }) => {
          mocks.getDerivedIdentities.mockResolvedValue({
            identities: [migrated],
          });

          await init();

          expect(getPayerMigrator(controller).status).toBe('not_required');
        },
      );
    });
  });
});
