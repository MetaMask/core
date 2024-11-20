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
import * as ScopeSupported from './scope/supported';

jest.mock('./scope/supported', () => ({
  ...jest.requireActual('./scope/supported'),
  isSupportedScopeString: jest.fn(),
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
      it('returns a version of the caveat with the given scope removed from requiredScopes if it is present', () => {
        const ethereumGoerliCaveat = {
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
        const result = removeScope(ethereumGoerliCaveat, 'eip155:1');
        expect(result).toStrictEqual({
          operation: CaveatMutatorOperation.UpdateValue,
          value: {
            requiredScopes: {},
            optionalScopes: {
              'eip155:5': {
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
        const result = removeScope(ethereumGoerliCaveat, 'eip155:5');
        expect(result).toStrictEqual({
          operation: CaveatMutatorOperation.UpdateValue,
          value: {
            requiredScopes: {
              'eip155:1': {
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
        const result = removeScope(ethereumGoerliCaveat, 'eip155:5');
        expect(result).toStrictEqual({
          operation: CaveatMutatorOperation.UpdateValue,
          value: {
            requiredScopes: {
              'eip155:1': {
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
          isMultichainOrigin: true,
        };
        const result = removeAccount(ethereumGoerliCaveat, '0x1');
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
            isMultichainOrigin: true,
          },
        });
      });

      it('returns the caveat unchanged when the given account is not found in either requiredScopes or optionalScopes', () => {
        const ethereumGoerliCaveat: Caip25CaveatValue = {
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

    it('asserts the internal required scopeStrings are supported', () => {
      try {
        validator({
          caveats: [
            {
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
      expect(MockScopeSupported.isSupportedScopeString).toHaveBeenCalledWith(
        'eip155:1',
        expect.any(Function),
      );

      MockScopeSupported.isSupportedScopeString.mock.calls[0][1]('0x1');
      expect(findNetworkClientIdByChainId).toHaveBeenCalledWith('0x1');
    });

    it('asserts the internal optional scopeStrings are supported', () => {
      try {
        validator({
          caveats: [
            {
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

      expect(MockScopeSupported.isSupportedScopeString).toHaveBeenCalledWith(
        'eip155:5',
        expect.any(Function),
      );

      MockScopeSupported.isSupportedScopeString.mock.calls[1][1]('0x5');
      expect(findNetworkClientIdByChainId).toHaveBeenCalledWith('0x5');
    });

    it('does not throw if unable to find a network client for the chainId', () => {
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
        MockScopeSupported.isSupportedScopeString.mock.calls[0][1]('0x1'),
      ).toBe(false);
      expect(findNetworkClientIdByChainId).toHaveBeenCalledWith('0x1');
    });

    it('throws if the eth accounts specified in the internal scopeObjects are not found in the wallet keyring', () => {
      MockScopeSupported.isSupportedScopeString.mockReturnValue(true);
      listAccounts.mockReturnValue([{ address: '0xdead' }]); // missing '0xbeef'

      expect(() => {
        validator({
          caveats: [
            {
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

    it('does not throw if the CAIP-25 caveat value is valid', () => {
      MockScopeSupported.isSupportedScopeString.mockReturnValue(true);
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
