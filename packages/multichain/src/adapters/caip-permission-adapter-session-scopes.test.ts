import {
  KnownNotifications,
  KnownRpcMethods,
  KnownWalletNamespaceRpcMethods,
  KnownWalletRpcMethods,
} from '../scope/constants';
import {
  getInternalScopesObject,
  getSessionScopes,
} from './caip-permission-adapter-session-scopes';

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
    it('returns a NormalizedScopesObject for the wallet scope', () => {
      const result = getSessionScopes({
        requiredScopes: {},
        optionalScopes: {
          wallet: {
            accounts: [],
          },
        },
      });

      expect(result).toStrictEqual({
        wallet: {
          methods: KnownWalletRpcMethods,
          notifications: [],
          accounts: [],
        },
      });
    });

    it('returns a NormalizedScopesObject for the wallet:eip155 scope', () => {
      const result = getSessionScopes({
        requiredScopes: {},
        optionalScopes: {
          'wallet:eip155': {
            accounts: ['wallet:eip155:0xdeadbeef'],
          },
        },
      });

      expect(result).toStrictEqual({
        'wallet:eip155': {
          methods: KnownWalletNamespaceRpcMethods.eip155,
          notifications: [],
          accounts: ['wallet:eip155:0xdeadbeef'],
        },
      });
    });

    it('returns a NormalizedScopesObject with empty methods and notifications for scope with wallet namespace and unknown reference', () => {
      const result = getSessionScopes({
        requiredScopes: {},
        optionalScopes: {
          'wallet:foobar': {
            accounts: ['wallet:foobar:0xdeadbeef'],
          },
        },
      });

      expect(result).toStrictEqual({
        'wallet:foobar': {
          methods: [],
          notifications: [],
          accounts: ['wallet:foobar:0xdeadbeef'],
        },
      });
    });

    it('returns a NormalizedScopesObject for a eip155 namespaced scope', () => {
      const result = getSessionScopes({
        requiredScopes: {},
        optionalScopes: {
          'eip155:1': {
            accounts: ['eip155:1:0xdeadbeef'],
          },
        },
      });

      expect(result).toStrictEqual({
        'eip155:1': {
          methods: KnownRpcMethods.eip155,
          notifications: KnownNotifications.eip155,
          accounts: ['eip155:1:0xdeadbeef'],
        },
      });
    });
  });
});
