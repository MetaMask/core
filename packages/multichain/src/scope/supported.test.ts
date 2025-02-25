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

    it('returns false for unknown namespaces', () => {
      expect(isSupportedNotification('unknown', 'anything else')).toBe(false);
    });

    it('returns false for wallet namespace', () => {
      expect(isSupportedNotification('wallet', 'anything else')).toBe(false);
    });
  });

  describe('isSupportedMethod', () => {
    const getNonEvmSupportedMethods = jest.fn();

    beforeEach(() => {
      getNonEvmSupportedMethods.mockReturnValue([]);
    });

    it('returns true for each eip155 scoped method', () => {
      KnownRpcMethods.eip155.forEach((method) => {
        expect(
          isSupportedMethod(`eip155:1`, method, { getNonEvmSupportedMethods }),
        ).toBe(true);
      });
    });

    it('returns true for each wallet scoped method', () => {
      KnownWalletRpcMethods.forEach((method) => {
        expect(
          isSupportedMethod('wallet', method, { getNonEvmSupportedMethods }),
        ).toBe(true);
      });
    });

    it('returns true for each wallet:eip155 scoped method', () => {
      KnownWalletNamespaceRpcMethods.eip155.forEach((method) => {
        expect(
          isSupportedMethod(`wallet:eip155`, method, {
            getNonEvmSupportedMethods,
          }),
        ).toBe(true);
      });
    });

    it('gets the supported method list from isSupportedNonEvmMethod for non-evm wallet scoped methods', () => {
      isSupportedMethod(`wallet:nonevm`, 'nonEvmMethod', {
        getNonEvmSupportedMethods,
      });
      expect(getNonEvmSupportedMethods).toHaveBeenCalledWith('wallet:nonevm');
    });

    it('returns true for non-evm wallet scoped methods if they are returned by isSupportedNonEvmMethod', () => {
      getNonEvmSupportedMethods.mockReturnValue(['foo', 'bar', 'nonEvmMethod']);

      expect(
        isSupportedMethod(`wallet:nonevm`, 'nonEvmMethod', {
          getNonEvmSupportedMethods,
        }),
      ).toBe(true);
    });

    it('returns false for non-evm wallet scoped methods if they are not returned by isSupportedNonEvmMethod', () => {
      getNonEvmSupportedMethods.mockReturnValue(['foo', 'bar', 'nonEvmMethod']);

      expect(
        isSupportedMethod(`wallet:nonevm`, 'unsupportedMethod', {
          getNonEvmSupportedMethods,
        }),
      ).toBe(false);
    });

    it('gets the supported method list from isSupportedNonEvmMethod for non-evm scoped methods', () => {
      isSupportedMethod(`nonevm:123`, 'nonEvmMethod', {
        getNonEvmSupportedMethods,
      });
      expect(getNonEvmSupportedMethods).toHaveBeenCalledWith('nonevm:123');
    });

    it('returns true for non-evm scoped methods if they are returned by isSupportedNonEvmMethod', () => {
      getNonEvmSupportedMethods.mockReturnValue(['foo', 'bar', 'nonEvmMethod']);

      expect(
        isSupportedMethod(`nonevm:123`, 'nonEvmMethod', {
          getNonEvmSupportedMethods,
        }),
      ).toBe(true);
    });

    it('returns false for non-evm scoped methods if they are not returned by isSupportedNonEvmMethod', () => {
      getNonEvmSupportedMethods.mockReturnValue(['foo', 'bar', 'nonEvmMethod']);

      expect(
        isSupportedMethod(`nonevm:123`, 'unsupportedMethod', {
          getNonEvmSupportedMethods,
        }),
      ).toBe(false);
    });

    it('returns false otherwise', () => {
      expect(
        isSupportedMethod('eip155', 'anything else', {
          getNonEvmSupportedMethods,
        }),
      ).toBe(false);
      expect(
        isSupportedMethod('wallet:wallet', 'anything else', {
          getNonEvmSupportedMethods,
        }),
      ).toBe(false);
      expect(isSupportedMethod('', '', { getNonEvmSupportedMethods })).toBe(
        false,
      );
    });
  });

  describe('isSupportedScopeString', () => {
    const isEvmChainIdSupported = jest.fn();
    const isNonEvmScopeSupported = jest.fn();

    it('returns true for the wallet namespace', () => {
      expect(
        isSupportedScopeString('wallet', {
          isEvmChainIdSupported,
          isNonEvmScopeSupported,
        }),
      ).toBe(true);
    });

    it('calls isNonEvmScopeSupported for the wallet namespace with a non-evm reference', () => {
      isSupportedScopeString('wallet:someref', {
        isEvmChainIdSupported,
        isNonEvmScopeSupported,
      });

      expect(isNonEvmScopeSupported).toHaveBeenCalledWith('wallet:someref');
    });

    it('returns true for the wallet namespace when a non-evm reference is included if isNonEvmScopeSupported returns true', () => {
      isNonEvmScopeSupported.mockReturnValue(true);
      expect(
        isSupportedScopeString('wallet:someref', {
          isEvmChainIdSupported,
          isNonEvmScopeSupported,
        }),
      ).toBe(true);
    });
    it('returns false for the wallet namespace when a non-evm reference is included if isNonEvmScopeSupported returns false', () => {
      isNonEvmScopeSupported.mockReturnValue(false);
      expect(
        isSupportedScopeString('wallet:someref', {
          isEvmChainIdSupported,
          isNonEvmScopeSupported,
        }),
      ).toBe(false);
    });

    it('returns true for the ethereum namespace', () => {
      expect(
        isSupportedScopeString('eip155', {
          isEvmChainIdSupported,
          isNonEvmScopeSupported,
        }),
      ).toBe(true);
    });

    it('returns true for the wallet namespace with eip155 reference', () => {
      expect(
        isSupportedScopeString('wallet:eip155', {
          isEvmChainIdSupported,
          isNonEvmScopeSupported,
        }),
      ).toBe(true);
    });

    it('returns true for the ethereum namespace when a network client exists for the reference', () => {
      isEvmChainIdSupported.mockReturnValue(true);
      expect(
        isSupportedScopeString('eip155:1', {
          isEvmChainIdSupported,
          isNonEvmScopeSupported,
        }),
      ).toBe(true);
    });

    it('returns false for the ethereum namespace when a network client does not exist for the reference', () => {
      isEvmChainIdSupported.mockReturnValue(false);
      expect(
        isSupportedScopeString('eip155:1', {
          isEvmChainIdSupported,
          isNonEvmScopeSupported,
        }),
      ).toBe(false);
    });

    it('returns false for the ethereum namespace when the reference is malformed', () => {
      isEvmChainIdSupported.mockReturnValue(true);
      expect(
        isSupportedScopeString('eip155:01', {
          isEvmChainIdSupported,
          isNonEvmScopeSupported,
        }),
      ).toBe(false);
      expect(
        isSupportedScopeString('eip155:1e1', {
          isEvmChainIdSupported,
          isNonEvmScopeSupported,
        }),
      ).toBe(false);
    });

    it('returns false for non-evm namespace without a reference', () => {
      expect(
        isSupportedScopeString('nonevm', {
          isEvmChainIdSupported,
          isNonEvmScopeSupported,
        }),
      ).toBe(false);
    });

    it('calls isNonEvmScopeSupported for non-evm namespace', () => {
      isSupportedScopeString('nonevm:someref', {
        isEvmChainIdSupported,
        isNonEvmScopeSupported,
      });

      expect(isNonEvmScopeSupported).toHaveBeenCalledWith('nonevm:someref');
    });

    it('returns true for non-evm namespace if isNonEvmScopeSupported returns true', () => {
      isNonEvmScopeSupported.mockReturnValue(true);
      expect(
        isSupportedScopeString('nonevm:someref', {
          isEvmChainIdSupported,
          isNonEvmScopeSupported,
        }),
      ).toBe(true);
    });
    it('returns false for non-evm namespace if isNonEvmScopeSupported returns false', () => {
      isNonEvmScopeSupported.mockReturnValue(false);
      expect(
        isSupportedScopeString('nonevm:someref', {
          isEvmChainIdSupported,
          isNonEvmScopeSupported,
        }),
      ).toBe(false);
    });
  });

  describe('isSupportedAccount', () => {
    const getEvmInternalAccounts = jest.fn();
    const getNonEvmAccountAddresses = jest.fn();

    beforeEach(() => {
      getEvmInternalAccounts.mockReturnValue([]);
      getNonEvmAccountAddresses.mockReturnValue([]);
    });

    it('returns true if eoa account matching eip155 namespaced address exists', () => {
      getEvmInternalAccounts.mockReturnValue([
        {
          type: 'eip155:eoa',
          address: '0xdeadbeef',
        },
      ]);
      expect(
        isSupportedAccount('eip155:1:0xdeadbeef', {
          getEvmInternalAccounts,
          getNonEvmAccountAddresses,
        }),
      ).toBe(true);
    });

    it('returns true if eoa account matching eip155 namespaced address with different casing exists', () => {
      getEvmInternalAccounts.mockReturnValue([
        {
          type: 'eip155:eoa',
          address: '0xdeadBEEF',
        },
      ]);
      expect(
        isSupportedAccount('eip155:1:0xDEADbeef', {
          getEvmInternalAccounts,
          getNonEvmAccountAddresses,
        }),
      ).toBe(true);
    });

    it('returns true if erc4337 account matching eip155 namespaced address exists', () => {
      getEvmInternalAccounts.mockReturnValue([
        {
          type: 'eip155:erc4337',
          address: '0xdeadbeef',
        },
      ]);
      expect(
        isSupportedAccount('eip155:1:0xdeadbeef', {
          getEvmInternalAccounts,
          getNonEvmAccountAddresses,
        }),
      ).toBe(true);
    });

    it('returns true if erc4337 account matching eip155 namespaced address with different casing exists', () => {
      getEvmInternalAccounts.mockReturnValue([
        {
          type: 'eip155:erc4337',
          address: '0xdeadBEEF',
        },
      ]);
      expect(
        isSupportedAccount('eip155:1:0xDEADbeef', {
          getEvmInternalAccounts,
          getNonEvmAccountAddresses,
        }),
      ).toBe(true);
    });

    it('returns false if neither eoa or erc4337 account matching eip155 namespaced address exists', () => {
      getEvmInternalAccounts.mockReturnValue([
        {
          type: 'other',
          address: '0xdeadbeef',
        },
      ]);
      expect(
        isSupportedAccount('eip155:1:0xdeadbeef', {
          getEvmInternalAccounts,
          getNonEvmAccountAddresses,
        }),
      ).toBe(false);
    });

    it('returns true if eoa account matching wallet:eip155 address exists', () => {
      getEvmInternalAccounts.mockReturnValue([
        {
          type: 'eip155:eoa',
          address: '0xdeadbeef',
        },
      ]);
      expect(
        isSupportedAccount('wallet:eip155:0xdeadbeef', {
          getEvmInternalAccounts,
          getNonEvmAccountAddresses,
        }),
      ).toBe(true);
    });

    it('returns true if eoa account matching wallet:eip155 address with different casing exists', () => {
      getEvmInternalAccounts.mockReturnValue([
        {
          type: 'eip155:eoa',
          address: '0xdeadBEEF',
        },
      ]);
      expect(
        isSupportedAccount('wallet:eip155:0xDEADbeef', {
          getEvmInternalAccounts,
          getNonEvmAccountAddresses,
        }),
      ).toBe(true);
    });

    it('returns true if erc4337 account matching wallet:eip155 address exists', () => {
      getEvmInternalAccounts.mockReturnValue([
        {
          type: 'eip155:erc4337',
          address: '0xdeadbeef',
        },
      ]);
      expect(
        isSupportedAccount('wallet:eip155:0xdeadbeef', {
          getEvmInternalAccounts,
          getNonEvmAccountAddresses,
        }),
      ).toBe(true);
    });

    it('returns true if erc4337 account matching wallet:eip155 address with different casing exists', () => {
      getEvmInternalAccounts.mockReturnValue([
        {
          type: 'eip155:erc4337',
          address: '0xdeadBEEF',
        },
      ]);
      expect(
        isSupportedAccount('wallet:eip155:0xDEADbeef', {
          getEvmInternalAccounts,
          getNonEvmAccountAddresses,
        }),
      ).toBe(true);
    });

    it('returns false if neither eoa or erc4337 account matching wallet:eip155 address exists', () => {
      getEvmInternalAccounts.mockReturnValue([
        {
          type: 'other',
          address: '0xdeadbeef',
        },
      ]);
      expect(
        isSupportedAccount('wallet:eip155:0xdeadbeef', {
          getEvmInternalAccounts,
          getNonEvmAccountAddresses,
        }),
      ).toBe(false);
    });

    it('gets the non-evm account addresses for the scope if wallet namespace with non-evm reference', () => {
      isSupportedAccount('wallet:nonevm:0xdeadbeef', {
        getEvmInternalAccounts,
        getNonEvmAccountAddresses,
      });

      expect(getNonEvmAccountAddresses).toHaveBeenCalledWith('wallet:nonevm');
    });

    it('returns false if wallet namespace with non-evm reference and account is not returned by getNonEvmAccountAddresses', () => {
      getNonEvmAccountAddresses.mockReturnValue(['wallet:other:123']);
      expect(
        isSupportedAccount('wallet:nonevm:0xdeadbeef', {
          getEvmInternalAccounts,
          getNonEvmAccountAddresses,
        }),
      ).toBe(false);
    });

    it('returns true if wallet namespace with non-evm reference and account is returned by getNonEvmAccountAddresses', () => {
      getNonEvmAccountAddresses.mockReturnValue(['wallet:nonevm:0xdeadbeef']);
      expect(
        isSupportedAccount('wallet:nonevm:0xdeadbeef', {
          getEvmInternalAccounts,
          getNonEvmAccountAddresses,
        }),
      ).toBe(true);
    });

    it('gets the non-evm account addresses for the scope if non-evm namespace', () => {
      isSupportedAccount('foo:bar:0xdeadbeef', {
        getEvmInternalAccounts,
        getNonEvmAccountAddresses,
      });

      expect(getNonEvmAccountAddresses).toHaveBeenCalledWith('foo:bar');
    });

    it('returns false if non-evm namespace and account is not returned by getNonEvmAccountAddresses', () => {
      getNonEvmAccountAddresses.mockReturnValue(['wallet:other:123']);
      expect(
        isSupportedAccount('foo:bar:0xdeadbeef', {
          getEvmInternalAccounts,
          getNonEvmAccountAddresses,
        }),
      ).toBe(false);
    });

    it('returns true if non-evm namespace and account is returned by getNonEvmAccountAddresses', () => {
      getNonEvmAccountAddresses.mockReturnValue(['foo:bar:0xdeadbeef']);
      expect(
        isSupportedAccount('foo:bar:0xdeadbeef', {
          getEvmInternalAccounts,
          getNonEvmAccountAddresses,
        }),
      ).toBe(true);
    });
  });
});
