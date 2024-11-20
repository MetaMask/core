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
} from './caip25Permission';
import * as ScopeAssert from './scope/assert';
import * as ScopeAuthorization from './scope/authorization';

jest.mock('./scope/authorization', () => ({
  validateAndNormalizeScopes: jest.fn(),
}));
const MockScopeAuthorization = jest.mocked(ScopeAuthorization);

jest.mock('./scope/assert', () => ({
  ...jest.requireActual('./scope/assert'),
  assertScopesSupported: jest.fn(),
}));

const MockScopeAssert = jest.mocked(ScopeAssert);

const { removeAccount, removeScope } = Caip25CaveatMutators[Caip25CaveatType];

describe.skip('caip25EndowmentBuilder', () => {
  beforeEach(() => {
    MockScopeAuthorization.validateAndNormalizeScopes.mockReturnValue({
      normalizedRequiredScopes: {},
      normalizedOptionalScopes: {},
    });
  });

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
      it('returns a version of the caveat with the given scope removed from requiredScopes if it is present', () => {
        const ethereumGoerliCaveat = {
          requiredScopes: {
            'eip155:1': {
              methods: ['eth_call'],
              notifications: ['chainChanged'],
              accounts: [],
            },
          },
          optionalScopes: {
            'eip155:5': {
              methods: ['eth_call'],
              notifications: ['accountsChanged'],
              accounts: [],
            },
          },
          sessionProperties: {},
          isMultichainOrigin: true,
        };
        const result = removeScope(ethereumGoerliCaveat, 'eip155:1');
        expect(result).toStrictEqual({
          operation: CaveatMutatorOperation.UpdateValue,
          value: {
            requiredScopes: {},
            optionalScopes: {
              'eip155:5': {
                methods: ['eth_call'],
                notifications: ['accountsChanged'],
                accounts: [],
              },
            },
          },
        });
      });

      it('returns a version of the caveat with the given scope removed from optionalScopes if it is present', () => {
        const ethereumGoerliCaveat = {
          requiredScopes: {
            'eip155:1': {
              methods: ['eth_call'],
              notifications: ['chainChanged'],
              accounts: [],
            },
          },
          optionalScopes: {
            'eip155:5': {
              methods: ['eth_call'],
              notifications: ['accountsChanged'],
              accounts: [],
            },
          },
          sessionProperties: {},
          isMultichainOrigin: true,
        };
        const result = removeScope(ethereumGoerliCaveat, 'eip155:5');
        expect(result).toStrictEqual({
          operation: CaveatMutatorOperation.UpdateValue,
          value: {
            requiredScopes: {
              'eip155:1': {
                methods: ['eth_call'],
                notifications: ['chainChanged'],
                accounts: [],
              },
            },
            optionalScopes: {},
          },
        });
      });

      it('returns a version of the caveat with the given scope removed from requiredScopes and optionalScopes if it is present', () => {
        const ethereumGoerliCaveat = {
          requiredScopes: {
            'eip155:1': {
              methods: ['eth_call'],
              notifications: ['chainChanged'],
              accounts: [],
            },
            'eip155:5': {
              methods: [],
              notifications: ['chainChanged'],
              accounts: [],
            },
          },
          optionalScopes: {
            'eip155:5': {
              methods: ['eth_call'],
              notifications: ['accountsChanged'],
              accounts: [],
            },
          },
          sessionProperties: {},
          isMultichainOrigin: true,
        };
        const result = removeScope(ethereumGoerliCaveat, 'eip155:5');
        expect(result).toStrictEqual({
          operation: CaveatMutatorOperation.UpdateValue,
          value: {
            requiredScopes: {
              'eip155:1': {
                methods: ['eth_call'],
                notifications: ['chainChanged'],
                accounts: [],
              },
            },
            optionalScopes: {},
          },
        });
      });

      it('returns the caveat unchanged when the given scope is not found in either requiredScopes or optionalScopes', () => {
        const ethereumGoerliCaveat = {
          requiredScopes: {
            'eip155:1': {
              methods: ['eth_call'],
              notifications: ['chainChanged'],
              accounts: [],
            },
          },
          optionalScopes: {
            'eip155:5': {
              methods: ['eth_call'],
              notifications: ['accountsChanged'],
              accounts: [],
            },
          },
          sessionProperties: {},
          isMultichainOrigin: true,
        };
        const result = removeScope(ethereumGoerliCaveat, 'eip155:2');
        expect(result).toStrictEqual({
          operation: CaveatMutatorOperation.Noop,
        });
      });
    });

    describe('removeAccount', () => {
      it('returns a version of the caveat with the given account removed from requiredScopes if it is present', () => {
        const ethereumGoerliCaveat: Caip25CaveatValue = {
          requiredScopes: {
            'eip155:1': {
              methods: ['eth_call'],
              notifications: ['chainChanged'],
              accounts: ['eip155:1:0x1', 'eip155:1:0x2'],
            },
          },
          optionalScopes: {},
          isMultichainOrigin: true,
        };
        const result = removeAccount(ethereumGoerliCaveat, '0x1');
        expect(result).toStrictEqual({
          operation: CaveatMutatorOperation.UpdateValue,
          value: {
            requiredScopes: {
              'eip155:1': {
                methods: ['eth_call'],
                notifications: ['chainChanged'],
                accounts: ['eip155:1:0x2'],
              },
            },
            optionalScopes: {},
            isMultichainOrigin: true,
          },
        });
      });

      it('returns a version of the caveat with the given account removed from optionalScopes if it is present', () => {
        const ethereumGoerliCaveat: Caip25CaveatValue = {
          requiredScopes: {},
          optionalScopes: {
            'eip155:1': {
              methods: ['eth_call'],
              notifications: ['chainChanged'],
              accounts: ['eip155:1:0x1', 'eip155:1:0x2'],
            },
          },
          isMultichainOrigin: true,
        };
        const result = removeAccount(ethereumGoerliCaveat, '0x1');
        expect(result).toStrictEqual({
          operation: CaveatMutatorOperation.UpdateValue,
          value: {
            requiredScopes: {},
            optionalScopes: {
              'eip155:1': {
                methods: ['eth_call'],
                notifications: ['chainChanged'],
                accounts: ['eip155:1:0x2'],
              },
            },
            isMultichainOrigin: true,
          },
        });
      });

      it('returns a version of the caveat with the given account removed from requiredScopes and optionalScopes if it is present', () => {
        const ethereumGoerliCaveat: Caip25CaveatValue = {
          requiredScopes: {
            'eip155:1': {
              methods: ['eth_call'],
              notifications: ['chainChanged'],
              accounts: ['eip155:1:0x1', 'eip155:1:0x2'],
            },
            'eip155:2': {
              methods: ['eth_call'],
              notifications: ['chainChanged'],
              accounts: ['eip155:2:0x1', 'eip155:2:0x2'],
            },
          },
          optionalScopes: {
            'eip155:3': {
              methods: ['eth_call'],
              notifications: ['chainChanged'],
              accounts: ['eip155:3:0x1', 'eip155:3:0x2'],
            },
          },
          isMultichainOrigin: true,
        };
        const result = removeAccount(ethereumGoerliCaveat, '0x1');
        expect(result).toStrictEqual({
          operation: CaveatMutatorOperation.UpdateValue,
          value: {
            requiredScopes: {
              'eip155:1': {
                methods: ['eth_call'],
                notifications: ['chainChanged'],
                accounts: ['eip155:1:0x2'],
              },
              'eip155:2': {
                methods: ['eth_call'],
                notifications: ['chainChanged'],
                accounts: ['eip155:2:0x2'],
              },
            },
            optionalScopes: {
              'eip155:3': {
                methods: ['eth_call'],
                notifications: ['chainChanged'],
                accounts: ['eip155:3:0x2'],
              },
            },
            isMultichainOrigin: true,
          },
        });
      });

      it('returns the caveat unchanged when the given account is not found in either requiredScopes or optionalScopes', () => {
        const ethereumGoerliCaveat: Caip25CaveatValue = {
          requiredScopes: {
            'eip155:1': {
              methods: ['eth_call'],
              notifications: ['chainChanged'],
              accounts: ['eip155:1:0x1', 'eip155:1:0x2'],
            },
          },
          optionalScopes: {
            'eip155:5': {
              methods: ['eth_call'],
              notifications: ['accountsChanged'],
              accounts: [],
            },
          },
          isMultichainOrigin: true,
        };
        const result = removeAccount(ethereumGoerliCaveat, '0x3');
        expect(result).toStrictEqual({
          operation: CaveatMutatorOperation.Noop,
        });
      });
    });
  });

  describe('permission validator', () => {
    const findNetworkClientIdByChainId = jest.fn();
    const listAccounts = jest.fn();
    const { validator } = caip25EndowmentBuilder.specificationBuilder({
      methodHooks: {
        findNetworkClientIdByChainId,
        listAccounts,
      },
    });

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

    it('throws an error if the CAIP-25 caveat is malformed', () => {
      expect(() => {
        validator({
          caveats: [
            {
              type: Caip25CaveatType,
              value: {
                missingRequiredScopes: {},
                optionalScopes: {},
                isMultichainOrigin: true,
              },
            },
          ],
          date: 1234,
          id: '1',
          invoker: 'test.com',
          parentCapability: Caip25EndowmentPermissionName,
        });
      }).toThrow(
        new Error(
          `${Caip25EndowmentPermissionName} error: Received invalid value for caveat of type "${Caip25CaveatType}".`,
        ),
      );

      expect(() => {
        validator({
          caveats: [
            {
              type: Caip25CaveatType,
              value: {
                requiredScopes: {},
                missingOptionalScopes: {},
                isMultichainOrigin: true,
              },
            },
          ],
          date: 1234,
          id: '1',
          invoker: 'test.com',
          parentCapability: Caip25EndowmentPermissionName,
        });
      }).toThrow(
        new Error(
          `${Caip25EndowmentPermissionName} error: Received invalid value for caveat of type "${Caip25CaveatType}".`,
        ),
      );

      expect(() => {
        validator({
          caveats: [
            {
              type: Caip25CaveatType,
              value: {
                requiredScopes: {},
                optionalScopes: {},
                isMultichainOrigin: 'NotABoolean',
              },
            },
          ],
          date: 1234,
          id: '1',
          invoker: 'test.com',
          parentCapability: Caip25EndowmentPermissionName,
        });
      }).toThrow(
        new Error(
          `${Caip25EndowmentPermissionName} error: Received invalid value for caveat of type "${Caip25CaveatType}".`,
        ),
      );
    });

    it('validates and normalizes the ScopesObjects', () => {
      try {
        validator({
          caveats: [
            {
              type: Caip25CaveatType,
              value: {
                requiredScopes: {
                  'eip155:1': {
                    methods: ['eth_chainId'],
                    notifications: [],
                    accounts: ['eip155:1:0xdead'],
                  },
                },
                optionalScopes: {
                  'eip155:5': {
                    methods: [],
                    notifications: [],
                    accounts: ['eip155:5:0xbeef'],
                  },
                },
                isMultichainOrigin: true,
              },
            },
          ],
          date: 1234,
          id: '1',
          invoker: 'test.com',
          parentCapability: Caip25EndowmentPermissionName,
        });
      } catch (err) {
        // noop
      }
      expect(
        MockScopeAuthorization.validateAndNormalizeScopes,
      ).toHaveBeenCalledWith(
        {
          'eip155:1': {
            methods: ['eth_chainId'],
            notifications: [],
            accounts: ['eip155:1:0xdead'],
          },
        },
        {
          'eip155:5': {
            methods: [],
            notifications: [],
            accounts: ['eip155:5:0xbeef'],
          },
        },
      );
    });

    it('asserts the validated and normalized required scopes are supported', () => {
      MockScopeAuthorization.validateAndNormalizeScopes.mockReturnValue({
        normalizedRequiredScopes: {
          'eip155:1': {
            methods: ['normalized_required'],
            notifications: [],
            accounts: [],
          },
        },
        normalizedOptionalScopes: {
          'eip155:1': {
            methods: ['normalized_optional'],
            notifications: [],
            accounts: [],
          },
        },
      });
      try {
        validator({
          caveats: [
            {
              type: Caip25CaveatType,
              value: {
                requiredScopes: {
                  'eip155:1': {
                    methods: ['eth_chainId'],
                    notifications: [],
                    accounts: ['eip155:1:0xdead'],
                  },
                },
                optionalScopes: {
                  'eip155:5': {
                    methods: [],
                    notifications: [],
                    accounts: ['eip155:5:0xbeef'],
                  },
                },
                isMultichainOrigin: true,
              },
            },
          ],
          date: 1234,
          id: '1',
          invoker: 'test.com',
          parentCapability: Caip25EndowmentPermissionName,
        });
      } catch (err) {
        // noop
      }
      expect(MockScopeAssert.assertScopesSupported).toHaveBeenCalledWith(
        {
          'eip155:1': {
            methods: ['normalized_required'],
            notifications: [],
            accounts: [],
          },
        },
        expect.objectContaining({
          isChainIdSupported: expect.any(Function),
        }),
      );

      MockScopeAssert.assertScopesSupported.mock.calls[0][1].isChainIdSupported(
        '0x1',
      );
      expect(findNetworkClientIdByChainId).toHaveBeenCalledWith('0x1');
    });

    it('asserts the validated and normalized optional scopes are supported', () => {
      MockScopeAuthorization.validateAndNormalizeScopes.mockReturnValue({
        normalizedRequiredScopes: {
          'eip155:1': {
            methods: ['normalized_required'],
            notifications: [],
            accounts: [],
          },
        },
        normalizedOptionalScopes: {
          'eip155:5': {
            methods: ['normalized_optional'],
            notifications: [],
            accounts: [],
          },
        },
      });
      try {
        validator({
          caveats: [
            {
              type: Caip25CaveatType,
              value: {
                requiredScopes: {
                  'eip155:1': {
                    methods: ['eth_chainId'],
                    notifications: [],
                    accounts: ['eip155:1:0xdead'],
                  },
                },
                optionalScopes: {
                  'eip155:5': {
                    methods: [],
                    notifications: [],
                    accounts: ['eip155:5:0xbeef'],
                  },
                },
                isMultichainOrigin: true,
              },
            },
          ],
          date: 1234,
          id: '1',
          invoker: 'test.com',
          parentCapability: Caip25EndowmentPermissionName,
        });
      } catch (err) {
        // noop
      }
      expect(MockScopeAssert.assertScopesSupported).toHaveBeenCalledWith(
        {
          'eip155:5': {
            methods: ['normalized_optional'],
            notifications: [],
            accounts: [],
          },
        },
        expect.objectContaining({
          isChainIdSupported: expect.any(Function),
        }),
      );
      MockScopeAssert.assertScopesSupported.mock.calls[1][1].isChainIdSupported(
        '0x1',
      );
      expect(findNetworkClientIdByChainId).toHaveBeenCalledWith('0x1');
    });

    it('does not throw if unable to find a network client for the chainId', () => {
      MockScopeAuthorization.validateAndNormalizeScopes.mockReturnValue({
        normalizedRequiredScopes: {
          'eip155:1': {
            methods: ['normalized_required'],
            notifications: [],
            accounts: [],
          },
        },
        normalizedOptionalScopes: {
          'eip155:5': {
            methods: ['normalized_optional'],
            notifications: [],
            accounts: [],
          },
        },
      });
      findNetworkClientIdByChainId.mockImplementation(() => {
        throw new Error('unable to find network client');
      });
      try {
        validator({
          caveats: [
            {
              type: Caip25CaveatType,
              value: {
                requiredScopes: {
                  'eip155:1': {
                    methods: ['eth_chainId'],
                    notifications: [],
                    accounts: ['eip155:1:0xdead'],
                  },
                },
                optionalScopes: {
                  'eip155:5': {
                    methods: [],
                    notifications: [],
                    accounts: ['eip155:5:0xbeef'],
                  },
                },
                isMultichainOrigin: true,
              },
            },
          ],
          date: 1234,
          id: '1',
          invoker: 'test.com',
          parentCapability: Caip25EndowmentPermissionName,
        });
      } catch (err) {
        // noop
      }

      expect(
        MockScopeAssert.assertScopesSupported.mock.calls[0][1].isChainIdSupported(
          '0x1',
        ),
      ).toBe(false);
      expect(findNetworkClientIdByChainId).toHaveBeenCalledWith('0x1');
    });

    it('throws if the eth accounts specified in the normalized scopeObjects are not found in the wallet keyring', () => {
      MockScopeAuthorization.validateAndNormalizeScopes.mockReturnValue({
        normalizedRequiredScopes: {
          'eip155:1': {
            methods: ['eth_chainId'],
            notifications: [],
            accounts: ['eip155:1:0xdead'],
          },
        },
        normalizedOptionalScopes: {
          'eip155:5': {
            methods: [],
            notifications: [],
            accounts: ['eip155:5:0xbeef'],
          },
        },
      });
      listAccounts.mockReturnValue([{ address: '0xdead' }]); // missing '0xbeef'

      expect(() => {
        validator({
          caveats: [
            {
              type: Caip25CaveatType,
              value: {
                requiredScopes: {
                  'eip155:1': {
                    methods: ['eth_chainId'],
                    notifications: [],
                    accounts: ['eip155:1:0xdead'],
                  },
                },
                optionalScopes: {
                  'eip155:5': {
                    methods: [],
                    notifications: [],
                    accounts: ['eip155:5:0xbeef'],
                  },
                },
                isMultichainOrigin: true,
              },
            },
          ],
          date: 1234,
          id: '1',
          invoker: 'test.com',
          parentCapability: Caip25EndowmentPermissionName,
        });
      }).toThrow(
        new Error(
          `${Caip25EndowmentPermissionName} error: Received eip155 account value(s) for caveat of type "${Caip25CaveatType}" that were not found in the wallet keyring.`,
        ),
      );
    });

    it('throws if the input requiredScopes does not match the output of validateAndNormalizeScopes', () => {
      MockScopeAuthorization.validateAndNormalizeScopes.mockReturnValue({
        normalizedRequiredScopes: {},
        normalizedOptionalScopes: {
          'eip155:5': {
            methods: [],
            notifications: [],
            accounts: ['eip155:5:0xbeef'],
          },
        },
      });
      listAccounts.mockReturnValue([{ address: '0xbeef' }]);

      expect(() => {
        validator({
          caveats: [
            {
              type: Caip25CaveatType,
              value: {
                requiredScopes: {
                  'eip155:1': {
                    methods: ['eth_chainId'],
                    notifications: [],
                    accounts: ['eip155:1:0xdead'],
                  },
                },
                optionalScopes: {
                  'eip155:5': {
                    methods: [],
                    notifications: [],
                    accounts: ['eip155:5:0xbeef'],
                  },
                },
                isMultichainOrigin: true,
              },
            },
          ],
          date: 1234,
          id: '1',
          invoker: 'test.com',
          parentCapability: Caip25EndowmentPermissionName,
        });
      }).toThrow(
        new Error(
          `${Caip25EndowmentPermissionName} error: Received non-normalized value for caveat of type "${Caip25CaveatType}".`,
        ),
      );
    });

    it('throws if the input optionalScopes does not match the output of validateAndNormalizeScopes', () => {
      MockScopeAuthorization.validateAndNormalizeScopes.mockReturnValue({
        normalizedRequiredScopes: {
          'eip155:1': {
            methods: ['eth_chainId'],
            notifications: [],
            accounts: ['eip155:1:0xdead'],
          },
        },
        normalizedOptionalScopes: {},
      });
      listAccounts.mockReturnValue([{ address: '0xdead' }]);

      expect(() => {
        validator({
          caveats: [
            {
              type: Caip25CaveatType,
              value: {
                requiredScopes: {
                  'eip155:1': {
                    methods: ['eth_chainId'],
                    notifications: [],
                    accounts: ['eip155:1:0xdead'],
                  },
                },
                optionalScopes: {
                  'eip155:5': {
                    methods: [],
                    notifications: [],
                    accounts: ['eip155:5:0xbeef'],
                  },
                },
                isMultichainOrigin: true,
              },
            },
          ],
          date: 1234,
          id: '1',
          invoker: 'test.com',
          parentCapability: Caip25EndowmentPermissionName,
        });
      }).toThrow(
        new Error(
          `${Caip25EndowmentPermissionName} error: Received non-normalized value for caveat of type "${Caip25CaveatType}".`,
        ),
      );
    });

    it('does not throw if the input requiredScopes and optionalScopes NormalizedScopesObject are already validated and normalized', () => {
      MockScopeAuthorization.validateAndNormalizeScopes.mockReturnValue({
        normalizedRequiredScopes: {
          'eip155:1': {
            methods: ['eth_chainId'],
            notifications: [],
            accounts: ['eip155:1:0xdead'],
          },
        },
        normalizedOptionalScopes: {
          'eip155:5': {
            methods: [],
            notifications: [],
            accounts: ['eip155:5:0xbeef'],
          },
        },
      });
      listAccounts.mockReturnValue([
        { address: '0xdead' },
        { address: '0xbeef' },
      ]);

      expect(
        validator({
          caveats: [
            {
              type: Caip25CaveatType,
              value: {
                requiredScopes: {
                  'eip155:1': {
                    methods: ['eth_chainId'],
                    notifications: [],
                    accounts: ['eip155:1:0xdead'],
                  },
                },
                optionalScopes: {
                  'eip155:5': {
                    methods: [],
                    notifications: [],
                    accounts: ['eip155:5:0xbeef'],
                  },
                },
                isMultichainOrigin: true,
              },
            },
          ],
          date: 1234,
          id: '1',
          invoker: 'test.com',
          parentCapability: Caip25EndowmentPermissionName,
        }),
      ).toBeUndefined();
    });
  });
});
