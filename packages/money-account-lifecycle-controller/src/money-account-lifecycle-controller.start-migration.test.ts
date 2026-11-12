import { ChompApiError } from '@metamask/chomp-api-service';
import type {
  DerivedIdentitiesResponse,
  DerivedIdentity,
} from '@metamask/chomp-api-service';
import type { MoneyAccount } from '@metamask/money-account-controller';
import type { Subscription } from '@metamask/subscription-controller';
import { createDeferredPromise } from '@metamask/utils';
import type { Hex } from '@metamask/utils';
import { afterEach, describe, it, expect, vi } from 'vitest';

import {
  MONEY_ACCOUNT_ADDRESS,
  MONEY_ACCOUNT_KEY,
  SFA_IDENTITY,
  MFA_IDENTITY,
  MFA_ACCOUNT_ADDRESS,
  MFA_MONEY_ACCOUNT,
  MIGRATING_IDENTITY,
  MONEY_ACCOUNT_PLUS_SUBSCRIPTION,
  SUBSCRIPTION_DELEGATION_HASH,
  SUCCESSOR_ADDRESS,
  buildLinkedIdentityResponse,
  getLifecycle,
  withController,
} from '../tests/helpers.js';

function buildCryptoSubscription(payerAddress: Hex): Subscription {
  return {
    ...MONEY_ACCOUNT_PLUS_SUBSCRIPTION,
    paymentMethod: {
      type: 'crypto',
      crypto: { payerAddress, chainId: '0x8f', tokenSymbol: 'mUSD' },
    },
  };
}

