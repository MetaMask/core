import {
  CaveatMutatorOperation,
  PermissionType,
} from '@metamask/permission-controller';

import type { Caip25CaveatValue } from './caip25Permission';
import {
  Caip25CaveatType,
  caip25EndowmentBuilder,
  Caip25EndowmentPermissionName,
  Caip25CaveatMutators,
  createCaip25Caveat,
  caip25CaveatBuilder,
} from './caip25Permission';
import * as ScopeSupported from './scope/supported';

jest.mock('./scope/supported', () => ({
  ...jest.requireActual('./scope/supported'),
  isSupportedScopeString: jest.fn(),
  isSupportedAccount: jest.fn(),
}));
const MockScopeSupported = jest.mocked(ScopeSupported);

const { removeAccount, removeScope } = Caip25CaveatMutators[Caip25CaveatType];

describe('caip25EndowmentBuilder', () => {
  describe('specificationBuilder', () => {
    it('builds the expected permission specification', () => {
      const specification = caip25EndowmentBuilder.specificationBuilder({
        methodHooks: {
          findNetworkClientIdByChainId: jest.fn(),
          listAccounts: jest.fn(),
        },
      });
      expect(specification).toStrictEqual({
        permissionType: PermissionType.Endowment,
        targetName: Caip25EndowmentPermissionName,
        endowmentGetter: expect.any(Function),
        allowedCaveats: [Caip25CaveatType],
        validator: expect.any(Function),
      });

      expect(specification.endowmentGetter()).toBeNull();
    });
  });

  describe('createCaip25Caveat', () => {
    it('builds the caveat', () => {
      expect(
        createCaip25Caveat({
          requiredScopes: {},
          optionalScopes: {},
          isMultichainOrigin: true,
        }),
      ).toStrictEqual({
        type: Caip25CaveatType,
        value: {
          requiredScopes: {},
          optionalScopes: {},
          isMultichainOrigin: true,
        },
      });
    });
  });

  describe('Caip25CaveatMutators.authorizedScopes', () => {
    describe('removeScope', () => {
      it('updates the caveat with the given scope removed from requiredScopes if it is present', () => {
        const caveatValue = {
          requiredScopes: {
            'eip155:1': {
              accounts: [],
            },
          },
          optionalScopes: {
            'eip155:5': {
              accounts: [],
            },
          },
          sessionProperties: {},
          isMultichainOrigin: true,
        };
        const result = removeScope(caveatValue, 'eip155:1');
        expect(result).toStrictEqual({
          operation: CaveatMutatorOperation.UpdateValue,
          value: {
            requiredScopes: {},
            optionalScopes: {
              'eip155:5': {
                accounts: [],
              },
            },
            sessionProperties: {},
            isMultichainOrigin: true,
          },
        });
      });

      it('updates the caveat with the given scope removed from optionalScopes if it is present', () => {
        const caveatValue = {
          requiredScopes: {
            'eip155:1': {
              accounts: [],
            },
          },
          optionalScopes: {
            'eip155:5': {
              accounts: [],
            },
          },
          sessionProperties: {},
          isMultichainOrigin: true,
        };
        const result = removeScope(caveatValue, 'eip155:5');
        expect(result).toStrictEqual({
          operation: CaveatMutatorOperation.UpdateValue,
          value: {
            requiredScopes: {
              'eip155:1': {
                accounts: [],
              },
            },
            optionalScopes: {},
            sessionProperties: {},
            isMultichainOrigin: true,
          },
        });
      });

      it('updates the caveat with the given scope removed from requiredScopes and optionalScopes if it is present', () => {
        const caveatValue = {
          requiredScopes: {
            'eip155:1': {
              accounts: [],
            },
            'eip155:5': {
              accounts: [],
            },
          },
          optionalScopes: {
            'eip155:5': {
              accounts: [],
            },
          },
          sessionProperties: {},
          isMultichainOrigin: true,
        };
        const result = removeScope(caveatValue, 'eip155:5');
        expect(result).toStrictEqual({
          operation: CaveatMutatorOperation.UpdateValue,
          value: {
            requiredScopes: {
              'eip155:1': {
                accounts: [],
              },
            },
            optionalScopes: {},
            sessionProperties: {},
            isMultichainOrigin: true,
          },
        });
      });

      it('revokes the permission if the only non wallet scope is removed', () => {
        const caveatValue = {
          requiredScopes: {},
          optionalScopes: {
            'eip155:5': {
              accounts: [],
            },
            'wallet:eip155': {
              accounts: [],
            },
            wallet: {
              accounts: [],
            },
          },
          sessionProperties: {},
          isMultichainOrigin: true,
        };
        const result = removeScope(caveatValue, 'eip155:5');
        expect(result).toStrictEqual({
          operation: CaveatMutatorOperation.RevokePermission,
        });
      });

      it('does nothing if the target scope does not exist but the permission only has wallet scopes', () => {
        const caveatValue = {
          requiredScopes: {},
          optionalScopes: {
            'wallet:eip155': {
              accounts: [],
            },
            wallet: {
              accounts: [],
            },
          },
          sessionProperties: {},
          isMultichainOrigin: true,
        };
        const result = removeScope(caveatValue, 'eip155:5');
        expect(result).toStrictEqual({
          operation: CaveatMutatorOperation.Noop,
        });
      });

      it('does nothing if the given scope is not found in either requiredScopes or optionalScopes', () => {
        const caveatValue = {
          requiredScopes: {
            'eip155:1': {
              accounts: [],
            },
          },
          optionalScopes: {
            'eip155:5': {
              accounts: [],
            },
          },
          sessionProperties: {},
          isMultichainOrigin: true,
        };
        const result = removeScope(caveatValue, 'eip155:2');
        expect(result).toStrictEqual({
          operation: CaveatMutatorOperation.Noop,
        });
      });
    });

    describe('removeAccount', () => {
      it('updates the caveat with the given account removed from requiredScopes if it is present', () => {
        const caveatValue: Caip25CaveatValue = {
          requiredScopes: {
            'eip155:1': {
              accounts: ['eip155:1:0x1', 'eip155:1:0x2'],
            },
          },
          optionalScopes: {},
          sessionProperties: {},
          isMultichainOrigin: true,
        };
        const result = removeAccount(caveatValue, '0x1');
        expect(result).toStrictEqual({
          operation: CaveatMutatorOperation.UpdateValue,
          value: {
            requiredScopes: {
              'eip155:1': {
                accounts: ['eip155:1:0x2'],
              },
            },
            optionalScopes: {},
            sessionProperties: {},
            isMultichainOrigin: true,
          },
        });
      });

      it('updates the caveat with the given account removed from optionalScopes if it is present', () => {
        const caveatValue: Caip25CaveatValue = {
          requiredScopes: {},
          optionalScopes: {
            'eip155:1': {
              accounts: ['eip155:1:0x1', 'eip155:1:0x2'],
            },
          },
          sessionProperties: {},
          isMultichainOrigin: true,
        };
        const result = removeAccount(caveatValue, '0x1');
        expect(result).toStrictEqual({
          operation: CaveatMutatorOperation.UpdateValue,
          value: {
            requiredScopes: {},
            optionalScopes: {
              'eip155:1': {
                accounts: ['eip155:1:0x2'],
              },
            },
            sessionProperties: {},
            isMultichainOrigin: true,
          },
        });
      });

      it('updates the caveat with the given account removed from requiredScopes and optionalScopes if it is present', () => {
        const caveatValue: Caip25CaveatValue = {
          requiredScopes: {
            'eip155:1': {
              accounts: ['eip155:1:0x1', 'eip155:1:0x2'],
            },
            'eip155:2': {
              accounts: ['eip155:2:0x1', 'eip155:2:0x2'],
            },
          },
          optionalScopes: {
            'eip155:3': {
              accounts: ['eip155:3:0x1', 'eip155:3:0x2'],
            },
          },
          sessionProperties: {},
          isMultichainOrigin: true,
        };
        const result = removeAccount(caveatValue, '0x1');
        expect(result).toStrictEqual({
          operation: CaveatMutatorOperation.UpdateValue,
          value: {
            requiredScopes: {
              'eip155:1': {
                accounts: ['eip155:1:0x2'],
              },
              'eip155:2': {
                accounts: ['eip155:2:0x2'],
              },
            },
            optionalScopes: {
              'eip155:3': {
                accounts: ['eip155:3:0x2'],
              },
            },
            sessionProperties: {},
            isMultichainOrigin: true,
          },
        });
      });

      it('revokes the permission if the only account is removed', () => {
        const caveatValue: Caip25CaveatValue = {
          requiredScopes: {},
          optionalScopes: {
            'eip155:1': {
              accounts: ['eip155:1:0x1'],
            },
          },
          isMultichainOrigin: true,
        };
        const result = removeAccount(caveatValue, '0x1');
        expect(result).toStrictEqual({
          operation: CaveatMutatorOperation.RevokePermission,
        });
      });

      it('updates the permission with the target account removed if the target account does exist and `wallet:eip155` is the only scope with remaining accounts after', () => {
        const caveatValue: Caip25CaveatValue = {
          requiredScopes: {},
          optionalScopes: {
            'eip155:1': {
              accounts: ['eip155:1:0x1'],
            },
            'wallet:eip155': {
              accounts: ['wallet:eip155:0x1', 'wallet:eip155:0x2'],
            },
          },
          isMultichainOrigin: true,
        };
        const result = removeAccount(caveatValue, '0x1');
        expect(result).toStrictEqual({
          operation: CaveatMutatorOperation.UpdateValue,
          value: {
            requiredScopes: {},
            optionalScopes: {
              'eip155:1': {
                accounts: [],
              },
              'wallet:eip155': {
                accounts: ['wallet:eip155:0x2'],
              },
            },
            isMultichainOrigin: true,
          },
        });
      });

      it('does nothing if the target account does not exist but the permission already has no accounts', () => {
        const caveatValue: Caip25CaveatValue = {
          requiredScopes: {},
          optionalScopes: {
            'eip155:1': {
              accounts: [],
            },
          },
          isMultichainOrigin: true,
        };
        const result = removeAccount(caveatValue, '0x1');
        expect(result).toStrictEqual({
          operation: CaveatMutatorOperation.Noop,
        });
      });

      it('does nothing if the given account is not found in either requiredScopes or optionalScopes', () => {
        const caveatValue: Caip25CaveatValue = {
          requiredScopes: {
            'eip155:1': {
              accounts: ['eip155:1:0x1', 'eip155:1:0x2'],
            },
          },
          optionalScopes: {
            'eip155:5': {
              accounts: [],
            },
          },
          isMultichainOrigin: true,
        };
        const result = removeAccount(caveatValue, '0x3');
        expect(result).toStrictEqual({
          operation: CaveatMutatorOperation.Noop,
        });
      });
    });
  });

  describe('permission validator', () => {
    const { validator } = caip25EndowmentBuilder.specificationBuilder({});

    it('throws an error if there is not exactly one caveat', () => {
      expect(() => {
        validator({
          caveats: [
            {
              type: 'caveatType',
              value: {},
            },
            {
              type: 'caveatType',
              value: {},
            },
          ],
          date: 1234,
          id: '1',
          invoker: 'test.com',
          parentCapability: Caip25EndowmentPermissionName,
        });
      }).toThrow(
        new Error(
          `${Caip25EndowmentPermissionName} error: Invalid caveats. There must be a single caveat of type "${Caip25CaveatType}".`,
        ),
      );

      expect(() => {
        validator({
          // @ts-expect-error Intentionally invalid input
          caveats: [],
          date: 1234,
          id: '1',
          invoker: 'test.com',
          parentCapability: Caip25EndowmentPermissionName,
        });
      }).toThrow(
        new Error(
          `${Caip25EndowmentPermissionName} error: Invalid caveats. There must be a single caveat of type "${Caip25CaveatType}".`,
        ),
      );
    });

    it('throws an error if there is no CAIP-25 caveat', () => {
      expect(() => {
        validator({
          caveats: [
            {
              type: 'NotCaip25Caveat',
              value: {},
            },
          ],
          date: 1234,
          id: '1',
          invoker: 'test.com',
          parentCapability: Caip25EndowmentPermissionName,
        });
      }).toThrow(
        new Error(
          `${Caip25EndowmentPermissionName} error: Invalid caveats. There must be a single caveat of type "${Caip25CaveatType}".`,
        ),
      );
    });
  });
});

