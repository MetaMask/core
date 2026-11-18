import type { CaipAssetType, Hex } from '@metamask/utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getMessengerMock } from '../../tests/messenger-mock.js';
import type { TransactionPayControllerMessenger } from '../types.js';
import {
  accountRequiresMfa,
  getCaipAccountId,
  getEvmAccountAddress,
  getEvmAccountOverride,
  getAssetAccount,
} from './account.js';
import type { AssetAccount } from './account.js';

const FROM_MOCK = '0xAbC0000000000000000000000000000000000001' as Hex;
const EVM_OVERRIDE_ADDRESS_MOCK =
  '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed' as Hex;
const SOLANA_CHAIN_ID_MOCK = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp';
const SOL_ASSET_ID_MOCK: CaipAssetType = `${SOLANA_CHAIN_ID_MOCK}/slip44:501`;
const SOLANA_ADDRESS_MOCK = '7Ec4QeG8wF3RnTjHDrTuYP8hVV7WYuPFyM4hZUodkG6Z';
const OTHER_SOLANA_ADDRESS_MOCK =
  '9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin';
const GROUP_ID_MOCK = 'entropy:wallet/0';

/**
 * Build an internal account fixture.
 *
 * @param account - Account fields.
 * @param account.id - Account ID.
 * @param account.address - Account address.
 * @param account.isEvm - Whether the account is an EVM account.
 * @returns The internal account.
 */
function buildAccount({
  id,
  address,
  isEvm,
}: {
  id: string;
  address: string;
  isEvm: boolean;
}): AssetAccount {
  return {
    id,
    address,
    methods: [],
    metadata: {
      importTime: 0,
      keyring: { type: 'HD Key Tree' },
      name: id,
    },
    options: {},
    scopes: isEvm ? ['eip155:0'] : [SOLANA_CHAIN_ID_MOCK],
    type: isEvm ? 'eip155:eoa' : 'solana:data-account',
  };
}

const EVM_ACCOUNT_MOCK = buildAccount({
  id: 'evm-account-id',
  address: FROM_MOCK.toLowerCase(),
  isEvm: true,
});

const SOLANA_ACCOUNT_MOCK = buildAccount({
  id: 'solana-account-id',
  address: SOLANA_ADDRESS_MOCK,
  isEvm: false,
});

const OTHER_SOLANA_ACCOUNT_MOCK = buildAccount({
  id: 'other-solana-account-id',
  address: OTHER_SOLANA_ADDRESS_MOCK,
  isEvm: false,
});

const EVM_OVERRIDE_ACCOUNT_MOCK = buildAccount({
  id: 'evm-override-account-id',
  address: EVM_OVERRIDE_ADDRESS_MOCK,
  isEvm: true,
});

