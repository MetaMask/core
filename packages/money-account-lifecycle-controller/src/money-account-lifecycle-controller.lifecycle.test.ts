import type { DerivedIdentity } from '@metamask/chomp-api-service';
import { describe, it, expect } from 'vitest';

import {
  MPC_ACCOUNT_ID,
  MONEY_ACCOUNT_ADDRESS,
  MONEY_ACCOUNT_KEY,
  SUCCESSOR_ADDRESS,
  SFA_IDENTITY,
  MFA_IDENTITY,
  MIGRATING_IDENTITY,
  getLifecycle,
  withController,
} from '../tests/helpers.js';

describe('MoneyAccountLifecycleController', () => {
  describe('money account lifecycle', () => {
    it('records the money account as not in an identity', async () => {
      await withController(async ({ controller, mocks, init }) => {
        mocks.getDerivedIdentities.mockResolvedValue({ identities: [] });

        await init();

        expect(controller.state.moneyAccounts).toStrictEqual({
          [MONEY_ACCOUNT_KEY]: { type: 'notInIdentity' },
        });
        expect(mocks.setDefaultMoneyAccount).not.toHaveBeenCalled();
      });
    });

    it('reports an error and does not record anything when the money account cannot be read', async () => {
      await withController(async ({ controller, mocks, init }) => {
        const error = new Error('Money account unavailable');
        mocks.getMoneyAccount.mockImplementation(() => {
          throw error;
        });

        await init();

        expect(controller.state.moneyAccounts).toStrictEqual({});
        expect(mocks.getRegistrationStatus).not.toHaveBeenCalled();
        expect(mocks.captureException).toHaveBeenCalledWith(error);
      });
    });

    it('records a valid SFA without switching to the MPC keyring', async () => {
      await withController(async ({ controller, mocks, init }) => {
        await init();

        expect(controller.state.moneyAccounts).toStrictEqual({
          [MONEY_ACCOUNT_KEY]: { type: 'sfa', identity: SFA_IDENTITY },
        });
        expect(mocks.setDefaultMoneyAccount).not.toHaveBeenCalled();
      });
    });

    it('records a money account that is migrating to a successor without switching to the MPC keyring', async () => {
      await withController(async ({ controller, mocks, init }) => {
        mocks.getDerivedIdentities.mockResolvedValue({
          identities: [MIGRATING_IDENTITY],
        });

        await init();

        expect(controller.state.moneyAccounts).toStrictEqual({
          [MONEY_ACCOUNT_KEY]: {
            type: 'migrating',
            identity: MIGRATING_IDENTITY,
          },
        });
        expect(mocks.setDefaultMoneyAccount).not.toHaveBeenCalled();
      });
    });

    it('records a valid MFA and makes the MPC money account the default', async () => {
      await withController(
        { mpcAccountAddress: SUCCESSOR_ADDRESS },
        async ({ controller, mocks, init }) => {
          mocks.getDerivedIdentities.mockResolvedValue({
            identities: [MFA_IDENTITY],
          });

          await init();

          expect(controller.state.moneyAccounts).toStrictEqual({
            [MONEY_ACCOUNT_KEY]: { type: 'mfa', identity: MFA_IDENTITY },
          });
          expect(mocks.setDefaultMoneyAccount).toHaveBeenCalledTimes(1);
          expect(mocks.setDefaultMoneyAccount).toHaveBeenCalledWith(
            MPC_ACCOUNT_ID,
          );
        },
      );
    });

    it('looks up the primary money account through its mnemonic selector', async () => {
      await withController(async ({ mocks, init }) => {
        await init();

        expect(mocks.getMoneyAccount).toHaveBeenCalledWith({
          type: 'mnemonic',
        });
        expect(mocks.getMoneyAccount).not.toHaveBeenCalledWith();
      });
    });

    it('records a valid MFA and makes the MPC money account the default when its identity is migrating to a further address', async () => {
      const migratingIdentity: DerivedIdentity = {
        ...MFA_IDENTITY,
        status: 'MIGRATING',
        migration: {
          from: SUCCESSOR_ADDRESS,
          to: '0x00000000000000000000000000000000000000cc',
          steps: [{ step: 'ROOT_DELEGATION', completed: false }],
          transfer: null,
          premiumTransfer: null,
        },
      };

      await withController(
        { mpcAccountAddress: SUCCESSOR_ADDRESS },
        async ({ controller, mocks, init }) => {
          mocks.getDerivedIdentities.mockResolvedValue({
            identities: [migratingIdentity],
          });

          await init();

          expect(getLifecycle(controller)).toStrictEqual({
            type: 'mfa',
            identity: migratingIdentity,
          });
          expect(mocks.setDefaultMoneyAccount).toHaveBeenCalledWith(
            MPC_ACCOUNT_ID,
          );
          expect(mocks.captureException).not.toHaveBeenCalled();
        },
      );
    });

    it('makes the MPC money account the default on init when the persisted state already records the MFA', async () => {
      await withController(
        {
          mpcAccountAddress: SUCCESSOR_ADDRESS,
          options: {
            state: {
              moneyAccounts: {
                [MONEY_ACCOUNT_KEY]: { type: 'mfa', identity: MFA_IDENTITY },
              },
            },
          },
        },
        async ({ mocks, init }) => {
          mocks.getDerivedIdentities.mockResolvedValue({
            identities: [MFA_IDENTITY],
          });

          await init();

          expect(mocks.setDefaultMoneyAccount).toHaveBeenCalledTimes(1);
        },
      );
    });

    it('does not set the default again once the MPC money account is the default', async () => {
      await withController(
        { mpcAccountAddress: SUCCESSOR_ADDRESS },
        async ({ mocks, init, triggerMoneyAccountChange }) => {
          mocks.getDerivedIdentities.mockResolvedValue({
            identities: [MFA_IDENTITY],
          });

          await init();
          await triggerMoneyAccountChange();

          expect(mocks.setDefaultMoneyAccount).toHaveBeenCalledTimes(1);
        },
      );
    });

    it('does not set the default when the MPC money account is already the default', async () => {
      await withController(
        { mpcAccountAddress: SUCCESSOR_ADDRESS, isMpcAccountDefault: true },
        async ({ mocks, init }) => {
          mocks.getDerivedIdentities.mockResolvedValue({
            identities: [MFA_IDENTITY],
          });

          await init();

          expect(mocks.setDefaultMoneyAccount).not.toHaveBeenCalled();
        },
      );
    });

    it('does not create the MPC money account for a valid MFA, and sets it as the default once it exists', async () => {
      await withController(
        async ({
          controller,
          gates,
          mocks,
          init,
          triggerMoneyAccountChange,
        }) => {
          mocks.getDerivedIdentities.mockResolvedValue({
            identities: [MFA_IDENTITY],
          });

          await init();

          expect(getLifecycle(controller)).toStrictEqual({
            type: 'mfa',
            identity: MFA_IDENTITY,
          });
          expect(mocks.setDefaultMoneyAccount).not.toHaveBeenCalled();
          expect(mocks.captureException).not.toHaveBeenCalled();

          gates.mpcAccountAddress = SUCCESSOR_ADDRESS;
          await triggerMoneyAccountChange();

          expect(mocks.setDefaultMoneyAccount).toHaveBeenCalledWith(
            MPC_ACCOUNT_ID,
          );
        },
      );
    });

    it('does not set the default when the MPC money account is not the identity current address', async () => {
      await withController(
        { mpcAccountAddress: '0x00000000000000000000000000000000000000cc' },
        async ({ mocks, init }) => {
          mocks.getDerivedIdentities.mockResolvedValue({
            identities: [MFA_IDENTITY],
          });

          await init();

          expect(mocks.setDefaultMoneyAccount).not.toHaveBeenCalled();
        },
      );
    });

    it('reports a failure to set the MPC money account as the default', async () => {
      await withController(
        { mpcAccountAddress: SUCCESSOR_ADDRESS },
        async ({ controller, mocks, init }) => {
          const error = new Error('Switch failed');
          mocks.getDerivedIdentities.mockResolvedValue({
            identities: [MFA_IDENTITY],
          });
          mocks.setDefaultMoneyAccount.mockImplementation(() => {
            throw error;
          });

          await init();

          expect(mocks.captureException).toHaveBeenCalledWith(error);
          expect(getLifecycle(controller)).toStrictEqual({
            type: 'mfa',
            identity: MFA_IDENTITY,
          });
        },
      );
    });

    it('waits for the money account to exist before recording its lifecycle and registration status', async () => {
      await withController(
        { moneyAccountAddress: undefined },
        async ({
          controller,
          gates,
          mocks,
          init,
          triggerMoneyAccountChange,
        }) => {
          await init();

          expect(controller.state).toStrictEqual({
            moneyAccounts: {},
            addressRegistrations: {},
          });

          gates.moneyAccountAddress = MONEY_ACCOUNT_ADDRESS;
          await triggerMoneyAccountChange();

          expect(mocks.getDerivedIdentities).toHaveBeenCalledTimes(1);
          expect(controller.state).toStrictEqual({
            moneyAccounts: {
              [MONEY_ACCOUNT_KEY]: { type: 'sfa', identity: SFA_IDENTITY },
            },
            addressRegistrations: {
              [MONEY_ACCOUNT_KEY]: { isRegistered: true },
            },
          });
        },
      );
    });

    it('ignores money account changes before derived identities have been fetched', async () => {
      await withController(
        { isUnlocked: false },
        async ({ controller, mocks, init, triggerMoneyAccountChange }) => {
          await init();
          await triggerMoneyAccountChange();

          expect(mocks.getMoneyAccount).not.toHaveBeenCalled();
          expect(controller.state.moneyAccounts).toStrictEqual({});
        },
      );
    });
  });
});
