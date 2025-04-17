import * as Assert from './assert';
import {
  bucketScopesBySupport,
  getAllScopesFromScopesObjects,
  getCaipAccountIdsFromScopesObjects,
  getSupportedScopeObjects,
} from './filter';
import * as Supported from './supported';
import type { InternalScopesObject } from './types';

jest.mock('./assert', () => ({
  ...jest.requireActual('./assert'),
  assertScopeSupported: jest.fn(),
}));
const MockAssert = jest.mocked(Assert);

jest.mock('./supported', () => ({
  ...jest.requireActual('./supported'),
  isSupportedMethod: jest.fn(),
  isSupportedNotification: jest.fn(),
}));
const MockSupported = jest.mocked(Supported);

describe('filter', () => {
  describe('bucketScopesBySupport', () => {
    const isEvmChainIdSupported = jest.fn();
    const isNonEvmScopeSupported = jest.fn();
    const getNonEvmSupportedMethods = jest.fn();

    it('checks if each scope is supported', () => {
      bucketScopesBySupport(
        {
          'eip155:1': {
            methods: ['a'],
            notifications: [],
            accounts: [],
          },
          'eip155:5': {
            methods: ['b'],
            notifications: [],
            accounts: [],
          },
        },
        {
          isEvmChainIdSupported,
          isNonEvmScopeSupported,
          getNonEvmSupportedMethods,
        },
      );

      expect(MockAssert.assertScopeSupported).toHaveBeenCalledWith(
        'eip155:1',
        {
          methods: ['a'],
          notifications: [],
          accounts: [],
        },
        {
          isEvmChainIdSupported,
          isNonEvmScopeSupported,
          getNonEvmSupportedMethods,
        },
      );
      expect(MockAssert.assertScopeSupported).toHaveBeenCalledWith(
        'eip155:5',
        {
          methods: ['b'],
          notifications: [],
          accounts: [],
        },
        {
          isEvmChainIdSupported,
          isNonEvmScopeSupported,
          getNonEvmSupportedMethods,
        },
      );
    });

    it('returns supported and unsupported scopes', () => {
      MockAssert.assertScopeSupported.mockImplementation((scopeString) => {
        // This is okay; we are inside of a mock.
        // eslint-disable-next-line jest/no-conditional-in-test
        if (scopeString === 'eip155:1') {
          throw new Error('scope not supported');
        }
      });

      expect(
        bucketScopesBySupport(
          {
            'eip155:1': {
              methods: ['a'],
              notifications: [],
              accounts: [],
            },
            'eip155:5': {
              methods: ['b'],
              notifications: [],
              accounts: [],
            },
          },
          {
            isEvmChainIdSupported,
            isNonEvmScopeSupported,
            getNonEvmSupportedMethods,
          },
        ),
      ).toStrictEqual({
        supportedScopes: {
          'eip155:5': {
            methods: ['b'],
            notifications: [],
            accounts: [],
          },
        },
        unsupportedScopes: {
          'eip155:1': {
            methods: ['a'],
            notifications: [],
            accounts: [],
          },
        },
      });
    });
  });

  describe('getSupportedScopeObjects', () => {
    const getNonEvmSupportedMethods = jest.fn();

    it('checks if each scopeObject method is supported', () => {
      getSupportedScopeObjects(
        {
          'eip155:1': {
            methods: ['method1', 'method2'],
            notifications: [],
            accounts: [],
          },
          'eip155:5': {
            methods: ['methodA', 'methodB'],
            notifications: [],
            accounts: [],
          },
        },
        {
          getNonEvmSupportedMethods,
        },
      );

      expect(MockSupported.isSupportedMethod).toHaveBeenCalledTimes(4);
      expect(MockSupported.isSupportedMethod).toHaveBeenCalledWith(
        'eip155:1',
        'method1',
        {
          getNonEvmSupportedMethods,
        },
      );
      expect(MockSupported.isSupportedMethod).toHaveBeenCalledWith(
        'eip155:1',
        'method2',
        {
          getNonEvmSupportedMethods,
        },
      );
      expect(MockSupported.isSupportedMethod).toHaveBeenCalledWith(
        'eip155:5',
        'methodA',
        {
          getNonEvmSupportedMethods,
        },
      );
      expect(MockSupported.isSupportedMethod).toHaveBeenCalledWith(
        'eip155:5',
        'methodB',
        {
          getNonEvmSupportedMethods,
        },
      );
    });

    it('returns only supported methods', () => {
      MockSupported.isSupportedMethod.mockImplementation(
        (scopeString, method) => {
          // This is okay; we are inside of a mock.
          // eslint-disable-next-line jest/no-conditional-in-test
          if (scopeString === 'eip155:1' && method === 'method1') {
            return false;
          }
          // This is okay; we are inside of a mock.
          // eslint-disable-next-line jest/no-conditional-in-test
          if (scopeString === 'eip155:5' && method === 'methodB') {
            return false;
          }
          return true;
        },
      );

      const result = getSupportedScopeObjects(
        {
          'eip155:1': {
            methods: ['method1', 'method2'],
            notifications: [],
            accounts: [],
          },
          'eip155:5': {
            methods: ['methodA', 'methodB'],
            notifications: [],
            accounts: [],
          },
        },
        {
          getNonEvmSupportedMethods,
        },
      );

      expect(result).toStrictEqual({
        'eip155:1': {
          methods: ['method2'],
          notifications: [],
          accounts: [],
        },
        'eip155:5': {
          methods: ['methodA'],
          notifications: [],
          accounts: [],
        },
      });
    });

    it('checks if each scopeObject notification is supported', () => {
      getSupportedScopeObjects(
        {
          'eip155:1': {
            methods: [],
            notifications: ['notification1', 'notification2'],
            accounts: [],
          },
          'eip155:5': {
            methods: [],
            notifications: ['notificationA', 'notificationB'],
            accounts: [],
          },
        },
        {
          getNonEvmSupportedMethods,
        },
      );

      expect(MockSupported.isSupportedNotification).toHaveBeenCalledTimes(4);
      expect(MockSupported.isSupportedNotification).toHaveBeenCalledWith(
        'eip155:1',
        'notification1',
      );
      expect(MockSupported.isSupportedNotification).toHaveBeenCalledWith(
        'eip155:1',
        'notification2',
      );
      expect(MockSupported.isSupportedNotification).toHaveBeenCalledWith(
        'eip155:5',
        'notificationA',
      );
      expect(MockSupported.isSupportedNotification).toHaveBeenCalledWith(
        'eip155:5',
        'notificationB',
      );
    });

    it('returns only supported notifications', () => {
      MockSupported.isSupportedNotification.mockImplementation(
        (scopeString, notification) => {
          // This is okay; we are inside of a mock.
          // eslint-disable-next-line jest/no-conditional-in-test
          if (scopeString === 'eip155:1' && notification === 'notification1') {
            return false;
          }
          // This is okay; we are inside of a mock.
          // eslint-disable-next-line jest/no-conditional-in-test
          if (scopeString === 'eip155:5' && notification === 'notificationB') {
            return false;
          }
          return true;
        },
      );

      const result = getSupportedScopeObjects(
        {
          'eip155:1': {
            methods: [],
            notifications: ['notification1', 'notification2'],
            accounts: [],
          },
          'eip155:5': {
            methods: [],
            notifications: ['notificationA', 'notificationB'],
            accounts: [],
          },
        },
        {
          getNonEvmSupportedMethods,
        },
      );

      expect(result).toStrictEqual({
        'eip155:1': {
          methods: [],
          notifications: ['notification2'],
          accounts: [],
        },
        'eip155:5': {
          methods: [],
          notifications: ['notificationA'],
          accounts: [],
        },
      });
    });

    it('does not modify accounts', () => {
      const result = getSupportedScopeObjects(
        {
          'eip155:1': {
            methods: [],
            notifications: [],
            accounts: ['eip155:1:0xdeadbeef'],
          },
          'eip155:5': {
            methods: [],
            notifications: [],
            accounts: ['eip155:5:0xdeadbeef'],
          },
        },
        {
          getNonEvmSupportedMethods,
        },
      );

      expect(result).toStrictEqual({
        'eip155:1': {
          methods: [],
          notifications: [],
          accounts: ['eip155:1:0xdeadbeef'],
        },
        'eip155:5': {
          methods: [],
          notifications: [],
          accounts: ['eip155:5:0xdeadbeef'],
        },
      });
    });
  });

  describe('getCaipAccountIdsFromScopesObjects', () => {
    it('should extract all unique account IDs from scopes objects', () => {
      const scopesObjects: InternalScopesObject[] = [
        {
          'eip155:1': {
            accounts: ['eip155:1:0x123', 'eip155:1:0x456', 'eip155:1:0xabc'],
          },
          'eip155:137': {
            accounts: ['eip155:137:0x123', 'eip155:137:0x789'],
          },
          'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp': {
            accounts: ['solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp:abc123'],
          },
        },
        {
          'eip155:1': {
            accounts: ['eip155:1:0xabc'], // duplicate account ID
          },
        },
      ];

      const result = getCaipAccountIdsFromScopesObjects(scopesObjects);

      expect(result).toEqual(
        expect.arrayContaining([
          'eip155:1:0x123',
          'eip155:1:0x456',
          'eip155:1:0xabc',
          'eip155:137:0x123',
          'eip155:137:0x789',
          'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp:abc123',
        ]),
      );
    });

    it('should return empty array when no accounts exist', () => {
      const scopesObjects: InternalScopesObject[] = [
        {
          'eip155:1': {
            accounts: [],
          },
          'eip155:137': {
            accounts: [],
          },
        },
      ];

      const result = getCaipAccountIdsFromScopesObjects(scopesObjects);
      expect(result).toStrictEqual([]);
    });

    it('should handle empty scopes objects', () => {
      const result = getCaipAccountIdsFromScopesObjects([]);
      expect(result).toStrictEqual([]);
    });
  });
  describe('getAllScopesFromScopesObjects', () => {
    it('should extract all unique scope strings from scopes objects', () => {
      const scopesObjects: InternalScopesObject[] = [
        {
          'eip155:1': {
            accounts: ['eip155:1:0x123', 'eip155:1:0x456', 'eip155:1:0xabc'],
          },
          'eip155:137': {
            accounts: ['eip155:137:0x123', 'eip155:137:0x789'],
          },
          'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp': {
            accounts: ['solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp:abc123'],
          },
        },
        {
          'eip155:1': {
            accounts: ['eip155:1:0x123'], // duplicate accountID
          },
        },
      ];

      const result = getAllScopesFromScopesObjects(scopesObjects);

      expect(result).toStrictEqual(
        expect.arrayContaining([
          'eip155:1',
          'eip155:137',
          'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
        ]),
      );
    });

    it('should return empty array when no scopes exist', () => {
      const scopesObjects: InternalScopesObject[] = [];
      const result = getAllScopesFromScopesObjects(scopesObjects);
      expect(result).toStrictEqual([]);
    });

    it('should handle empty scope objects', () => {
      const scopesObjects: InternalScopesObject[] = [{}];
      const result = getAllScopesFromScopesObjects(scopesObjects);
      expect(result).toStrictEqual([]);
    });
  });
});
