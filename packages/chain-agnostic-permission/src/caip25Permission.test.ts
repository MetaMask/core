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
  diffScopesForCaip25CaveatValue,
  generateCaip25Caveat,
  getCaip25CaveatFromPermission,
} from './caip25Permission';
import { KnownSessionProperties } from './scope/constants';
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
          sessionProperties: {},
          isMultichainOrigin: true,
        }),
      ).toStrictEqual({
        type: Caip25CaveatType,
        value: {
          requiredScopes: {},
          optionalScopes: {},
          sessionProperties: {},
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
          sessionProperties: {},
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
                accounts: [],
              },
              'wallet:eip155': {
                accounts: ['wallet:eip155:0x2'],
              },
            },
            sessionProperties: {},
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
          sessionProperties: {},
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
          sessionProperties: {},
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
  const isNonEvmScopeSupported = jest.fn();
  const getNonEvmAccountAddresses = jest.fn();
  const { validator, merger } = caip25CaveatBuilder({
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
          sessionProperties: {},
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
          sessionProperties: {},
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
          sessionProperties: {},
          isMultichainOrigin: 'NotABoolean',
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
          isMultichainOrigin: true,
        },
      });
    }).toThrow(
      new Error(
        `${Caip25EndowmentPermissionName} error: Received invalid value for caveat of type "${Caip25CaveatType}".`,
      ),
    );
  });

  it('throws an error if there are unknown session properties', () => {
    expect(() => {
      validator({
        type: Caip25CaveatType,
        value: {
          requiredScopes: {},
          optionalScopes: {},
          sessionProperties: {
            unknownProperty: 'unknownValue',
          },
          isMultichainOrigin: true,
        },
      });
    }).toThrow(
      new Error(
        `${Caip25EndowmentPermissionName} error: Received unknown session property(s) for caveat of type "${Caip25CaveatType}".`,
      ),
    );
  });

  it('asserts the internal required scopeStrings are supported', () => {
    MockScopeSupported.isSupportedScopeString.mockReturnValue(true);

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
          sessionProperties: {},
          isMultichainOrigin: true,
        },
      });
    } catch {
      // noop
    }
    expect(MockScopeSupported.isSupportedScopeString).toHaveBeenCalledWith(
      'eip155:1',
      {
        isEvmChainIdSupported: expect.any(Function),
        isNonEvmScopeSupported: expect.any(Function),
      },
    );
    expect(MockScopeSupported.isSupportedScopeString).toHaveBeenCalledWith(
      'bip122:000000000019d6689c085ae165831e93',
      {
        isEvmChainIdSupported: expect.any(Function),
        isNonEvmScopeSupported: expect.any(Function),
      },
    );

    MockScopeSupported.isSupportedScopeString.mock.calls[0][1].isEvmChainIdSupported(
      '0x1',
    );
    expect(findNetworkClientIdByChainId).toHaveBeenCalledWith('0x1');
  });

  it('asserts the internal optional scopeStrings are supported', () => {
    MockScopeSupported.isSupportedScopeString.mockReturnValue(true);

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
          sessionProperties: {},
          isMultichainOrigin: true,
        },
      });
    } catch {
      // noop
    }

    expect(MockScopeSupported.isSupportedScopeString).toHaveBeenCalledWith(
      'eip155:5',
      {
        isEvmChainIdSupported: expect.any(Function),
        isNonEvmScopeSupported: expect.any(Function),
      },
    );
    expect(MockScopeSupported.isSupportedScopeString).toHaveBeenCalledWith(
      'bip122:12a765e31ffd4059bada1e25190f6e98',
      {
        isEvmChainIdSupported: expect.any(Function),
        isNonEvmScopeSupported: expect.any(Function),
      },
    );

    MockScopeSupported.isSupportedScopeString.mock.calls[1][1].isEvmChainIdSupported(
      '0x5',
    );
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
          sessionProperties: {},
          isMultichainOrigin: true,
        },
      });
    } catch {
      // noop
    }

    expect(
      MockScopeSupported.isSupportedScopeString.mock.calls[0][1].isEvmChainIdSupported(
        '0x1',
      ),
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
          sessionProperties: {},
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
    MockScopeSupported.isSupportedScopeString.mockReturnValue(true);
    MockScopeSupported.isSupportedAccount.mockReturnValue(true);

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
          sessionProperties: {},
          isMultichainOrigin: true,
        },
      });
    } catch {
      // noop
    }
    expect(MockScopeSupported.isSupportedAccount).toHaveBeenCalledWith(
      'eip155:1:0xdead',
      {
        getEvmInternalAccounts: expect.any(Function),
        getNonEvmAccountAddresses: expect.any(Function),
      },
    );
    expect(MockScopeSupported.isSupportedAccount).toHaveBeenCalledWith(
      'bip122:000000000019d6689c085ae165831e93:123',
      {
        getEvmInternalAccounts: expect.any(Function),
        getNonEvmAccountAddresses: expect.any(Function),
      },
    );
  });

  it('asserts the optional accounts are supported', () => {
    MockScopeSupported.isSupportedScopeString.mockReturnValue(true);
    MockScopeSupported.isSupportedAccount.mockReturnValue(true);

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
          sessionProperties: {},
          isMultichainOrigin: true,
        },
      });
    } catch {
      // noop
    }
    expect(MockScopeSupported.isSupportedAccount).toHaveBeenCalledWith(
      'eip155:5:0xbeef',
      {
        getEvmInternalAccounts: expect.any(Function),
        getNonEvmAccountAddresses: expect.any(Function),
      },
    );
    expect(MockScopeSupported.isSupportedAccount).toHaveBeenCalledWith(
      'bip122:000000000019d6689c085ae165831e93:123',
      {
        getEvmInternalAccounts: expect.any(Function),
        getNonEvmAccountAddresses: expect.any(Function),
      },
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
          sessionProperties: {},
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
          sessionProperties: {},
          isMultichainOrigin: true,
        },
      }),
    ).toBeUndefined();
  });

  it('throws an error if both requiredScopes and optionalScopes are empty', () => {
    expect(() => {
      validator({
        type: Caip25CaveatType,
        value: {
          requiredScopes: {},
          optionalScopes: {},
          sessionProperties: {},
          isMultichainOrigin: true,
        },
      });
    }).toThrow(
      new Error(
        `${Caip25EndowmentPermissionName} error: Received no scopes for caveat of type "${Caip25CaveatType}".`,
      ),
    );
  });

  describe('permission merger', () => {
    describe('incremental request an existing scope (requiredScopes), and 2 whole new scopes (optionalScopes) with accounts', () => {
      it('should return merged scope with previously existing chain and accounts, plus new requested chains with new accounts', () => {
        const initLeftValue: Caip25CaveatValue = {
          requiredScopes: {
            'eip155:1': {
              accounts: ['eip155:1:0xdead'],
            },
          },
          optionalScopes: {},
          sessionProperties: {},
          isMultichainOrigin: false,
        };

        const rightValue: Caip25CaveatValue = {
          requiredScopes: {},
          optionalScopes: {
            'eip155:1': {
              accounts: ['eip155:1:0xdead', 'eip155:1:0xbadd'],
            },
            'eip155:10': {
              accounts: ['eip155:10:0xbeef', 'eip155:10:0xbadd'],
            },
            'eip155:426161': {
              accounts: [
                'eip155:426161:0xdead',
                'eip155:426161:0xbeef',
                'eip155:426161:0xbadd',
              ],
            },
          },
          sessionProperties: {},
          isMultichainOrigin: false,
        };

        const expectedMergedValue: Caip25CaveatValue = {
          requiredScopes: {
            'eip155:1': { accounts: ['eip155:1:0xdead'] },
          },
          optionalScopes: {
            'eip155:1': { accounts: ['eip155:1:0xdead', 'eip155:1:0xbadd'] },
            'eip155:10': {
              accounts: ['eip155:10:0xbeef', 'eip155:10:0xbadd'],
            },
            'eip155:426161': {
              accounts: [
                'eip155:426161:0xdead',
                'eip155:426161:0xbeef',
                'eip155:426161:0xbadd',
              ],
            },
          },
          sessionProperties: {},
          isMultichainOrigin: false,
        };
        const expectedDiff: Caip25CaveatValue = {
          requiredScopes: {},
          optionalScopes: {
            'eip155:1': { accounts: ['eip155:1:0xdead', 'eip155:1:0xbadd'] },
            'eip155:10': {
              accounts: ['eip155:10:0xbeef', 'eip155:10:0xbadd'],
            },
            'eip155:426161': {
              accounts: [
                'eip155:426161:0xdead',
                'eip155:426161:0xbeef',
                'eip155:426161:0xbadd',
              ],
            },
          },
          sessionProperties: {},
          isMultichainOrigin: false,
        };
        const [newValue, diff] = merger(initLeftValue, rightValue);

        expect(newValue).toStrictEqual(
          expect.objectContaining(expectedMergedValue),
        );
        expect(diff).toStrictEqual(expect.objectContaining(expectedDiff));
      });
    });
    describe('incremental request an existing scope with session properties', () => {
      it('should return merged scope with previously existing chain and accounts, plus new requested chains with new accounts and merged session properties', () => {
        const initLeftValue: Caip25CaveatValue = {
          requiredScopes: {},
          optionalScopes: {
            'eip155:1': {
              accounts: ['eip155:1:0xdead'],
            },
          },
          sessionProperties: {
            [KnownSessionProperties.SolanaAccountChangedNotifications]: true,
          },
          isMultichainOrigin: true,
        };

        const rightValue: Caip25CaveatValue = {
          requiredScopes: {},
          optionalScopes: {
            'eip155:1': {
              accounts: [
                'eip155:1:0xbadd',
                'eip155:1:0xbeef',
                'eip155:1:0xdead',
              ],
            },
          },
          sessionProperties: {
            [KnownSessionProperties.SolanaAccountChangedNotifications]: false,
            otherProperty: 'otherValue',
          },
          isMultichainOrigin: true,
        };

        const expectedMergedValue: Caip25CaveatValue = {
          requiredScopes: {},
          optionalScopes: {
            'eip155:1': {
              accounts: [
                'eip155:1:0xdead',
                'eip155:1:0xbadd',
                'eip155:1:0xbeef',
              ],
            },
          },
          sessionProperties: {
            [KnownSessionProperties.SolanaAccountChangedNotifications]: false,
            otherProperty: 'otherValue',
          },
          isMultichainOrigin: true,
        };

        const [newValue] = merger(initLeftValue, rightValue);

        expect(newValue).toStrictEqual(
          expect.objectContaining(expectedMergedValue),
        );
      });
    });
  });
});