describe('MoneyAccountLifecycleController', () => {
  describe('startMigration', () => {
    it('creates the MPC Money Account and links it as the successor of the money account once the checks pass', async () => {
      await withController(async ({ rootMessenger, mocks }) => {
        expect(
          await rootMessenger.call(
            'MoneyAccountLifecycleController:startMigration',
          ),
        ).toBeUndefined();

        expect(mocks.getDerivedIdentities).toHaveBeenCalledTimes(3);
        expect(mocks.upgradeSuccessorAccount).toHaveBeenCalledTimes(1);
        expect(mocks.upgradeSuccessorAccount).toHaveBeenCalledWith(
          MFA_ACCOUNT_ADDRESS,
          MONEY_ACCOUNT_ADDRESS,
        );
        expect(mocks.createMoneyAccount).toHaveBeenCalledTimes(1);
        expect(mocks.createMoneyAccount).toHaveBeenCalledWith({ type: 'mpc' });
        expect(mocks.getMoneyAccount).toHaveBeenCalledWith({
          type: 'mnemonic',
        });
        expect(mocks.getMoneyAccount).not.toHaveBeenCalledWith();
      });
    });

    it('records the freshly fetched identities', async () => {
      await withController(
        {
          options: {
            state: {
              moneyAccounts: {
                [MONEY_ACCOUNT_KEY]: { type: 'sfa', identity: SFA_IDENTITY },
              },
            },
          },
        },
        async ({ controller, mocks }) => {
          mocks.getDerivedIdentities.mockResolvedValue({
            identities: [MIGRATING_IDENTITY],
          });

          await expect(controller.startMigration()).rejects.toThrow(
            `Money Account ${MONEY_ACCOUNT_ADDRESS} is migrating to ${SUCCESSOR_ADDRESS}, which is not the MPC Money Account of this wallet`,
          );

          expect(getLifecycle(controller)).toStrictEqual({
            type: 'migrating',
            identity: MIGRATING_IDENTITY,
          });
        },
      );
    });

    it.each<{ description: string; identities: DerivedIdentity[] }>([
      {
        description: 'another identity with a MIGRATING status',
        identities: [
          SFA_IDENTITY,
          {
            ...MFA_IDENTITY,
            currentAddress: '0x00000000000000000000000000000000000000ee',
            previousAddresses: [],
            status: 'MIGRATING',
          },
        ],
      },
      {
        description: 'another identity with a migration',
        identities: [
          SFA_IDENTITY,
          {
            ...MIGRATING_IDENTITY,
            currentAddress: '0x00000000000000000000000000000000000000ee',
            status: 'DONE',
          },
        ],
      },
    ])(
      'does not start a second migration while $description is migrating',
      async ({ identities }) => {
        await withController(async ({ controller, mocks }) => {
          mocks.getDerivedIdentities.mockResolvedValue({ identities });

          await expect(controller.startMigration()).rejects.toThrow(
            'A Money Account identity is already migrating',
          );
          expect(mocks.createMoneyAccount).not.toHaveBeenCalled();
        });
      },
    );

    it.each([
      { type: 'notInIdentity', identities: [] },
      { type: 'mfa', identities: [MFA_IDENTITY] },
    ] as const)(
      'does not migrate a money account that is $type',
      async ({ type, identities }) => {
        await withController(async ({ controller, mocks }) => {
          mocks.getDerivedIdentities.mockResolvedValue({
            identities: [...identities],
          });

          await expect(controller.startMigration()).rejects.toThrow(
            `Money Account ${MONEY_ACCOUNT_ADDRESS} cannot be migrated while it is '${type}'`,
          );
          expect(mocks.createMoneyAccount).not.toHaveBeenCalled();
        });
      },
    );

    it.each<{ description: string; identity: DerivedIdentity }>([
      {
        description: 'a previous address of another identity',
        identity: MFA_IDENTITY,
      },
      {
        description: 'the current address of another identity',
        identity: {
          ...SFA_IDENTITY,
          currentAddress: MONEY_ACCOUNT_ADDRESS.toLowerCase() as Hex,
        },
      },
    ])(
      'does not migrate a money account that is also $description',
      async ({ identity }) => {
        await withController(async ({ controller, mocks }) => {
          mocks.getDerivedIdentities.mockResolvedValue({
            identities: [SFA_IDENTITY, identity],
          });

          await expect(controller.startMigration()).rejects.toThrow(
            `Money Account ${MONEY_ACCOUNT_ADDRESS} belongs to more than one identity`,
          );
          expect(mocks.createMoneyAccount).not.toHaveBeenCalled();
        });
      },
    );

    it('throws when there is no money account', async () => {
      await withController(
        { moneyAccountAddress: undefined },
        async ({ controller, mocks }) => {
          await expect(controller.startMigration()).rejects.toThrow(
            'There is no Money Account to migrate',
          );
          expect(mocks.getDerivedIdentities).not.toHaveBeenCalled();
        },
      );
    });

    it.each([
      { description: 'the feature is disabled', isEnabled: false },
      { description: 'the wallet is locked', isUnlocked: false },
      { description: 'there is no HD keyring', hasHdKeyring: false },
    ])('throws when $description', async ({ description, ...gates }) => {
      await withController(gates, async ({ controller, mocks }) => {
        await expect(controller.startMigration()).rejects.toThrow(
          'Money Account migration is not available',
        );
        expect(mocks.getDerivedIdentities).not.toHaveBeenCalled();
      });
    });

    it('throws without recording identities or creating the MPC Money Account when the wallet locks while fetching identities', async () => {
      await withController(
        async ({ controller, gates, mocks, init, triggerKeyringChange }) => {
          await init();
          const { promise, resolve } =
            createDeferredPromise<DerivedIdentitiesResponse>();
          mocks.getDerivedIdentities.mockReturnValueOnce(promise);

          const migration = controller.startMigration();
          gates.isUnlocked = false;
          await triggerKeyringChange();
          resolve({ identities: [MIGRATING_IDENTITY] });

          await expect(migration).rejects.toThrow(
            'Money Account migration is not available',
          );
          expect(getLifecycle(controller)).toStrictEqual({
            type: 'sfa',
            identity: SFA_IDENTITY,
          });
          expect(mocks.createMoneyAccount).not.toHaveBeenCalled();
        },
      );
    });

    it('throws when the wallet locks while fetching identities, even with identities recorded', async () => {
      await withController(async ({ controller, gates, mocks }) => {
        const { promise, resolve } =
          createDeferredPromise<DerivedIdentitiesResponse>();
        mocks.getDerivedIdentities.mockReturnValueOnce(promise);

        const migration = controller.startMigration();
        gates.isUnlocked = false;
        resolve({ identities: [SFA_IDENTITY] });

        await expect(migration).rejects.toThrow(
          'Money Account migration is not available',
        );
        expect(mocks.createMoneyAccount).not.toHaveBeenCalled();
      });
    });

    it.each([
      'getDerivedIdentities',
      'createMoneyAccount',
      'upgradeSuccessorAccount',
      'registerMigrationIntents',
    ] as const)(
      'throws the error from %s unchanged, and allows a retry',
      async (mockName) => {
        await withController(async ({ controller, mocks }) => {
          const error = new Error(`${mockName} failed`);
          mocks[mockName].mockRejectedValueOnce(error);

          await expect(controller.startMigration()).rejects.toThrow(error);
          expect(await controller.startMigration()).toBeUndefined();
        });
      },
    );

    it('records the migrating lifecycle once the successor is linked', async () => {
      await withController(async ({ controller, mocks }) => {
        mocks.getDerivedIdentities
          .mockResolvedValueOnce({ identities: [SFA_IDENTITY] })
          .mockResolvedValueOnce({ identities: [SFA_IDENTITY] })
          .mockResolvedValueOnce({ identities: [MIGRATING_IDENTITY] });

        await controller.startMigration();

        expect(getLifecycle(controller)).toStrictEqual({
          type: 'migrating',
          identity: MIGRATING_IDENTITY,
        });
      });
    });

    it('resolves once the successor is linked even when refetching identities fails', async () => {
      await withController(async ({ controller, mocks }) => {
        mocks.getDerivedIdentities
          .mockResolvedValueOnce({ identities: [SFA_IDENTITY] })
          .mockResolvedValueOnce({ identities: [SFA_IDENTITY] })
          .mockRejectedValueOnce(new Error('CHOMP is down'));

        expect(await controller.startMigration()).toBeUndefined();
        expect(mocks.upgradeSuccessorAccount).toHaveBeenCalledTimes(1);
      });
    });

    it('throws without registering the migration intents or refetching identities when the wallet locks while linking the successor', async () => {
      await withController(async ({ controller, gates, mocks }) => {
        mocks.upgradeSuccessorAccount.mockImplementationOnce(async () => {
          gates.isUnlocked = false;
        });

        await expect(controller.startMigration()).rejects.toThrow(
          'Money Account migration is not available',
        );
        expect(mocks.registerMigrationIntents).not.toHaveBeenCalled();
        expect(mocks.getDerivedIdentities).toHaveBeenCalledTimes(2);
      });
    });

    it('records the migrating lifecycle before throwing when upgrading the successor fails after linking it', async () => {
      await withController(async ({ controller, mocks }) => {
        mocks.getDerivedIdentities
          .mockResolvedValueOnce({ identities: [SFA_IDENTITY] })
          .mockResolvedValueOnce({ identities: [SFA_IDENTITY] })
          .mockResolvedValueOnce({ identities: [MIGRATING_IDENTITY] });
        const error = new Error('eip-7702-authorization failed');
        mocks.upgradeSuccessorAccount.mockRejectedValueOnce(error);

        await expect(controller.startMigration()).rejects.toThrow(error);
        expect(mocks.registerMigrationIntents).not.toHaveBeenCalled();
        expect(getLifecycle(controller)).toStrictEqual({
          type: 'migrating',
          identity: MIGRATING_IDENTITY,
        });
      });
    });

    it('resumes the migration on a retry when upgrading the successor failed after linking it', async () => {
      const linkedIdentity: DerivedIdentity = {
        ...MIGRATING_IDENTITY,
        migration: {
          ...MIGRATING_IDENTITY.migration,
          to: MFA_ACCOUNT_ADDRESS.toLowerCase() as Hex,
        },
      };
      await withController(async ({ controller, mocks }) => {
        mocks.getDerivedIdentities
          .mockResolvedValueOnce({ identities: [SFA_IDENTITY] })
          .mockResolvedValueOnce({ identities: [SFA_IDENTITY] })
          .mockResolvedValue({ identities: [linkedIdentity] });
        mocks.upgradeSuccessorAccount.mockRejectedValueOnce(
          new Error('eip-7702-authorization failed'),
        );

        await expect(controller.startMigration()).rejects.toThrow(
          'eip-7702-authorization failed',
        );
        expect(await controller.startMigration()).toBeUndefined();

        expect(mocks.upgradeSuccessorAccount).toHaveBeenCalledTimes(2);
        expect(mocks.upgradeSuccessorAccount).toHaveBeenNthCalledWith(
          2,
          MFA_ACCOUNT_ADDRESS,
          MONEY_ACCOUNT_ADDRESS,
        );
        expect(mocks.registerMigrationIntents).toHaveBeenCalledTimes(1);
        expect(mocks.startFundsTransfer).toHaveBeenCalledTimes(1);
      });
    });

    it('registers the migration intents of the money account once the successor is linked', async () => {
      await withController(async ({ controller, mocks }) => {
        await controller.startMigration();

        expect(mocks.registerMigrationIntents).toHaveBeenCalledTimes(1);
        expect(mocks.registerMigrationIntents).toHaveBeenCalledWith(
          MONEY_ACCOUNT_ADDRESS,
          MFA_ACCOUNT_ADDRESS,
        );
        expect(
          mocks.registerMigrationIntents.mock.invocationCallOrder[0],
        ).toBeGreaterThan(
          mocks.upgradeSuccessorAccount.mock.invocationCallOrder[0],
        );
      });
    });

    it('throws without starting the funds transfer or refetching identities when the wallet locks while registering the migration intents', async () => {
      await withController(async ({ controller, gates, mocks }) => {
        mocks.registerMigrationIntents.mockImplementationOnce(async () => {
          gates.isUnlocked = false;
        });

        await expect(controller.startMigration()).rejects.toThrow(
          'Money Account migration is not available',
        );
        expect(mocks.startFundsTransfer).not.toHaveBeenCalled();
        expect(mocks.getDerivedIdentities).toHaveBeenCalledTimes(2);
      });
    });

    it('records the migrating lifecycle before throwing when registering the migration intents fails', async () => {
      await withController(async ({ controller, mocks }) => {
        mocks.getDerivedIdentities
          .mockResolvedValueOnce({ identities: [SFA_IDENTITY] })
          .mockResolvedValueOnce({ identities: [SFA_IDENTITY] })
          .mockResolvedValueOnce({ identities: [MIGRATING_IDENTITY] });
        const error = new Error('PREMIUM_ELIGIBILITY_NOT_TRANSFERRED');
        mocks.registerMigrationIntents.mockRejectedValueOnce(error);

        await expect(controller.startMigration()).rejects.toThrow(error);
        expect(mocks.startFundsTransfer).not.toHaveBeenCalled();
        expect(getLifecycle(controller)).toStrictEqual({
          type: 'migrating',
          identity: MIGRATING_IDENTITY,
        });
      });
    });

    it('starts the funds transfer of the money account once the migration intents are registered', async () => {
      await withController(async ({ controller, mocks }) => {
        await controller.startMigration();

        expect(mocks.startFundsTransfer).toHaveBeenCalledTimes(1);
        expect(mocks.startFundsTransfer).toHaveBeenCalledWith(
          MONEY_ACCOUNT_ADDRESS,
        );
        expect(
          mocks.startFundsTransfer.mock.invocationCallOrder[0],
        ).toBeGreaterThan(
          mocks.registerMigrationIntents.mock.invocationCallOrder[0],
        );
      });
    });

    it('records the migrating lifecycle before throwing when starting the funds transfer fails', async () => {
      await withController(async ({ controller, mocks }) => {
        mocks.getDerivedIdentities
          .mockResolvedValueOnce({ identities: [SFA_IDENTITY] })
          .mockResolvedValueOnce({ identities: [SFA_IDENTITY] })
          .mockResolvedValueOnce({ identities: [MIGRATING_IDENTITY] });
        const error = new Error('MIGRATION_STEPS_INCOMPLETE');
        mocks.startFundsTransfer.mockRejectedValueOnce(error);

        await expect(controller.startMigration()).rejects.toThrow(error);
        expect(getLifecycle(controller)).toStrictEqual({
          type: 'migrating',
          identity: MIGRATING_IDENTITY,
        });
      });
    });

    describe('when CHOMP refuses to start the funds transfer', () => {
      afterEach(() => {
        vi.useRealTimers();
      });

      it.each(['MIGRATION_STEPS_INCOMPLETE', 'MIGRATION_TRANSFER_CONFLICT'])(
        'retries once after two seconds when CHOMP answers %s',
        async (code) => {
          vi.useFakeTimers();
          await withController(async ({ controller, mocks }) => {
            mocks.startFundsTransfer.mockRejectedValueOnce(
              new ChompApiError(409, 'Conflict', code),
            );

            const migration = controller.startMigration();
            await vi.advanceTimersByTimeAsync(1999);
            expect(mocks.startFundsTransfer).toHaveBeenCalledTimes(1);
            await vi.advanceTimersByTimeAsync(1);

            expect(await migration).toBeUndefined();
            expect(mocks.startFundsTransfer).toHaveBeenCalledTimes(2);
            expect(mocks.startFundsTransfer).toHaveBeenNthCalledWith(
              2,
              MONEY_ACCOUNT_ADDRESS,
            );
          });
        },
      );

      it('throws the error of the retry when it fails too', async () => {
        vi.useFakeTimers();
        await withController(async ({ controller, mocks }) => {
          const retryError = new ChompApiError(
            409,
            'Still incomplete',
            'MIGRATION_STEPS_INCOMPLETE',
          );
          mocks.startFundsTransfer
            .mockRejectedValueOnce(
              new ChompApiError(
                409,
                'Incomplete',
                'MIGRATION_STEPS_INCOMPLETE',
              ),
            )
            .mockRejectedValueOnce(retryError);

          const migration = controller
            .startMigration()
            .catch((error: unknown) => error);
          await vi.advanceTimersByTimeAsync(2000);

          expect(await migration).toBe(retryError);
          expect(mocks.startFundsTransfer).toHaveBeenCalledTimes(2);
        });
      });

      it.each([
        {
          description: 'another CHOMP error code',
          error: new ChompApiError(409, 'No migration', 'NO_ACTIVE_MIGRATION'),
        },
        {
          description: 'a CHOMP error without a code',
          error: new ChompApiError(500, 'Server error'),
        },
        {
          description: 'an error that is not from CHOMP',
          error: new Error('Failed'),
        },
      ])('does not retry on $description', async ({ error }) => {
        await withController(async ({ controller, mocks }) => {
          mocks.startFundsTransfer.mockRejectedValueOnce(error);

          await expect(controller.startMigration()).rejects.toThrow(error);
          expect(mocks.startFundsTransfer).toHaveBeenCalledTimes(1);
        });
      });

      it('throws without retrying or refetching identities when the wallet locks while waiting to retry', async () => {
        vi.useFakeTimers();
        await withController(async ({ controller, gates, mocks }) => {
          mocks.startFundsTransfer.mockImplementationOnce(async () => {
            gates.isUnlocked = false;
            throw new ChompApiError(
              409,
              'Incomplete',
              'MIGRATION_STEPS_INCOMPLETE',
            );
          });

          const migration = controller
            .startMigration()
            .catch((error: unknown) => error);
          await vi.advanceTimersByTimeAsync(2000);

          expect(await migration).toStrictEqual(
            new Error('Money Account migration is not available'),
          );
          expect(mocks.startFundsTransfer).toHaveBeenCalledTimes(1);
          expect(mocks.getDerivedIdentities).toHaveBeenCalledTimes(2);
        });
      });
    });

    describe('when the user has a Money Account Plus subscription', () => {
      it('moves the subscription to the successor before registering the migration intents', async () => {
        await withController(async ({ controller, mocks }) => {
          mocks.getSubscriptions.mockResolvedValue([
            MONEY_ACCOUNT_PLUS_SUBSCRIPTION,
          ]);

          await controller.startMigration();

          expect(mocks.prepareDelegation).toHaveBeenCalledTimes(1);
          expect(mocks.prepareDelegation).toHaveBeenCalledWith({
            product: 'money_account_plus',
            recurringInterval: 'month',
            payerAddress: MFA_ACCOUNT_ADDRESS,
            isTrialRequested: false,
          });
          expect(mocks.updatePaymentMethod).toHaveBeenCalledTimes(1);
          expect(mocks.updatePaymentMethod).toHaveBeenCalledWith({
            paymentType: 'crypto',
            subscriptionId: MONEY_ACCOUNT_PLUS_SUBSCRIPTION.id,
            chainId: '0x8f',
            payerAddress: MFA_ACCOUNT_ADDRESS,
            tokenSymbol: 'mUSD',
            recurringInterval: 'month',
            billingCycles: 12,
            cryptoAuthMethod: 'delegation',
            delegationHash: SUBSCRIPTION_DELEGATION_HASH,
          });
          const [linkOrder] =
            mocks.upgradeSuccessorAccount.mock.invocationCallOrder;
          const [prepareOrder] =
            mocks.prepareDelegation.mock.invocationCallOrder;
          const [updateOrder] =
            mocks.updatePaymentMethod.mock.invocationCallOrder;
          const [registerOrder] =
            mocks.registerMigrationIntents.mock.invocationCallOrder;
          expect(prepareOrder).toBeGreaterThan(linkOrder);
          expect(updateOrder).toBeGreaterThan(prepareOrder);
          expect(registerOrder).toBeGreaterThan(updateOrder);
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
            buildCryptoSubscription(MONEY_ACCOUNT_ADDRESS.toLowerCase() as Hex),
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

      it.each<{ description: string; subscriptions: Subscription[] }>([
        { description: 'there is no subscription', subscriptions: [] },
        {
          description: 'the subscription is canceled',
          subscriptions: [
            { ...MONEY_ACCOUNT_PLUS_SUBSCRIPTION, status: 'canceled' },
          ],
        },
        {
          description: 'the subscription is for another product',
          subscriptions: [
            {
              ...MONEY_ACCOUNT_PLUS_SUBSCRIPTION,
              products: [
                {
                  name: 'shield',
                  currency: 'usd',
                  unitAmount: 999,
                  unitDecimals: 2,
                },
              ],
            },
          ],
        },
        {
          description: 'the subscription is paid by card',
          subscriptions: [
            {
              ...MONEY_ACCOUNT_PLUS_SUBSCRIPTION,
              paymentMethod: {
                type: 'card',
                card: { brand: 'visa', last4: '4242' },
              },
            },
          ],
        },
        {
          description: 'the successor already pays for the subscription',
          subscriptions: [buildCryptoSubscription(MFA_ACCOUNT_ADDRESS)],
        },
        {
          description: 'another address pays for the subscription',
          subscriptions: [
            buildCryptoSubscription(
              '0x00000000000000000000000000000000000000ee',
            ),
          ],
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

      describe('when CHOMP reports the subscription intent of the successor missing', () => {
        const SUBSCRIPTION_INTENT_MISSING = buildLinkedIdentityResponse([
          { step: 'SUCCESSOR_SUBSCRIPTION_INTENT', completed: false },
          { step: 'ROOT_DELEGATION', completed: false },
        ]);

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

        it('prepares the subscription delegation of the successor again, without updating the payment method, when the successor already pays', async () => {
          await withController(async ({ controller, mocks }) => {
            mocks.getDerivedIdentityByAddress.mockResolvedValue(
              SUBSCRIPTION_INTENT_MISSING,
            );
            mocks.getSubscriptions.mockResolvedValue([
              buildCryptoSubscription(MFA_ACCOUNT_ADDRESS),
            ]);

            await controller.startMigration();

            expect(mocks.getDerivedIdentityByAddress).toHaveBeenCalledWith(
              MONEY_ACCOUNT_ADDRESS,
            );
            expect(mocks.prepareDelegation).toHaveBeenCalledTimes(1);
            expect(mocks.prepareDelegation).toHaveBeenCalledWith({
              product: 'money_account_plus',
              recurringInterval: 'month',
              payerAddress: MFA_ACCOUNT_ADDRESS,
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

        it.each<{ description: string; subscriptions: Subscription[] }>([
          { description: 'there is no subscription', subscriptions: [] },
          {
            description: 'the subscription is past due',
            subscriptions: [
              { ...MONEY_ACCOUNT_PLUS_SUBSCRIPTION, status: 'past_due' },
            ],
          },
          {
            description: 'the subscription is paid by card',
            subscriptions: [
              {
                ...MONEY_ACCOUNT_PLUS_SUBSCRIPTION,
                paymentMethod: {
                  type: 'card',
                  card: { brand: 'visa', last4: '4242' },
                },
              },
            ],
          },
          {
            description: 'another address pays for the subscription',
            subscriptions: [
              buildCryptoSubscription(
                '0x00000000000000000000000000000000000000ee',
              ),
            ],
          },
        ])(
          'throws before registering the migration intents when $description',
          async ({ subscriptions }) => {
            await withController(async ({ controller, mocks }) => {
              mocks.getDerivedIdentityByAddress.mockResolvedValue(
                SUBSCRIPTION_INTENT_MISSING,
              );
              mocks.getSubscriptions.mockResolvedValue(subscriptions);

              await expect(controller.startMigration()).rejects.toThrow(
                `The premium migration of Money Account ${MONEY_ACCOUNT_ADDRESS} needs an active Money Account Plus subscription paid in crypto by it or by ${MFA_ACCOUNT_ADDRESS}`,
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

      it('throws without moving the subscription when Money Account Plus has no price for the subscription interval', async () => {
        await withController(async ({ controller, mocks }) => {
          mocks.getSubscriptions.mockResolvedValue([
            MONEY_ACCOUNT_PLUS_SUBSCRIPTION,
          ]);
          mocks.getPricing.mockResolvedValue({
            products: [],
            paymentMethods: [],
          });

          await expect(controller.startMigration()).rejects.toThrow(
            "Money Account Plus has no 'month' price",
          );
          expect(mocks.prepareDelegation).not.toHaveBeenCalled();
          expect(mocks.updatePaymentMethod).not.toHaveBeenCalled();
          expect(mocks.registerMigrationIntents).not.toHaveBeenCalled();
        });
      });

      it('records the migrating lifecycle before throwing when moving the subscription fails', async () => {
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

          await expect(controller.startMigration()).rejects.toThrow(error);
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
    });

    describe('when the money account is already migrating', () => {
      const RESUMABLE_IDENTITY: DerivedIdentity = {
        ...MIGRATING_IDENTITY,
        migration: {
          ...MIGRATING_IDENTITY.migration,
          to: MFA_ACCOUNT_ADDRESS.toLowerCase() as Hex,
        },
      };

      it('resumes the migration to the MPC Money Account of this wallet', async () => {
        await withController(
          { mpcAccountAddress: MFA_ACCOUNT_ADDRESS },
          async ({ controller, mocks }) => {
            mocks.getDerivedIdentities.mockResolvedValue({
              identities: [RESUMABLE_IDENTITY],
            });

            expect(await controller.startMigration()).toBeUndefined();

            expect(mocks.createMoneyAccount).toHaveBeenCalledWith({
              type: 'mpc',
            });
            expect(mocks.upgradeSuccessorAccount).toHaveBeenCalledWith(
              MFA_ACCOUNT_ADDRESS,
              MONEY_ACCOUNT_ADDRESS,
            );
            expect(mocks.registerMigrationIntents).toHaveBeenCalledWith(
              MONEY_ACCOUNT_ADDRESS,
              MFA_ACCOUNT_ADDRESS,
            );
            expect(mocks.getDerivedIdentities).toHaveBeenCalledTimes(2);
          },
        );
      });

      it('resumes a migration whose funds transfer has already started', async () => {
        const transferringIdentity: DerivedIdentity = {
          ...RESUMABLE_IDENTITY,
          migration: {
            ...MIGRATING_IDENTITY.migration,
            to: MFA_ACCOUNT_ADDRESS.toLowerCase() as Hex,
            steps: MIGRATING_IDENTITY.migration.steps.map(({ step }) => ({
              step,
              completed: true,
            })),
            transfer: { requestId: 'transfer-request-id', status: 'PENDING' },
          },
        };
        await withController(
          { mpcAccountAddress: MFA_ACCOUNT_ADDRESS },
          async ({ controller, mocks }) => {
            mocks.getDerivedIdentities.mockResolvedValue({
              identities: [transferringIdentity],
            });

            expect(await controller.startMigration()).toBeUndefined();

            expect(mocks.startFundsTransfer).toHaveBeenCalledWith(
              MONEY_ACCOUNT_ADDRESS,
            );
            expect(getLifecycle(controller)).toStrictEqual({
              type: 'migrating',
              identity: transferringIdentity,
            });
          },
        );
      });

      it('restores the MPC Money Account of this wallet to resume the migration when it is missing, as after a reinstall', async () => {
        await withController(
          { mpcAccountAddress: undefined },
          async ({ controller, mocks }) => {
            mocks.getDerivedIdentities.mockResolvedValue({
              identities: [RESUMABLE_IDENTITY],
            });

            expect(await controller.startMigration()).toBeUndefined();

            expect(mocks.createMoneyAccount).toHaveBeenCalledWith({
              type: 'mpc',
            });
            expect(mocks.upgradeSuccessorAccount).toHaveBeenCalledWith(
              MFA_ACCOUNT_ADDRESS,
              MONEY_ACCOUNT_ADDRESS,
            );
            expect(mocks.registerMigrationIntents).toHaveBeenCalledWith(
              MONEY_ACCOUNT_ADDRESS,
              MFA_ACCOUNT_ADDRESS,
            );
          },
        );
      });

      it('does not resume a migration to another address than the MPC Money Account of this wallet', async () => {
        await withController(
          { mpcAccountAddress: MFA_ACCOUNT_ADDRESS },
          async ({ controller, mocks }) => {
            mocks.getDerivedIdentities.mockResolvedValue({
              identities: [RESUMABLE_IDENTITY],
            });
            mocks.createMoneyAccount.mockResolvedValue({
              ...MFA_MONEY_ACCOUNT,
              address: '0x00000000000000000000000000000000000000ee',
            });

            await expect(controller.startMigration()).rejects.toThrow(
              `Money Account ${MONEY_ACCOUNT_ADDRESS} is migrating to ${MFA_ACCOUNT_ADDRESS.toLowerCase()}, which is not the MPC Money Account of this wallet`,
            );
            expect(mocks.upgradeSuccessorAccount).not.toHaveBeenCalled();
            expect(mocks.registerMigrationIntents).not.toHaveBeenCalled();
          },
        );
      });

      it('does not resume when the wallet locks while restoring the MPC Money Account', async () => {
        await withController(
          { mpcAccountAddress: undefined },
          async ({ controller, gates, mocks }) => {
            mocks.getDerivedIdentities.mockResolvedValue({
              identities: [RESUMABLE_IDENTITY],
            });
            mocks.createMoneyAccount.mockImplementationOnce(async () => {
              gates.isUnlocked = false;
              return MFA_MONEY_ACCOUNT;
            });

            await expect(controller.startMigration()).rejects.toThrow(
              'Money Account migration is not available',
            );
            expect(mocks.upgradeSuccessorAccount).not.toHaveBeenCalled();
          },
        );
      });

      it('does not resume when CHOMP reports no migration from the money account', async () => {
        await withController(
          { mpcAccountAddress: MFA_ACCOUNT_ADDRESS },
          async ({ controller, mocks }) => {
            mocks.getDerivedIdentities.mockResolvedValue({
              identities: [{ ...RESUMABLE_IDENTITY, migration: null }],
            });

            await expect(controller.startMigration()).rejects.toThrow(
              `The migration of Money Account ${MONEY_ACCOUNT_ADDRESS} cannot be resumed`,
            );
            expect(mocks.upgradeSuccessorAccount).not.toHaveBeenCalled();
          },
        );
      });

      it('does not resume while another identity is migrating too', async () => {
        await withController(
          { mpcAccountAddress: MFA_ACCOUNT_ADDRESS },
          async ({ controller, mocks }) => {
            mocks.getDerivedIdentities.mockResolvedValue({
              identities: [
                RESUMABLE_IDENTITY,
                {
                  ...MIGRATING_IDENTITY,
                  currentAddress: '0x00000000000000000000000000000000000000ee',
                },
              ],
            });

            await expect(controller.startMigration()).rejects.toThrow(
              'A Money Account identity is already migrating',
            );
            expect(mocks.upgradeSuccessorAccount).not.toHaveBeenCalled();
          },
        );
      });
    });

    it('rechecks the identities after creating the MPC Money Account', async () => {
      await withController(async ({ controller, mocks }) => {
        mocks.getDerivedIdentities
          .mockResolvedValueOnce({ identities: [SFA_IDENTITY] })
          .mockResolvedValueOnce({ identities: [MIGRATING_IDENTITY] });

        await expect(controller.startMigration()).rejects.toThrow(
          'A Money Account identity is already migrating',
        );
        expect(mocks.upgradeSuccessorAccount).not.toHaveBeenCalled();
      });
    });

    it('checks the MFA address against the identities fetched after creating the MPC Money Account', async () => {
      await withController(async ({ controller, mocks }) => {
        mocks.getDerivedIdentities
          .mockResolvedValueOnce({ identities: [SFA_IDENTITY] })
          .mockResolvedValueOnce({
            identities: [
              SFA_IDENTITY,
              {
                ...MFA_IDENTITY,
                currentAddress: MFA_ACCOUNT_ADDRESS.toLowerCase() as Hex,
                previousAddresses: [],
              },
            ],
          });

        await expect(controller.startMigration()).rejects.toThrow(
          `MFA account ${MFA_ACCOUNT_ADDRESS} is already part of a Money Account identity`,
        );
        expect(mocks.upgradeSuccessorAccount).not.toHaveBeenCalled();
      });
    });

    it('does not link the successor when the wallet locks while creating the MPC Money Account', async () => {
      await withController(async ({ controller, gates, mocks }) => {
        mocks.createMoneyAccount.mockImplementationOnce(async () => {
          gates.isUnlocked = false;
          return MFA_MONEY_ACCOUNT;
        });

        await expect(controller.startMigration()).rejects.toThrow(
          'Money Account migration is not available',
        );
        expect(mocks.upgradeSuccessorAccount).not.toHaveBeenCalled();
      });
    });

    it('does not start a migration while a money account upgrade is in flight', async () => {
      await withController(async ({ controller, mocks }) => {
        const { promise, resolve } = createDeferredPromise<void>();
        mocks.upgradeAccount.mockReturnValueOnce(promise);

        const upgrade = controller.upgradeMoneyAccount();
        await expect(controller.startMigration()).rejects.toThrow(
          'A Money Account upgrade is in progress',
        );
        resolve();
        await upgrade;

        expect(mocks.createMoneyAccount).not.toHaveBeenCalled();
      });
    });

    it('does not upgrade the money account while a migration is in flight', async () => {
      await withController(async ({ controller, mocks }) => {
        const { promise, resolve } = createDeferredPromise<MoneyAccount>();
        mocks.createMoneyAccount.mockReturnValueOnce(promise);

        const migration = controller.startMigration();
        expect(await controller.upgradeMoneyAccount()).toBeUndefined();
        resolve(MFA_MONEY_ACCOUNT);
        await migration;

        expect(mocks.upgradeAccount).not.toHaveBeenCalled();
      });
    });

    it('does not fall back to earlier identities when a fetch that supersedes its own fails', async () => {
      await withController(async ({ controller, mocks, init, refetch }) => {
        await init();
        const { promise, resolve } =
          createDeferredPromise<DerivedIdentitiesResponse>();
        mocks.getDerivedIdentities
          .mockReturnValueOnce(promise)
          .mockRejectedValueOnce(new Error('CHOMP is down'));

        const migration = controller.startMigration();
        await refetch();
        resolve({ identities: [MIGRATING_IDENTITY] });

        await expect(migration).rejects.toThrow(
          'Money Account migration is not available',
        );
        expect(mocks.createMoneyAccount).not.toHaveBeenCalled();
      });
    });

    it.each<{ description: string; identity: DerivedIdentity }>([
      {
        description: 'the current address of an identity',
        identity: {
          ...MFA_IDENTITY,
          currentAddress: MFA_ACCOUNT_ADDRESS.toLowerCase() as Hex,
          previousAddresses: [],
        },
      },
      {
        description: 'a previous address of an identity',
        identity: {
          ...MFA_IDENTITY,
          currentAddress: '0x00000000000000000000000000000000000000ee',
          previousAddresses: [MFA_ACCOUNT_ADDRESS.toLowerCase() as Hex],
        },
      },
    ])(
      'does not migrate to an MFA address that is $description',
      async ({ identity }) => {
        await withController(async ({ controller, mocks }) => {
          mocks.getDerivedIdentities.mockResolvedValue({
            identities: [SFA_IDENTITY, identity],
          });

          await expect(controller.startMigration()).rejects.toThrow(
            `MFA account ${MFA_ACCOUNT_ADDRESS} is already part of a Money Account identity`,
          );
        });
      },
    );

    it('does not start a migration while another is in flight, and allows one once it settles', async () => {
      await withController(async ({ controller, mocks }) => {
        const { promise, resolve } = createDeferredPromise<MoneyAccount>();
        mocks.createMoneyAccount.mockReturnValueOnce(promise);

        const first = controller.startMigration();
        await expect(controller.startMigration()).rejects.toThrow(
          'A Money Account migration is already in progress',
        );
        resolve(MFA_MONEY_ACCOUNT);
        expect(await first).toBeUndefined();

        expect(await controller.startMigration()).toBeUndefined();
        expect(mocks.createMoneyAccount).toHaveBeenCalledTimes(2);
      });
    });
  });
});