describe('caip25CaveatBuilder', () => {
  const findNetworkClientIdByChainId = jest.fn();
  const listAccounts = jest.fn();
  const isNonEvmScopeSupported = jest.fn()
  const getNonEvmAccountAddresses = jest.fn()
  const { validator } = caip25CaveatBuilder({
    findNetworkClientIdByChainId,
    listAccounts,
    isNonEvmScopeSupported,
    getNonEvmAccountAddresses,
  });

  it('throws an error if the CAIP-25 caveat is malformed', () => {
    expect(() => {
      validator({
        type: Caip25CaveatType,
        value: {
          missingRequiredScopes: {},
          optionalScopes: {},
          isMultichainOrigin: true,
        },
      });
    }).toThrow(
      new Error(
        `${Caip25EndowmentPermissionName} error: Received invalid value for caveat of type "${Caip25CaveatType}".`,
      ),
    );

    expect(() => {
      validator({
        type: Caip25CaveatType,
        value: {
          requiredScopes: {},
          missingOptionalScopes: {},
          isMultichainOrigin: true,
        },
      });
    }).toThrow(
      new Error(
        `${Caip25EndowmentPermissionName} error: Received invalid value for caveat of type "${Caip25CaveatType}".`,
      ),
    );

    expect(() => {
      validator({
        type: Caip25CaveatType,
        value: {
          requiredScopes: {},
          optionalScopes: {},
          isMultichainOrigin: 'NotABoolean',
        },
      });
    }).toThrow(
      new Error(
        `${Caip25EndowmentPermissionName} error: Received invalid value for caveat of type "${Caip25CaveatType}".`,
      ),
    );
  });

  it('asserts the internal required scopeStrings are supported', () => {
    MockScopeSupported.isSupportedScopeString.mockReturnValue(true)

    try {
      validator({
        type: Caip25CaveatType,
        value: {
          requiredScopes: {
            'eip155:1': {
              accounts: [],
            },
            'bip122:000000000019d6689c085ae165831e93': {
              accounts: [],
            },
          },
          optionalScopes: {
            'eip155:5': {
              accounts: [],
            },
            'bip122:12a765e31ffd4059bada1e25190f6e98': {
              accounts: [],
            },
          },
          isMultichainOrigin: true,
        },
      });
    } catch (err) {
      // noop
    }
    expect(MockScopeSupported.isSupportedScopeString).toHaveBeenCalledWith(
      'eip155:1',
      {
        isEvmChainIdSupported: expect.any(Function),
        isNonEvmScopeSupported: expect.any(Function),
      }
    );
    expect(MockScopeSupported.isSupportedScopeString).toHaveBeenCalledWith(
      'bip122:000000000019d6689c085ae165831e93',
      {
        isEvmChainIdSupported: expect.any(Function),
        isNonEvmScopeSupported: expect.any(Function),
      }
    );

    MockScopeSupported.isSupportedScopeString.mock.calls[0][1].isEvmChainIdSupported('0x1');
    expect(findNetworkClientIdByChainId).toHaveBeenCalledWith('0x1');
  });

  it('asserts the internal optional scopeStrings are supported', () => {
    MockScopeSupported.isSupportedScopeString.mockReturnValue(true)

    try {
      validator({
        type: Caip25CaveatType,
        value: {
          requiredScopes: {
            'eip155:1': {
              accounts: [],
            },
            'bip122:000000000019d6689c085ae165831e93': {
              accounts: [],
            },
          },
          optionalScopes: {
            'eip155:5': {
              accounts: [],
            },
            'bip122:12a765e31ffd4059bada1e25190f6e98': {
              accounts: [],
            },
          },
          isMultichainOrigin: true,
        },
      });
    } catch (err) {
      // noop
    }

    expect(MockScopeSupported.isSupportedScopeString).toHaveBeenCalledWith(
      'eip155:5',
      {
        isEvmChainIdSupported: expect.any(Function),
        isNonEvmScopeSupported: expect.any(Function),
      }
    );
    expect(MockScopeSupported.isSupportedScopeString).toHaveBeenCalledWith(
      'bip122:12a765e31ffd4059bada1e25190f6e98',
      {
        isEvmChainIdSupported: expect.any(Function),
        isNonEvmScopeSupported: expect.any(Function),
      }
    );

    MockScopeSupported.isSupportedScopeString.mock.calls[1][1].isEvmChainIdSupported('0x5');
    expect(findNetworkClientIdByChainId).toHaveBeenCalledWith('0x5');
  });

  it('does not throw if unable to find a network client for the evm chainId', () => {
    findNetworkClientIdByChainId.mockImplementation(() => {
      throw new Error('unable to find network client');
    });
    try {
      validator({
        type: Caip25CaveatType,
        value: {
          requiredScopes: {
            'eip155:1': {
              accounts: [],
            },
          },
          optionalScopes: {
            'eip155:5': {
              accounts: [],
            },
          },
          isMultichainOrigin: true,
        },
      });
    } catch (err) {
      // noop
    }

    expect(
      MockScopeSupported.isSupportedScopeString.mock.calls[0][1].isEvmChainIdSupported('0x1'),
    ).toBe(false);
    expect(findNetworkClientIdByChainId).toHaveBeenCalledWith('0x1');
  });

  it('throws if not all scopeStrings are supported', () => {
    expect(() => {
      validator({
        type: Caip25CaveatType,
        value: {
          requiredScopes: {
            'eip155:1': {
              accounts: [],
            },
            'bip122:000000000019d6689c085ae165831e93': {
              accounts: []
            },
          },
          optionalScopes: {
            'eip155:5': {
              accounts: [],
            },
            'bip122:12a765e31ffd4059bada1e25190f6e98': {
              accounts: [],
            },
          },
          isMultichainOrigin: true,
        },
      });
    }).toThrow(
      new Error(
        `${Caip25EndowmentPermissionName} error: Received scopeString value(s) for caveat of type "${Caip25CaveatType}" that are not supported by the wallet.`,
      ),
    );
  });

  it('asserts the required accounts are supported', () => {
    MockScopeSupported.isSupportedScopeString.mockReturnValue(true)
    MockScopeSupported.isSupportedAccount.mockReturnValue(true)

    try {
      validator({
        type: Caip25CaveatType,
        value: {
          requiredScopes: {
            'eip155:1': {
              accounts: ['eip155:1:0xdead'],
            },
            'bip122:000000000019d6689c085ae165831e93': {
              accounts: ['bip122:000000000019d6689c085ae165831e93:123'],
            },
          },
          optionalScopes: {
            'eip155:5': {
              accounts: ['eip155:5:0xbeef'],
            },
            'bip122:12a765e31ffd4059bada1e25190f6e98': {
              accounts: ['bip122:12a765e31ffd4059bada1e25190f6e98:456'],
            },
          },
          isMultichainOrigin: true,
        },
      });
    } catch (err) {
      // noop
    }
    expect(MockScopeSupported.isSupportedAccount).toHaveBeenCalledWith(
      'eip155:1:0xdead',
      {
        getEvmInternalAccounts: expect.any(Function),
        getNonEvmAccountAddresses: expect.any(Function),
      }
    );
    expect(MockScopeSupported.isSupportedAccount).toHaveBeenCalledWith(
      'bip122:000000000019d6689c085ae165831e93:123',
      {
        getEvmInternalAccounts: expect.any(Function),
        getNonEvmAccountAddresses: expect.any(Function),
      }
    );
  });

  it('asserts the optional accounts are supported', () => {
    MockScopeSupported.isSupportedScopeString.mockReturnValue(true)
    MockScopeSupported.isSupportedAccount.mockReturnValue(true)

    try {
      validator({
        type: Caip25CaveatType,
        value: {
          requiredScopes: {
            'eip155:1': {
              accounts: ['eip155:1:0xdead'],
            },
            'bip122:000000000019d6689c085ae165831e93': {
              accounts: ['bip122:000000000019d6689c085ae165831e93:123'],
            },
          },
          optionalScopes: {
            'eip155:5': {
              accounts: ['eip155:5:0xbeef'],
            },
            'bip122:12a765e31ffd4059bada1e25190f6e98': {
              accounts: ['bip122:12a765e31ffd4059bada1e25190f6e98:456'],
            },
          },
          isMultichainOrigin: true,
        },
      });
    } catch (err) {
      // noop
    }
    expect(MockScopeSupported.isSupportedAccount).toHaveBeenCalledWith(
      'eip155:5:0xbeef',
      {
        getEvmInternalAccounts: expect.any(Function),
        getNonEvmAccountAddresses: expect.any(Function),
      }
    );
    expect(MockScopeSupported.isSupportedAccount).toHaveBeenCalledWith(
      'bip122:000000000019d6689c085ae165831e93:123',
      {
        getEvmInternalAccounts: expect.any(Function),
        getNonEvmAccountAddresses: expect.any(Function),
      }
    );
  });

  it('throws if the accounts specified in the internal scopeObjects are not supported', () => {
    MockScopeSupported.isSupportedScopeString.mockReturnValue(true);

    expect(() => {
      validator({
        type: Caip25CaveatType,
        value: {
          requiredScopes: {
            'eip155:1': {
              accounts: ['eip155:1:0xdead'],
            },
          },
          optionalScopes: {
            'eip155:5': {
              accounts: ['eip155:5:0xbeef'],
            },
          },
          isMultichainOrigin: true,
        },
      });
    }).toThrow(
      new Error(
        `${Caip25EndowmentPermissionName} error: Received account value(s) for caveat of type "${Caip25CaveatType}" that are not supported by the wallet.`,
      ),
    );
  });

  it('does not throw if the CAIP-25 caveat value is valid', () => {
    MockScopeSupported.isSupportedScopeString.mockReturnValue(true);
    MockScopeSupported.isSupportedAccount.mockReturnValue(true);

    expect(
      validator({
        type: Caip25CaveatType,
        value: {
          requiredScopes: {
            'eip155:1': {
              accounts: ['eip155:1:0xdead'],
            },
            'bip122:000000000019d6689c085ae165831e93': {
              accounts: ['bip122:000000000019d6689c085ae165831e93:123'],
            },
          },
          optionalScopes: {
            'eip155:5': {
              accounts: ['eip155:5:0xbeef'],
            },
            'bip122:12a765e31ffd4059bada1e25190f6e98': {
              accounts: ['bip122:12a765e31ffd4059bada1e25190f6e98:456'],
            },
          },
          isMultichainOrigin: true,
        },
      }),
    ).toBeUndefined();
  });
});