describe('diffScopesForCaip25CaveatValue', () => {
  describe('incremental request existing optional scope with a new account', () => {
    it('should return scope with existing chain and new requested account', () => {
      const leftValue: Caip25CaveatValue = {
        optionalScopes: {
          'eip155:1': {
            accounts: ['eip155:1:0xdead'],
          },
        },
        requiredScopes: {},
        sessionProperties: {},
        isMultichainOrigin: false,
      };

      const mergedValue: Caip25CaveatValue = {
        optionalScopes: {
          'eip155:1': {
            accounts: ['eip155:1:0xdead', 'eip155:1:0xbeef'],
          },
        },
        requiredScopes: {},
        sessionProperties: {},
        isMultichainOrigin: false,
      };

      const expectedDiff: Caip25CaveatValue = {
        optionalScopes: {
          'eip155:1': {
            accounts: ['eip155:1:0xbeef'],
          },
        },
        isMultichainOrigin: false,
        requiredScopes: {},
        sessionProperties: {},
      };

      const diff = diffScopesForCaip25CaveatValue(
        leftValue,
        mergedValue,
        'optionalScopes',
      );

      expect(diff).toStrictEqual(expectedDiff);
    });
  });

  describe('incremental request a whole new optional scope without accounts', () => {
    it('should return scope with new requested chain and no accounts', () => {
      const leftValue: Caip25CaveatValue = {
        optionalScopes: {
          'eip155:1': {
            accounts: ['eip155:1:0xdead'],
          },
        },
        requiredScopes: {},
        sessionProperties: {},
        isMultichainOrigin: false,
      };

      const mergedValue: Caip25CaveatValue = {
        optionalScopes: {
          'eip155:1': {
            accounts: ['eip155:1:0xdead'],
          },
          'eip155:10': {
            accounts: [],
          },
        },
        requiredScopes: {},
        sessionProperties: {},
        isMultichainOrigin: false,
      };

      const expectedDiff: Caip25CaveatValue = {
        optionalScopes: {
          'eip155:10': {
            accounts: [],
          },
        },
        isMultichainOrigin: false,
        requiredScopes: {},
        sessionProperties: {},
      };

      const diff = diffScopesForCaip25CaveatValue(
        leftValue,
        mergedValue,
        'optionalScopes',
      );

      expect(diff).toStrictEqual(expectedDiff);
    });
  });

  describe('incremental request a whole new optional scope with accounts', () => {
    it('should return scope with new requested chain and new account', () => {
      const leftValue: Caip25CaveatValue = {
        optionalScopes: {
          'eip155:1': {
            accounts: ['eip155:1:0xdead'],
          },
        },
        requiredScopes: {},
        sessionProperties: {},
        isMultichainOrigin: false,
      };

      const mergedValue: Caip25CaveatValue = {
        optionalScopes: {
          'eip155:1': {
            accounts: ['eip155:1:0xdead'],
          },
          'eip155:10': {
            accounts: ['eip155:10:0xbeef'],
          },
        },
        requiredScopes: {},
        sessionProperties: {},
        isMultichainOrigin: false,
      };

      const expectedDiff: Caip25CaveatValue = {
        optionalScopes: {
          'eip155:10': {
            accounts: ['eip155:10:0xbeef'],
          },
        },
        isMultichainOrigin: false,
        requiredScopes: {},
        sessionProperties: {},
      };

      const diff = diffScopesForCaip25CaveatValue(
        leftValue,
        mergedValue,
        'optionalScopes',
      );

      expect(diff).toStrictEqual(expectedDiff);
    });
  });

  describe('incremental request an existing optional scope with new accounts, and whole new optional scope with accounts', () => {
    it('should return scope with previously existing chain and accounts, plus new requested chain with new accounts', () => {
      const leftValue: Caip25CaveatValue = {
        optionalScopes: {
          'eip155:1': {
            accounts: ['eip155:1:0xdead'],
          },
        },
        requiredScopes: {},
        sessionProperties: {},
        isMultichainOrigin: false,
      };

      const mergedValue: Caip25CaveatValue = {
        optionalScopes: {
          'eip155:1': {
            accounts: ['eip155:1:0xdead', 'eip155:1:0xbeef'],
          },
          'eip155:10': {
            accounts: ['eip155:10:0xdead', 'eip155:10:0xbeef'],
          },
        },
        requiredScopes: {},
        sessionProperties: {},
        isMultichainOrigin: false,
      };

      const expectedDiff: Caip25CaveatValue = {
        optionalScopes: {
          'eip155:1': {
            accounts: ['eip155:1:0xbeef'],
          },
          'eip155:10': {
            accounts: ['eip155:10:0xdead', 'eip155:10:0xbeef'],
          },
        },
        isMultichainOrigin: false,
        requiredScopes: {},
        sessionProperties: {},
      };

      const diff = diffScopesForCaip25CaveatValue(
        leftValue,
        mergedValue,
        'optionalScopes',
      );

      expect(diff).toStrictEqual(expectedDiff);
    });
  });

  describe('incremental request existing required scope with a new account', () => {
    it('should return scope with existing chain and new requested account', () => {
      const leftValue: Caip25CaveatValue = {
        requiredScopes: {
          'eip155:1': {
            accounts: ['eip155:1:0xdead'],
          },
        },
        optionalScopes: {},
        sessionProperties: {},
        isMultichainOrigin: false,
      };

      const mergedValue: Caip25CaveatValue = {
        requiredScopes: {
          'eip155:1': {
            accounts: ['eip155:1:0xdead', 'eip155:1:0xbeef'],
          },
        },
        optionalScopes: {},
        sessionProperties: {},
        isMultichainOrigin: false,
      };

      const expectedDiff: Caip25CaveatValue = {
        requiredScopes: {
          'eip155:1': {
            accounts: ['eip155:1:0xbeef'],
          },
        },
        isMultichainOrigin: false,
        optionalScopes: {},
        sessionProperties: {},
      };

      const diff = diffScopesForCaip25CaveatValue(
        leftValue,
        mergedValue,
        'requiredScopes',
      );

      expect(diff).toStrictEqual(expectedDiff);
    });
  });

  describe('incremental request a whole new required scope without accounts', () => {
    it('should return scope with new requested chain and no accounts', () => {
      const leftValue: Caip25CaveatValue = {
        requiredScopes: {
          'eip155:1': {
            accounts: ['eip155:1:0xdead'],
          },
        },
        optionalScopes: {},
        sessionProperties: {},
        isMultichainOrigin: false,
      };

      const mergedValue: Caip25CaveatValue = {
        requiredScopes: {
          'eip155:1': {
            accounts: ['eip155:1:0xdead'],
          },
          'eip155:10': {
            accounts: [],
          },
        },
        optionalScopes: {},
        sessionProperties: {},
        isMultichainOrigin: false,
      };

      const expectedDiff: Caip25CaveatValue = {
        requiredScopes: {
          'eip155:10': {
            accounts: [],
          },
        },
        isMultichainOrigin: false,
        optionalScopes: {},
        sessionProperties: {},
      };

      const diff = diffScopesForCaip25CaveatValue(
        leftValue,
        mergedValue,
        'requiredScopes',
      );

      expect(diff).toStrictEqual(expectedDiff);
    });
  });

  describe('incremental request a whole new required scope with accounts', () => {
    it('should return scope with new requested chain and new account', () => {
      const leftValue: Caip25CaveatValue = {
        requiredScopes: {
          'eip155:1': {
            accounts: ['eip155:1:0xdead'],
          },
        },
        optionalScopes: {},
        sessionProperties: {},
        isMultichainOrigin: false,
      };

      const mergedValue: Caip25CaveatValue = {
        requiredScopes: {
          'eip155:1': {
            accounts: ['eip155:1:0xdead'],
          },
          'eip155:10': {
            accounts: ['eip155:10:0xbeef'],
          },
        },
        optionalScopes: {},
        sessionProperties: {},
        isMultichainOrigin: false,
      };

      const expectedDiff: Caip25CaveatValue = {
        requiredScopes: {
          'eip155:10': {
            accounts: ['eip155:10:0xbeef'],
          },
        },
        isMultichainOrigin: false,
        optionalScopes: {},
        sessionProperties: {},
      };

      const diff = diffScopesForCaip25CaveatValue(
        leftValue,
        mergedValue,
        'requiredScopes',
      );

      expect(diff).toStrictEqual(expectedDiff);
    });
  });

  describe('incremental request an existing required scope with new accounts, and whole new required scope with accounts', () => {
    it('should return scope with previously existing chain and accounts, plus new requested chain with new accounts', () => {
      const leftValue: Caip25CaveatValue = {
        requiredScopes: {
          'eip155:1': {
            accounts: ['eip155:1:0xdead'],
          },
        },
        optionalScopes: {},
        sessionProperties: {},
        isMultichainOrigin: false,
      };

      const mergedValue: Caip25CaveatValue = {
        requiredScopes: {
          'eip155:1': {
            accounts: ['eip155:1:0xdead', 'eip155:1:0xbeef'],
          },
          'eip155:10': {
            accounts: ['eip155:10:0xdead', 'eip155:10:0xbeef'],
          },
        },
        optionalScopes: {},
        sessionProperties: {},
        isMultichainOrigin: false,
      };

      const expectedDiff: Caip25CaveatValue = {
        requiredScopes: {
          'eip155:1': {
            accounts: ['eip155:1:0xbeef'],
          },
          'eip155:10': {
            accounts: ['eip155:10:0xdead', 'eip155:10:0xbeef'],
          },
        },
        isMultichainOrigin: false,
        optionalScopes: {},
        sessionProperties: {},
      };

      const diff = diffScopesForCaip25CaveatValue(
        leftValue,
        mergedValue,
        'requiredScopes',
      );

      expect(diff).toStrictEqual(expectedDiff);
    });
  });
});

