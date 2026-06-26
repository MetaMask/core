import type { CaipAccountId } from '@metamask/utils';

import {
  KnownNotifications,
  KnownRpcMethods,
  KnownWalletNamespaceRpcMethods,
  KnownWalletRpcMethods,
} from '../scope/constants';
import {
  getInternalScopesObject,
  getPermittedAccountsForScopes,
  getSessionScopes,
} from './caip-permission-operator-session-scopes';

describe('CAIP-25 session scopes adapters', () => {
  describe('getInternalScopesObject', () => {
    it('returns an InternalScopesObject with only the accounts from each NormalizedScopeObject', () => {
      const result = getInternalScopesObject({
        'wallet:eip155': {
          methods: ['foo', 'bar'],
          notifications: ['baz'],
          accounts: ['wallet:eip155:0xdead'],
        },
        'eip155:1': {
          methods: ['eth_call'],
          notifications: ['eth_subscription'],
          accounts: ['eip155:1:0xdead', 'eip155:1:0xbeef'],
        },
      });

      expect(result).toStrictEqual({
        'wallet:eip155': {
          accounts: ['wallet:eip155:0xdead'],
        },
        'eip155:1': {
          accounts: ['eip155:1:0xdead', 'eip155:1:0xbeef'],
        },
      });
    });
  });

  describe('getSessionScopes', () => {
    const getNonEvmSupportedMethods = jest.fn();
    const mockSortAccountIdsByLastSelected = jest.fn();

    it('returns a NormalizedScopesObject for the wallet scope', () => {
      const result = getSessionScopes(
        {
          requiredScopes: {},
          optionalScopes: {
            wallet: {
              accounts: [],
            },
          },
        },
        {
          getNonEvmSupportedMethods,
        },
      );

      expect(result).toStrictEqual({
        wallet: {
          methods: KnownWalletRpcMethods,
          notifications: [],
          accounts: [],
        },
      });
    });

    it('returns a NormalizedScopesObject for the wallet:eip155 scope', () => {
      const result = getSessionScopes(
        {
          requiredScopes: {},
          optionalScopes: {
            'wallet:eip155': {
              accounts: ['wallet:eip155:0xdeadbeef'],
            },
          },
        },
        {
          getNonEvmSupportedMethods,
        },
      );

      expect(result).toStrictEqual({
        'wallet:eip155': {
          methods: KnownWalletNamespaceRpcMethods.eip155,
          notifications: [],
          accounts: ['wallet:eip155:0xdeadbeef'],
        },
      });
    });

    it('gets methods from getNonEvmSupportedMethods for scope with wallet namespace and non-evm reference', () => {
      getNonEvmSupportedMethods.mockReturnValue(['nonEvmMethod']);

      getSessionScopes(
        {
          requiredScopes: {},
          optionalScopes: {
            'wallet:foobar': {
              accounts: ['wallet:foobar:0xdeadbeef'],
            },
          },
        },
        {
          getNonEvmSupportedMethods,
        },
      );

      expect(getNonEvmSupportedMethods).toHaveBeenCalledWith('wallet:foobar');
    });

    it('returns a NormalizedScopesObject with methods from getNonEvmSupportedMethods and empty notifications for scope with wallet namespace and non-evm reference', () => {
      getNonEvmSupportedMethods.mockReturnValue(['nonEvmMethod']);

      const result = getSessionScopes(
        {
          requiredScopes: {},
          optionalScopes: {
            'wallet:foobar': {
              accounts: ['wallet:foobar:0xdeadbeef'],
            },
          },
        },
        {
          getNonEvmSupportedMethods,
        },
      );

      expect(result).toStrictEqual({
        'wallet:foobar': {
          methods: ['nonEvmMethod'],
          notifications: [],
          accounts: ['wallet:foobar:0xdeadbeef'],
        },
      });
    });

    it('gets methods from getNonEvmSupportedMethods for non-evm (not `eip155`, `wallet` or `wallet:eip155`) scopes', () => {
      getNonEvmSupportedMethods.mockReturnValue(['nonEvmMethod']);

      getSessionScopes(
        {
          requiredScopes: {},
          optionalScopes: {
            'foo:1': {
              accounts: ['foo:1:0xdeadbeef'],
            },
          },
        },
        {
          getNonEvmSupportedMethods,
        },
      );

      expect(getNonEvmSupportedMethods).toHaveBeenCalledWith('foo:1');
    });

    it('returns a NormalizedScopesObject with methods from getNonEvmSupportedMethods and empty notifications for scope non-evm namespace', () => {
      getNonEvmSupportedMethods.mockReturnValue(['nonEvmMethod']);

      const result = getSessionScopes(
        {
          requiredScopes: {},
          optionalScopes: {
            'foo:1': {
              accounts: ['foo:1:0xdeadbeef'],
            },
          },
        },
        {
          getNonEvmSupportedMethods,
        },
      );

      expect(result).toStrictEqual({
        'foo:1': {
          methods: ['nonEvmMethod'],
          notifications: [],
          accounts: ['foo:1:0xdeadbeef'],
        },
      });
    });

    it('returns a NormalizedScopesObject for a eip155 namespaced scope', () => {
      const result = getSessionScopes(
        {
          requiredScopes: {},
          optionalScopes: {
            'eip155:1': {
              accounts: ['eip155:1:0xdeadbeef'],
            },
          },
        },
        {
          getNonEvmSupportedMethods,
        },
      );

      expect(result).toStrictEqual({
        'eip155:1': {
          methods: KnownRpcMethods.eip155,
          notifications: KnownNotifications.eip155,
          accounts: ['eip155:1:0xdeadbeef'],
        },
      });
    });

    it('sorts accounts using sortAccountIdsByLastSelected when provided', () => {
      const unsortedAccounts: CaipAccountId[] = [
        'eip155:1:0xbeef',
        'eip155:1:0xdead',
      ];
      const sortedAccounts: CaipAccountId[] = [
        'eip155:1:0xdead',
        'eip155:1:0xbeef',
      ];

      mockSortAccountIdsByLastSelected.mockReturnValue(sortedAccounts);

      const result = getSessionScopes(
        {
          requiredScopes: {
            'eip155:1': {
              accounts: unsortedAccounts,
            },
          },
          optionalScopes: {},
        },
        {
          getNonEvmSupportedMethods,
          sortAccountIdsByLastSelected: mockSortAccountIdsByLastSelected,
        },
      );

      expect(mockSortAccountIdsByLastSelected).toHaveBeenCalledWith(
        unsortedAccounts,
      );
      expect(result).toStrictEqual({
        'eip155:1': {
          methods: KnownRpcMethods.eip155,
          notifications: KnownNotifications.eip155,
          accounts: sortedAccounts,
        },
      });
    });

    it('does not sort accounts when sortAccountIdsByLastSelected is not provided', () => {
      const accounts: CaipAccountId[] = ['eip155:1:0xbeef', 'eip155:1:0xdead'];

      const result = getSessionScopes(
        {
          requiredScopes: {
            'eip155:1': {
              accounts,
            },
          },
          optionalScopes: {},
        },
        {
          getNonEvmSupportedMethods,
        },
      );

      expect(mockSortAccountIdsByLastSelected).not.toHaveBeenCalled();
      expect(result).toStrictEqual({
        'eip155:1': {
          methods: KnownRpcMethods.eip155,
          notifications: KnownNotifications.eip155,
          accounts, // Original order preserved
        },
      });
    });

    it('sorts accounts in both required and optional scopes', () => {
      const unsortedAccounts1: CaipAccountId[] = [
        'eip155:1:0xbeef',
        'eip155:1:0xdead',
      ];
      const unsortedAccounts2: CaipAccountId[] = [
        'eip155:137:0xcafe',
        'eip155:137:0xbabe',
      ];
      const sortedAccounts1: CaipAccountId[] = [
        'eip155:1:0xdead',
        'eip155:1:0xbeef',
      ];
      const sortedAccounts2: CaipAccountId[] = [
        'eip155:137:0xbabe',
        'eip155:137:0xcafe',
      ];

      mockSortAccountIdsByLastSelected
        .mockReturnValueOnce(sortedAccounts1)
        .mockReturnValueOnce(sortedAccounts2);

      const result = getSessionScopes(
        {
          requiredScopes: {
            'eip155:1': {
              accounts: unsortedAccounts1,
            },
          },
          optionalScopes: {
            'eip155:137': {
              accounts: unsortedAccounts2,
            },
          },
        },
        {
          getNonEvmSupportedMethods,
          sortAccountIdsByLastSelected: mockSortAccountIdsByLastSelected,
        },
      );

      expect(mockSortAccountIdsByLastSelected).toHaveBeenCalledTimes(2);
      expect(mockSortAccountIdsByLastSelected).toHaveBeenNthCalledWith(
        1,
        unsortedAccounts1,
      );
      expect(mockSortAccountIdsByLastSelected).toHaveBeenNthCalledWith(
        2,
        unsortedAccounts2,
      );
      expect(result).toStrictEqual({
        'eip155:1': {
          methods: KnownRpcMethods.eip155,
          notifications: KnownNotifications.eip155,
          accounts: sortedAccounts1,
        },
        'eip155:137': {
          methods: KnownRpcMethods.eip155,
          notifications: KnownNotifications.eip155,
          accounts: sortedAccounts2,
        },
      });
    });
  });

  describe('getPermittedAccountsForScopes', () => {
    it('returns an array of permitted accounts for a given scope', () => {
      const result = getPermittedAccountsForScopes(
        {
          requiredScopes: {},
          optionalScopes: {
            'wallet:eip155': {
              accounts: ['wallet:eip155:0xdeadbeef'],
            },
          },
        },
        ['wallet:eip155'],
      );

      expect(result).toStrictEqual(['wallet:eip155:0xdeadbeef']);
    });

    it('returns an empty array if the scope does not exist', () => {
      const result = getPermittedAccountsForScopes(
        { requiredScopes: {}, optionalScopes: {} },
        ['wallet:eip155'],
      );
      expect(result).toStrictEqual([]);
    });

    it('returns an empty array if the scope does not have any accounts', () => {
      const result = getPermittedAccountsForScopes(
        {
          requiredScopes: {
            'wallet:eip155': {
              accounts: [],
            },
          },
          optionalScopes: {},
        },
        ['wallet:eip155'],
      );
      expect(result).toStrictEqual([]);
    });
  });
  it('returns an array of permitted accounts for multiple scopes and deduplicates accounts', () => {
    const result = getPermittedAccountsForScopes(
      {
        requiredScopes: {
          'wallet:eip155': { accounts: ['wallet:eip155:0xdeadbeef'] },
        },
        optionalScopes: {
          'wallet:eip155': { accounts: ['wallet:eip155:0xdeadbeef'] },
        },
      },
      ['wallet:eip155'],
    );
    expect(result).toStrictEqual(['wallet:eip155:0xdeadbeef']);
  });
});
