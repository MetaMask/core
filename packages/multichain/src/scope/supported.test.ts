import {
  KnownNotifications,
  KnownRpcMethods,
  KnownWalletNamespaceRpcMethods,
  KnownWalletRpcMethods,
} from './scope';
import {
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
  });
});
