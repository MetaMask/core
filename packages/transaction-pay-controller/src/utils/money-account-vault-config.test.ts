import type { Hex, Json } from '@metamask/utils';

import { CHAIN_ID_MONAD } from '../constants.js';
import type { TransactionPayControllerMessenger } from '../types.js';
import {
  getMoneyAccountVaultConfig,
  isMoneyAccountVaultActionEnabled,
} from './money-account-vault-config.js';

const VAULT_CONFIG = {
  accountantAddress: '0x2222222222222222222222222222222222222222',
  boringVault: '0x3333333333333333333333333333333333333333',
  chainId: CHAIN_ID_MONAD,
  lensAddress: '0x4444444444444444444444444444444444444444',
  tellerAddress: '0x5555555555555555555555555555555555555555',
};

function getMessenger(
  flag: unknown,
  moneyAccount: unknown = undefined,
): TransactionPayControllerMessenger {
  return {
    call: jest.fn(() => ({
      remoteFeatureFlags: {
        moneyAccount: moneyAccount as Json,
        moneyAccountVaultConfig: flag as Json,
      },
    })),
  } as unknown as TransactionPayControllerMessenger;
}

describe('getMoneyAccountVaultConfig', () => {
  it('returns a valid Monad vault config', () => {
    expect(
      getMoneyAccountVaultConfig(getMessenger(VAULT_CONFIG)),
    ).toStrictEqual(VAULT_CONFIG as Record<string, Hex>);
  });

  it.each([
    ['deposit', { moneyAccountDepositEnabled: true }],
    ['withdraw', { moneyAccountWithdrawEnabled: true }],
  ] as const)('returns true when %s is enabled', (action, flag) => {
    expect(
      isMoneyAccountVaultActionEnabled(
        getMessenger(VAULT_CONFIG, flag),
        action,
      ),
    ).toBe(true);
  });

  it.each(['deposit', 'withdraw'] as const)(
    'defaults %s to disabled',
    (action) => {
      expect(
        isMoneyAccountVaultActionEnabled(
          getMessenger(VAULT_CONFIG, {}),
          action,
        ),
      ).toBe(false);
    },
  );

  it.each([undefined, [], 'enabled'])(
    'treats non-object Money Account flags as disabled',
    (flag) => {
      expect(
        isMoneyAccountVaultActionEnabled(
          getMessenger(VAULT_CONFIG, flag),
          'deposit',
        ),
      ).toBe(false);
    },
  );

  it('throws when vault config is missing', () => {
    expect(() => getMoneyAccountVaultConfig(getMessenger(undefined))).toThrow(
      'Money Account vault config is unavailable',
    );
  });

  it.each([
    { ...VAULT_CONFIG, chainId: '0x1' },
    { ...VAULT_CONFIG, tellerAddress: '0x1234' },
    { ...VAULT_CONFIG, lensAddress: undefined },
  ])('throws when vault config is invalid', (config) => {
    expect(() => getMoneyAccountVaultConfig(getMessenger(config))).toThrow(
      'Money Account vault config is invalid',
    );
  });
});
