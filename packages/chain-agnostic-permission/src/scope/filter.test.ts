import * as Assert from './assert';
import { bucketScopesBySupport, getSupportedScopeObjects } from './filter';
import * as Supported from './supported';

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
          if (scopeString === 'eip155:1' && method === 'method1') {
            return false;
          }
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
          if (scopeString === 'eip155:1' && notification === 'notification1') {
            return false;
          }
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
});
