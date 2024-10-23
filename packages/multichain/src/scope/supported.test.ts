import type { CaipAccountId } from '@metamask/utils';

import {
  KnownNotifications,
  KnownRpcMethods,
  KnownWalletNamespaceRpcMethods,
  KnownWalletRpcMethods,
} from './constants';
import {
  isSupportedAccount,
  isSupportedMethod,
  isSupportedNotification,
  isSupportedScopeString,
} from './supported';

describe('Scope Support', () => {
  describe('isSupportedNotification', () => {
    it.each(Object.entries(KnownNotifications))(
      'returns true for each %s scope method',
      (scopeString: string, notifications: string[]) => {
        notifications.forEach((notification) => {
          expect(isSupportedNotification(scopeString, notification)).toBe(true);
        });
      },
    );

    it('returns false otherwise', () => {
      expect(isSupportedNotification('eip155', 'anything else')).toBe(false);
      expect(isSupportedNotification('', '')).toBe(false);
    });
  });

  describe('isSupportedMethod', () => {
    it.each(Object.entries(KnownRpcMethods))(
      'returns true for each %s scoped method',
      (scopeString: string, methods: string[]) => {
        methods.forEach((method) => {
          expect(isSupportedMethod(scopeString, method)).toBe(true);
        });
      },
    );

    it('returns true for each wallet scoped method', () => {
      KnownWalletRpcMethods.forEach((method) => {
        expect(isSupportedMethod('wallet', method)).toBe(true);
      });
    });

    it.each(Object.entries(KnownWalletNamespaceRpcMethods))(
      'returns true for each wallet:%s scoped method',
      (scopeString: string, methods: string[]) => {
        methods.forEach((method) => {
          expect(isSupportedMethod(`wallet:${scopeString}`, method)).toBe(true);
        });
      },
    );

    it('returns false otherwise', () => {
      expect(isSupportedMethod('eip155', 'anything else')).toBe(false);
      expect(isSupportedMethod('wallet:unknown', 'anything else')).toBe(false);
      expect(isSupportedMethod('', '')).toBe(false);
    });
  });

  describe('isSupportedScopeString', () => {
    it('returns true for the wallet namespace', () => {
      expect(isSupportedScopeString('wallet', jest.fn())).toBe(true);
    });

    it('returns false for the wallet namespace when a reference is included', () => {
      expect(isSupportedScopeString('wallet:someref', jest.fn())).toBe(false);
    });

    it('returns true for the ethereum namespace', () => {
      expect(isSupportedScopeString('eip155', jest.fn())).toBe(true);
    });

    it('returns false for unknown namespaces', () => {
      expect(isSupportedScopeString('unknown', jest.fn())).toBe(false);
    });

    it('returns true for the wallet namespace with eip155 reference', () => {
      expect(isSupportedScopeString('wallet:eip155', jest.fn())).toBe(true);
    });

    it('returns false for the wallet namespace with eip155 reference', () => {
      expect(isSupportedScopeString('wallet:eip155', jest.fn())).toBe(true);
    });

    it('returns true for the ethereum namespace when a network client exists for the reference', () => {
      const isChainIdSupportedMock = jest.fn().mockReturnValue(true);
      expect(isSupportedScopeString('eip155:1', isChainIdSupportedMock)).toBe(
        true,
      );
    });

    it('returns false for the ethereum namespace when a network client does not exist for the reference', () => {
      const isChainIdSupportedMock = jest.fn().mockReturnValue(false);
      expect(isSupportedScopeString('eip155:1', isChainIdSupportedMock)).toBe(
        false,
      );
    });

    it('returns false for the ethereum namespace when the reference is malformed', () => {
      const isChainIdSupportedMock = jest.fn().mockReturnValue(true);
      expect(isSupportedScopeString('eip155:01', isChainIdSupportedMock)).toBe(
        false,
      );
      expect(isSupportedScopeString('eip155:1e1', isChainIdSupportedMock)).toBe(
        false,
      );
    });
  });

  describe('isSupportedAccount', () => {
    it.each([
      [
        true,
        'eoa account matching eip155 namespaced address exists',
        'eip155:1:0xdeadbeef',
        [
          {
            type: 'eip155:eoa',
            address: '0xdeadbeef',
          },
        ],
      ],
      [
        true,
        'eoa account matching eip155 namespaced address with different casing exists',
        'eip155:1:0xDEADbeef',
        [
          {
            type: 'eip155:eoa',
            address: '0xdeadBEEF',
          },
        ],
      ],
      [
        true,
        'erc4337 account matching eip155 namespaced address exists',
        'eip155:1:0xdeadbeef',
        [
          {
            type: 'eip155:erc4337',
            address: '0xdeadbeef',
          },
        ],
      ],
      [
        true,
        'erc4337 account matching eip155 namespaced address with different casing exists',
        'eip155:1:0xDEADbeef',
        [
          {
            type: 'eip155:erc4337',
            address: '0xdeadBEEF',
          },
        ],
      ],
      [
        false,
        'neither eoa or erc4337 account matching eip155 namespaced address exists',
        'eip155:1:0xdeadbeef',
        [
          {
            type: 'other',
            address: '0xdeadbeef',
          },
        ],
      ],

      [
        true,
        'eoa account matching wallet:eip155 address exists',
        'wallet:eip155:0xdeadbeef',
        [
          {
            type: 'eip155:eoa',
            address: '0xdeadbeef',
          },
        ],
      ],
      [
        true,
        'eoa account matching wallet:eip155 address with different casing exists',
        'wallet:eip155:0xDEADbeef',
        [
          {
            type: 'eip155:eoa',
            address: '0xdeadBEEF',
          },
        ],
      ],
      [
        true,
        'erc4337 account matching wallet:eip155 address exists',
        'wallet:eip155:0xdeadbeef',
        [
          {
            type: 'eip155:erc4337',
            address: '0xdeadbeef',
          },
        ],
      ],
      [
        true,
        'erc4337 account matching wallet:eip155 address with different casing exists',
        'wallet:eip155:0xDEADbeef',
        [
          {
            type: 'eip155:erc4337',
            address: '0xdeadBEEF',
          },
        ],
      ],
      [
        false,
        'neither eoa or erc4337 account matching wallet:eip155 address exists',
        'wallet:eip155:0xdeadbeef',
        [
          {
            type: 'other',
            address: '0xdeadbeef',
          },
        ],
      ],
      [
        false,
        'wallet namespace with unknown reference',
        'wallet:foobar:0xdeadbeef',
        [
          {
            type: 'eip155:eoa',
            address: '0xdeadbeef',
          },
          {
            type: 'eip155:erc4337',
            address: '0xdeadbeef',
          },
        ],
      ],
      [
        false,
        'unknown namespace',
        'foo:bar:0xdeadbeef',
        [
          {
            type: 'eip155:eoa',
            address: '0xdeadbeef',
          },
          {
            type: 'eip155:erc4337',
            address: '0xdeadbeef',
          },
        ],
      ],
    ])(
      'returns %s if %s',
      (result, _desc, account, getInternalAccountsValue) => {
        const getInternalAccounts = jest
          .fn()
          .mockReturnValue(getInternalAccountsValue);
        expect(
          isSupportedAccount(account as CaipAccountId, getInternalAccounts),
        ).toBe(result);
      },
    );
  });
});