describe('Account Utils', () => {
  const {
    messenger,
    getAccountContextMock,
    getAccountGroupObjectMock,
    getAccountsControllerStateMock,
  } = getMessengerMock();

  beforeEach(() => {
    vi.resetAllMocks();

    getAccountsControllerStateMock.mockReturnValue({
      accountIdByAddress: {},
      internalAccounts: {
        accounts: {
          [EVM_ACCOUNT_MOCK.id]: EVM_ACCOUNT_MOCK,
          [SOLANA_ACCOUNT_MOCK.id]: SOLANA_ACCOUNT_MOCK,
          [OTHER_SOLANA_ACCOUNT_MOCK.id]: OTHER_SOLANA_ACCOUNT_MOCK,
          [EVM_OVERRIDE_ACCOUNT_MOCK.id]: EVM_OVERRIDE_ACCOUNT_MOCK,
        },
        selectedAccount: EVM_ACCOUNT_MOCK.id,
      },
    });

    getAccountContextMock.mockReturnValue({
      groupId: GROUP_ID_MOCK,
      sortOrder: 0,
      walletId: 'entropy:wallet',
    });

    getAccountGroupObjectMock.mockReturnValue({
      accounts: [EVM_ACCOUNT_MOCK.id, SOLANA_ACCOUNT_MOCK.id],
      id: GROUP_ID_MOCK,
    });
  });

  describe('getEvmAccountAddress', () => {
    it('returns the transaction sender if there is no override', () => {
      expect(getEvmAccountAddress(messenger, undefined, FROM_MOCK)).toBe(
        FROM_MOCK,
      );
    });

    it('returns the address of an EVM account override', () => {
      expect(
        getEvmAccountAddress(
          messenger,
          EVM_OVERRIDE_ACCOUNT_MOCK.id,
          FROM_MOCK,
        ),
      ).toBe(EVM_OVERRIDE_ADDRESS_MOCK);
    });

    it('returns the transaction sender for a non-EVM account override', () => {
      expect(
        getEvmAccountAddress(messenger, SOLANA_ACCOUNT_MOCK.id, FROM_MOCK),
      ).toBe(FROM_MOCK);
    });

    it('throws if the account override is not found', () => {
      expect(() =>
        getEvmAccountAddress(messenger, 'missing-account-id', FROM_MOCK),
      ).toThrow('Account override not found');
    });
  });

  describe('getEvmAccountOverride', () => {
    it('returns undefined if there is no override', () => {
      expect(getEvmAccountOverride(messenger, undefined)).toBeUndefined();
    });

    it('returns the address of an EVM account override', () => {
      expect(
        getEvmAccountOverride(messenger, EVM_OVERRIDE_ACCOUNT_MOCK.id),
      ).toBe(EVM_OVERRIDE_ADDRESS_MOCK);
    });

    it('throws for a non-EVM account override', () => {
      expect(() =>
        getEvmAccountOverride(messenger, SOLANA_ACCOUNT_MOCK.id),
      ).toThrow('Account override is not an EVM account');
    });
  });

  describe('getAssetAccount', () => {
    it('returns the account in the same group as the sender that supports the asset chain', () => {
      expect(
        getAssetAccount(messenger, {
          accountOverride: undefined,
          assetId: SOL_ASSET_ID_MOCK,
          from: FROM_MOCK,
        }),
      ).toBe(SOLANA_ACCOUNT_MOCK);

      expect(getAccountContextMock).toHaveBeenCalledWith(EVM_ACCOUNT_MOCK.id);
      expect(getAccountGroupObjectMock).toHaveBeenCalledWith(GROUP_ID_MOCK);
    });

    it('returns the account override if it supports the asset chain', () => {
      expect(
        getAssetAccount(messenger, {
          accountOverride: OTHER_SOLANA_ACCOUNT_MOCK.id,
          assetId: SOL_ASSET_ID_MOCK,
          from: FROM_MOCK,
        }),
      ).toBe(OTHER_SOLANA_ACCOUNT_MOCK);

      expect(getAccountContextMock).not.toHaveBeenCalled();
    });

    it('uses the group of an account override that does not support the asset chain', () => {
      expect(
        getAssetAccount(messenger, {
          accountOverride: EVM_OVERRIDE_ACCOUNT_MOCK.id,
          assetId: SOL_ASSET_ID_MOCK,
          from: FROM_MOCK,
        }),
      ).toBe(SOLANA_ACCOUNT_MOCK);

      expect(getAccountContextMock).toHaveBeenCalledWith(
        EVM_OVERRIDE_ACCOUNT_MOCK.id,
      );
    });

    it('throws if the account override is not found', () => {
      expect(() =>
        getAssetAccount(messenger, {
          accountOverride: 'missing-account-id',
          assetId: SOL_ASSET_ID_MOCK,
          from: FROM_MOCK,
        }),
      ).toThrow('Account override not found');
    });

    it('throws if no account in the group supports the asset chain', () => {
      getAccountGroupObjectMock.mockReturnValue({
        accounts: [EVM_ACCOUNT_MOCK.id],
        id: GROUP_ID_MOCK,
      });

      expect(() =>
        getAssetAccount(messenger, {
          accountOverride: undefined,
          assetId: SOL_ASSET_ID_MOCK,
          from: FROM_MOCK,
        }),
      ).toThrow('Asset account not found');
    });

    it('throws if the sender account is not found', () => {
      expect(() =>
        getAssetAccount(messenger, {
          accountOverride: undefined,
          assetId: SOL_ASSET_ID_MOCK,
          from: '0x9990000000000000000000000000000000000000',
        }),
      ).toThrow('Asset account not found');

      expect(getAccountContextMock).not.toHaveBeenCalled();
    });

    it('throws if the sender account has no group', () => {
      getAccountContextMock.mockReturnValue(undefined);

      expect(() =>
        getAssetAccount(messenger, {
          accountOverride: undefined,
          assetId: SOL_ASSET_ID_MOCK,
          from: FROM_MOCK,
        }),
      ).toThrow('Asset account not found');

      expect(getAccountGroupObjectMock).not.toHaveBeenCalled();
    });

    it('throws if the group is not found', () => {
      getAccountGroupObjectMock.mockReturnValue(undefined);

      expect(() =>
        getAssetAccount(messenger, {
          accountOverride: undefined,
          assetId: SOL_ASSET_ID_MOCK,
          from: FROM_MOCK,
        }),
      ).toThrow('Asset account not found');
    });
  });

  describe('getCaipAccountId', () => {
    it('returns the CAIP-10 account ID on the asset chain', () => {
      expect(getCaipAccountId(SOL_ASSET_ID_MOCK, SOLANA_ADDRESS_MOCK)).toBe(
        `${SOLANA_CHAIN_ID_MOCK}:${SOLANA_ADDRESS_MOCK}`,
      );
    });
  });
});

describe('accountRequiresMfa', () => {
  it('returns false when account is undefined', () => {
    const messenger = {} as TransactionPayControllerMessenger;

    const result = accountRequiresMfa(messenger, undefined);

    expect(result).toBe(false);
  });

  it('returns false when account is empty string', () => {
    const messenger = {} as TransactionPayControllerMessenger;

    const result = accountRequiresMfa(messenger, '');

    expect(result).toBe(false);
  });
});