describe('generateCaip25Caveat', () => {
  it('should generate a CAIP-25 caveat', () => {
    const caveat = generateCaip25Caveat(
      {
        requiredScopes: { 'eip155:1': { accounts: ['eip155:1:0xdead'] } },
        optionalScopes: {},
        sessionProperties: {},
        isMultichainOrigin: false,
      },
      ['eip155:1:0xdead'],
      ['eip155:1'],
    );

    expect(caveat).toStrictEqual({
      [Caip25EndowmentPermissionName]: {
        caveats: [
          {
            type: Caip25CaveatType,
            value: {
              requiredScopes: { 'eip155:1': { accounts: ['eip155:1:0xdead'] } },
              optionalScopes: {},
              sessionProperties: {},
              isMultichainOrigin: false,
            },
          },
        ],
      },
    });
  });

  it('should handle multiple accounts across different chains', () => {
    const caveat = generateCaip25Caveat(
      {
        requiredScopes: {
          'eip155:1': { accounts: ['eip155:1:0xdead'] },
          'eip155:5': { accounts: ['eip155:5:0xbeef'] },
        },
        optionalScopes: {
          'eip155:10': { accounts: ['eip155:10:0xabc'] },
        },
        sessionProperties: {},
        isMultichainOrigin: false,
      },
      ['eip155:1:0x123', 'eip155:5:0x456', 'eip155:10:0x789'],
      ['eip155:1', 'eip155:5', 'eip155:10'],
    );

    expect(caveat).toStrictEqual({
      [Caip25EndowmentPermissionName]: {
        caveats: [
          {
            type: Caip25CaveatType,
            value: {
              requiredScopes: {
                'eip155:1': {
                  accounts: [
                    'eip155:1:0x123',
                    'eip155:1:0x456',
                    'eip155:1:0x789',
                  ],
                },
                'eip155:5': {
                  accounts: [
                    'eip155:5:0x123',
                    'eip155:5:0x456',
                    'eip155:5:0x789',
                  ],
                },
              },
              optionalScopes: {
                'eip155:10': {
                  accounts: [
                    'eip155:10:0x123',
                    'eip155:10:0x456',
                    'eip155:10:0x789',
                  ],
                },
              },
              sessionProperties: {},
              isMultichainOrigin: false,
            },
          },
        ],
      },
    });
  });

  it('should handle empty accounts list', () => {
    const caveat = generateCaip25Caveat(
      {
        requiredScopes: { 'eip155:1': { accounts: ['eip155:1:0xdead'] } },
        optionalScopes: { 'eip155:5': { accounts: ['eip155:5:0xbeef'] } },
        sessionProperties: {},
        isMultichainOrigin: false,
      },
      [],
      ['eip155:1', 'eip155:5'],
    );

    expect(caveat).toStrictEqual({
      [Caip25EndowmentPermissionName]: {
        caveats: [
          {
            type: Caip25CaveatType,
            value: {
              requiredScopes: { 'eip155:1': { accounts: [] } },
              optionalScopes: { 'eip155:5': { accounts: [] } },
              sessionProperties: {},
              isMultichainOrigin: false,
            },
          },
        ],
      },
    });
  });

  it('should handle wallet scopes correctly', () => {
    const caveat = generateCaip25Caveat(
      {
        requiredScopes: {},
        optionalScopes: {
          'wallet:eip155': { accounts: ['wallet:eip155:0xdead'] },
          wallet: { accounts: [] },
        },
        sessionProperties: {},
        isMultichainOrigin: true,
      },
      ['wallet:eip155:0x123'],
      ['eip155:1', 'eip155:5'],
    );

    expect(caveat).toStrictEqual({
      [Caip25EndowmentPermissionName]: {
        caveats: [
          {
            type: Caip25CaveatType,
            value: {
              requiredScopes: {},
              optionalScopes: {
                'wallet:eip155': { accounts: ['wallet:eip155:0x123'] },
                wallet: { accounts: [] },
                'eip155:1': { accounts: [] },
                'eip155:5': { accounts: [] },
              },
              sessionProperties: {},
              isMultichainOrigin: true,
            },
          },
        ],
      },
    });
  });

  it('should preserve session properties', () => {
    const sessionProperties = {
      [KnownSessionProperties.SolanaAccountChangedNotifications]: true,
    };

    const caveat = generateCaip25Caveat(
      {
        requiredScopes: { 'eip155:1': { accounts: ['eip155:1:0xdead'] } },
        optionalScopes: {},
        sessionProperties,
        isMultichainOrigin: true,
      },
      ['eip155:1:0x123'],
      ['eip155:1'],
    );

    expect(caveat).toStrictEqual({
      [Caip25EndowmentPermissionName]: {
        caveats: [
          {
            type: Caip25CaveatType,
            value: {
              requiredScopes: { 'eip155:1': { accounts: ['eip155:1:0x123'] } },
              optionalScopes: {},
              sessionProperties,
              isMultichainOrigin: true,
            },
          },
        ],
      },
    });
  });

  it('should handle non-EVM chains correctly', () => {
    const caveat = generateCaip25Caveat(
      {
        requiredScopes: {
          'eip155:1': { accounts: ['eip155:1:0xdead'] },
          'solana:4sGjMW1sUnHzSxGspuhpqLDx6wiyjNtZ': {
            accounts: ['solana:4sGjMW1sUnHzSxGspuhpqLDx6wiyjNtZ:oldPubkey'],
          },
        },
        optionalScopes: {},
        sessionProperties: {},
        isMultichainOrigin: true,
      },
      ['eip155:1:0x123', 'solana:4sGjMW1sUnHzSxGspuhpqLDx6wiyjNtZ:newPubkey'],
      ['eip155:1', 'solana:4sGjMW1sUnHzSxGspuhpqLDx6wiyjNtZ'],
    );

    expect(caveat).toStrictEqual({
      [Caip25EndowmentPermissionName]: {
        caveats: [
          {
            type: Caip25CaveatType,
            value: {
              requiredScopes: {
                'eip155:1': { accounts: ['eip155:1:0x123'] },
                'solana:4sGjMW1sUnHzSxGspuhpqLDx6wiyjNtZ': {
                  accounts: [
                    'solana:4sGjMW1sUnHzSxGspuhpqLDx6wiyjNtZ:newPubkey',
                  ],
                },
              },
              optionalScopes: {},
              sessionProperties: {},
              isMultichainOrigin: true,
            },
          },
        ],
      },
    });
  });

  it('should add new chains to optionalScopes when they are not in requiredScopes', () => {
    const caveat = generateCaip25Caveat(
      {
        requiredScopes: { 'eip155:1': { accounts: ['eip155:1:0xdead'] } },
        optionalScopes: {},
        sessionProperties: {},
        isMultichainOrigin: false,
      },
      ['eip155:1:0x123', 'eip155:5:0x456'],
      ['eip155:1', 'eip155:5', 'eip155:10'],
    );

    expect(caveat).toStrictEqual({
      [Caip25EndowmentPermissionName]: {
        caveats: [
          {
            type: Caip25CaveatType,
            value: {
              requiredScopes: {
                'eip155:1': { accounts: ['eip155:1:0x123', 'eip155:1:0x456'] },
              },
              optionalScopes: {
                'eip155:5': { accounts: ['eip155:5:0x123', 'eip155:5:0x456'] },
                'eip155:10': {
                  accounts: ['eip155:10:0x123', 'eip155:10:0x456'],
                },
              },
              sessionProperties: {},
              isMultichainOrigin: false,
            },
          },
        ],
      },
    });
  });

  describe('getCaip25CaveatFromPermission', () => {
    it('returns the caip 25 caveat when the caveat exists', () => {
      const caveat = {
        type: Caip25CaveatType,
        value: {
          requiredScopes: {},
          optionalScopes: {
            'eip155:1': {
              accounts: [],
            },
          },
          sessionProperties: {},
          isMultichainOrigin: false,
        },
      };
      const result = getCaip25CaveatFromPermission({
        caveats: [
          {
            type: 'other',
            value: 'foo',
          },
          caveat,
        ],
      });

      expect(result).toStrictEqual(caveat);
    });

    it('returns undefined when the caveat does not exist', () => {
      const result = getCaip25CaveatFromPermission({
        caveats: [
          {
            type: 'other',
            value: 'foo',
          },
        ],
      });

      expect(result).toBeUndefined();
    });

    it('returns undefined when the permission is undefined', () => {
      const result = getCaip25CaveatFromPermission();

      expect(result).toBeUndefined();
    });
  });
});
