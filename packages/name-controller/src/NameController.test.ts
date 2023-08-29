import { NameController } from './NameController';
import type { NameProvider } from './types';
import { NameType } from './types';

const NAME_MOCK = 'TestName';
const PROPOSED_NAME_MOCK = 'TestProposedName';
const PROPOSED_NAME_2_MOCK = 'TestProposedName2';
const PROVIDER_ID_MOCK = 'TestProviderId';
const PROVIDER_LABEL_MOCK = 'TestProviderLabel';
const VALUE_MOCK = 'TestValue';
const CHAIN_ID_MOCK = '0x1';
const GET_CHAIN_ID_MOCK = () => CHAIN_ID_MOCK;

const MESSENGER_MOCK = {
  registerActionHandler: jest.fn(),
  publish: jest.fn(),
} as any;

const CONTROLLER_ARGS_MOCK = {
  getChainId: GET_CHAIN_ID_MOCK,
  messenger: MESSENGER_MOCK,
  providers: [],
};

// eslint-disable-next-line jest/prefer-spy-on
console.error = jest.fn();

/**
 * Creates a mock name provider.
 *
 * @param index - Index of the provider used to generate unique values.
 * @returns Mock instance of a name provider.
 */
function createMockProvider(index: number): jest.Mocked<NameProvider> {
  return {
    getMetadata: jest.fn().mockReturnValue({
      providerIds: {
        [NameType.ETHEREUM_ADDRESS]: [PROVIDER_ID_MOCK + String(index)],
      },
      providerLabels: {
        [PROVIDER_ID_MOCK + String(index)]: PROVIDER_LABEL_MOCK,
      },
    }),
    getProposedNames: jest.fn().mockResolvedValue({
      results: {
        [PROVIDER_ID_MOCK + String(index)]: {
          proposedNames: [
            PROPOSED_NAME_MOCK + String(index),
            `${PROPOSED_NAME_MOCK + String(index)}_2`,
          ],
        },
      },
    }),
  };
}

describe('NameController', () => {
  describe('setName', () => {
    it('creates an entry if new%s', () => {
      const provider1 = createMockProvider(1);

      const controller = new NameController({
        ...CONTROLLER_ARGS_MOCK,
        providers: [provider1],
      });

      controller.setName({
        value: VALUE_MOCK,
        type: NameType.ETHEREUM_ADDRESS,
        name: NAME_MOCK,
        providerId: `${PROVIDER_ID_MOCK}1`,
      });

      expect(controller.state).toStrictEqual({
        names: {
          [NameType.ETHEREUM_ADDRESS]: {
            [VALUE_MOCK]: {
              name: NAME_MOCK,
              providerId: `${PROVIDER_ID_MOCK}1`,
              proposedNames: {},
            },
          },
        },
      });
    });

    it('updates an entry if existing', () => {
      const provider1 = createMockProvider(1);

      const controller = new NameController({
        ...CONTROLLER_ARGS_MOCK,
        providers: [provider1],
      });

      controller.state.names = {
        [NameType.ETHEREUM_ADDRESS]: {
          [VALUE_MOCK]: {
            name: null,
            providerId: null,
            proposedNames: {
              [PROVIDER_ID_MOCK]: [PROPOSED_NAME_MOCK, PROPOSED_NAME_2_MOCK],
            },
          },
        },
      };

      controller.setName({
        value: VALUE_MOCK,
        type: NameType.ETHEREUM_ADDRESS,
        name: NAME_MOCK,
        providerId: `${PROVIDER_ID_MOCK}1`,
      });

      expect(controller.state).toStrictEqual({
        names: {
          [NameType.ETHEREUM_ADDRESS]: {
            [VALUE_MOCK]: {
              name: NAME_MOCK,
              providerId: `${PROVIDER_ID_MOCK}1`,
              proposedNames: {
                [PROVIDER_ID_MOCK]: [PROPOSED_NAME_MOCK, PROPOSED_NAME_2_MOCK],
              },
            },
          },
        },
      });
    });

    it('removes provider ID from entry if not in request', () => {
      const controller = new NameController(CONTROLLER_ARGS_MOCK);

      controller.state.names = {
        [NameType.ETHEREUM_ADDRESS]: {
          [VALUE_MOCK]: {
            name: null,
            providerId: PROVIDER_ID_MOCK,
            proposedNames: {
              [PROVIDER_ID_MOCK]: [PROPOSED_NAME_MOCK, PROPOSED_NAME_2_MOCK],
            },
          },
        },
      };

      controller.setName({
        value: VALUE_MOCK,
        type: NameType.ETHEREUM_ADDRESS,
        name: NAME_MOCK,
      });

      expect(controller.state).toStrictEqual({
        names: {
          [NameType.ETHEREUM_ADDRESS]: {
            [VALUE_MOCK]: {
              name: NAME_MOCK,
              providerId: null,
              proposedNames: {
                [PROVIDER_ID_MOCK]: [PROPOSED_NAME_MOCK, PROPOSED_NAME_2_MOCK],
              },
            },
          },
        },
      });
    });

    describe('throws if', () => {
      it.each([
        ['missing', undefined],
        ['empty', ''],
        ['not a string', 12],
      ])('value is %s', (_, value) => {
        const controller = new NameController(CONTROLLER_ARGS_MOCK);

        expect(() =>
          controller.setName({
            value,
            type: NameType.ETHEREUM_ADDRESS,
            name: NAME_MOCK,
          } as any),
        ).toThrow('Must specify a non-empty string for value.');
      });

      it.each([
        ['missing', undefined],
        ['empty', ''],
        ['not a match', 'test'],
        ['not a string', 12],
      ])('type is %s', async (_, type) => {
        const controller = new NameController(CONTROLLER_ARGS_MOCK);

        expect(() =>
          controller.setName({
            value: VALUE_MOCK,
            type,
            name: NAME_MOCK,
          } as any),
        ).toThrow(
          `Must specify one of the following types: ${Object.values(
            NameType,
          ).join(', ')}`,
        );
      });

      it.each([
        ['missing', undefined],
        ['empty', ''],
        ['not a string', 12],
      ])('name is %s', (_, name) => {
        const controller = new NameController(CONTROLLER_ARGS_MOCK);

        expect(() =>
          controller.setName({
            value: VALUE_MOCK,
            type: NameType.ETHEREUM_ADDRESS,
            name,
          } as any),
        ).toThrow('Must specify a non-empty string for name.');
      });

      it.each([
        ['empty', ''],
        ['not a string', 12],
      ])('provider ID is %s', (_, providerId) => {
        const controller = new NameController(CONTROLLER_ARGS_MOCK);

        expect(() =>
          controller.setName({
            value: VALUE_MOCK,
            type: NameType.ETHEREUM_ADDRESS,
            name: NAME_MOCK,
            providerId,
          } as any),
        ).toThrow('Must specify a non-empty string for providerId.');
      });

      it('provider ID is unrecognised for type', () => {
        const controller = new NameController(CONTROLLER_ARGS_MOCK);

        expect(() =>
          controller.setName({
            value: VALUE_MOCK,
            type: NameType.ETHEREUM_ADDRESS,
            name: NAME_MOCK,
            providerId: PROVIDER_ID_MOCK,
          } as any),
        ).toThrow(
          `Unknown provider ID for type '${NameType.ETHEREUM_ADDRESS}': ${PROVIDER_ID_MOCK}`,
        );
      });
    });
  });

  describe('updatedProposedNames', () => {
    it.each([
      ['', (controller: NameController) => controller.state.names],
      [' and no existing type state', () => ({})],
    ])(
      'creates entry with proposed names if value is new%s',
      async (_, getExistingState) => {
        const provider1 = createMockProvider(1);
        const provider2 = createMockProvider(2);

        const controller = new NameController({
          ...CONTROLLER_ARGS_MOCK,
          providers: [provider1, provider2],
        });

        controller.state.names = getExistingState(controller) as any;

        const result = await controller.updateProposedNames({
          value: VALUE_MOCK,
          type: NameType.ETHEREUM_ADDRESS,
        });

        expect(controller.state).toStrictEqual({
          names: {
            [NameType.ETHEREUM_ADDRESS]: {
              [VALUE_MOCK]: {
                name: null,
                providerId: null,
                proposedNames: {
                  [`${PROVIDER_ID_MOCK}1`]: [
                    `${PROPOSED_NAME_MOCK}1`,
                    `${PROPOSED_NAME_MOCK}1_2`,
                  ],
                  [`${PROVIDER_ID_MOCK}2`]: [
                    `${PROPOSED_NAME_MOCK}2`,
                    `${PROPOSED_NAME_MOCK}2_2`,
                  ],
                },
              },
            },
          },
        });

        expect(result).toStrictEqual({
          results: {
            [`${PROVIDER_ID_MOCK}1`]: {
              proposedNames: [
                `${PROPOSED_NAME_MOCK}1`,
                `${PROPOSED_NAME_MOCK}1_2`,
              ],
              error: undefined,
            },
            [`${PROVIDER_ID_MOCK}2`]: {
              proposedNames: [
                `${PROPOSED_NAME_MOCK}2`,
                `${PROPOSED_NAME_MOCK}2_2`,
              ],
              error: undefined,
            },
          },
        });
      },
    );

    it('updates entry with proposed names if value exists', async () => {
      const provider1 = createMockProvider(1);
      const provider2 = createMockProvider(2);

      const controller = new NameController({
        ...CONTROLLER_ARGS_MOCK,
        providers: [provider1, provider2],
      });

      controller.state.names = {
        [NameType.ETHEREUM_ADDRESS]: {
          [VALUE_MOCK]: {
            name: null,
            providerId: null,
            proposedNames: {
              [`${PROVIDER_ID_MOCK}1`]: ['ShouldBeDeleted1'],
              [`${PROVIDER_ID_MOCK}2`]: ['ShouldBeDeleted2'],
              [`${PROVIDER_ID_MOCK}3`]: ['ShouldNotBeDeleted3'],
            },
          },
        },
      };

      const result = await controller.updateProposedNames({
        value: VALUE_MOCK,
        type: NameType.ETHEREUM_ADDRESS,
      });

      expect(controller.state).toStrictEqual({
        names: {
          [NameType.ETHEREUM_ADDRESS]: {
            [VALUE_MOCK]: {
              name: null,
              providerId: null,
              proposedNames: {
                [`${PROVIDER_ID_MOCK}1`]: [
                  `${PROPOSED_NAME_MOCK}1`,
                  `${PROPOSED_NAME_MOCK}1_2`,
                ],
                [`${PROVIDER_ID_MOCK}2`]: [
                  `${PROPOSED_NAME_MOCK}2`,
                  `${PROPOSED_NAME_MOCK}2_2`,
                ],
                [`${PROVIDER_ID_MOCK}3`]: ['ShouldNotBeDeleted3'],
              },
            },
          },
        },
      });

      expect(result).toStrictEqual({
        results: {
          [`${PROVIDER_ID_MOCK}1`]: {
            proposedNames: [
              `${PROPOSED_NAME_MOCK}1`,
              `${PROPOSED_NAME_MOCK}1_2`,
            ],
            error: undefined,
          },
          [`${PROVIDER_ID_MOCK}2`]: {
            proposedNames: [
              `${PROPOSED_NAME_MOCK}2`,
              `${PROPOSED_NAME_MOCK}2_2`,
            ],
            error: undefined,
          },
        },
      });
    });

    describe('with error', () => {
      it('ignores response if unhandled error while getting proposed name using provider', async () => {
        const provider1 = createMockProvider(1);
        const provider2 = createMockProvider(2);
        const error = new Error('TestError');

        provider1.getProposedNames.mockRejectedValue(error);

        const controller = new NameController({
          ...CONTROLLER_ARGS_MOCK,
          providers: [provider1, provider2],
        });

        const result = await controller.updateProposedNames({
          value: VALUE_MOCK,
          type: NameType.ETHEREUM_ADDRESS,
        });

        expect(controller.state).toStrictEqual({
          names: {
            [NameType.ETHEREUM_ADDRESS]: {
              [VALUE_MOCK]: {
                name: null,
                providerId: null,
                proposedNames: {
                  [`${PROVIDER_ID_MOCK}2`]: [
                    `${PROPOSED_NAME_MOCK}2`,
                    `${PROPOSED_NAME_MOCK}2_2`,
                  ],
                },
              },
            },
          },
        });

        expect(result).toStrictEqual({
          results: {
            [`${PROVIDER_ID_MOCK}2`]: {
              proposedNames: [
                `${PROPOSED_NAME_MOCK}2`,
                `${PROPOSED_NAME_MOCK}2_2`,
              ],
              error: undefined,
            },
          },
        });
      });

      it('ignores response if response error while getting proposed name using provider', async () => {
        const provider1 = createMockProvider(1);
        const provider2 = createMockProvider(2);
        const error = new Error('TestError');

        provider1.getProposedNames.mockResolvedValue({
          results: {},
          error,
        });

        const controller = new NameController({
          ...CONTROLLER_ARGS_MOCK,
          providers: [provider1, provider2],
        });

        const result = await controller.updateProposedNames({
          value: VALUE_MOCK,
          type: NameType.ETHEREUM_ADDRESS,
        });

        expect(controller.state).toStrictEqual({
          names: {
            [NameType.ETHEREUM_ADDRESS]: {
              [VALUE_MOCK]: {
                name: null,
                providerId: null,
                proposedNames: {
                  [`${PROVIDER_ID_MOCK}2`]: [
                    `${PROPOSED_NAME_MOCK}2`,
                    `${PROPOSED_NAME_MOCK}2_2`,
                  ],
                },
              },
            },
          },
        });

        expect(result).toStrictEqual({
          results: {
            [`${PROVIDER_ID_MOCK}2`]: {
              proposedNames: [
                `${PROPOSED_NAME_MOCK}2`,
                `${PROPOSED_NAME_MOCK}2_2`,
              ],
              error: undefined,
            },
          },
        });
      });

      it('stores empty array if result error while getting proposed name using provider', async () => {
        const provider1 = createMockProvider(1);
        const provider2 = createMockProvider(2);
        const error = new Error('TestError');

        provider1.getProposedNames.mockResolvedValue({
          results: {
            [`${PROVIDER_ID_MOCK}1`]: {
              error,
            },
          },
        });

        const controller = new NameController({
          ...CONTROLLER_ARGS_MOCK,
          providers: [provider1, provider2],
        });

        const result = await controller.updateProposedNames({
          value: VALUE_MOCK,
          type: NameType.ETHEREUM_ADDRESS,
        });

        expect(controller.state).toStrictEqual({
          names: {
            [NameType.ETHEREUM_ADDRESS]: {
              [VALUE_MOCK]: {
                name: null,
                providerId: null,
                proposedNames: {
                  [`${PROVIDER_ID_MOCK}1`]: [],
                  [`${PROVIDER_ID_MOCK}2`]: [
                    `${PROPOSED_NAME_MOCK}2`,
                    `${PROPOSED_NAME_MOCK}2_2`,
                  ],
                },
              },
            },
          },
        });

        expect(result).toStrictEqual({
          results: {
            [`${PROVIDER_ID_MOCK}1`]: {
              proposedNames: [],
              error,
            },
            [`${PROVIDER_ID_MOCK}2`]: {
              proposedNames: [
                `${PROPOSED_NAME_MOCK}2`,
                `${PROPOSED_NAME_MOCK}2_2`,
              ],
              error: undefined,
            },
          },
        });
      });
    });

    it.each([
      ['undefined', undefined],
      ['empty string', ''],
    ])('skips proposed name if %s', async (_, proposedName) => {
      const provider1 = createMockProvider(1);
      const provider2 = createMockProvider(2);

      provider1.getProposedNames.mockResolvedValue({
        results: {
          [`${PROVIDER_ID_MOCK}1`]: { proposedNames: [proposedName as string] },
        },
      });

      const controller = new NameController({
        ...CONTROLLER_ARGS_MOCK,
        providers: [provider1, provider2],
      });

      const result = await controller.updateProposedNames({
        value: VALUE_MOCK,
        type: NameType.ETHEREUM_ADDRESS,
      });

      expect(controller.state).toStrictEqual({
        names: {
          [NameType.ETHEREUM_ADDRESS]: {
            [VALUE_MOCK]: {
              name: null,
              providerId: null,
              proposedNames: {
                [`${PROVIDER_ID_MOCK}1`]: [],
                [`${PROVIDER_ID_MOCK}2`]: [
                  `${PROPOSED_NAME_MOCK}2`,
                  `${PROPOSED_NAME_MOCK}2_2`,
                ],
              },
            },
          },
        },
      });

      expect(result).toStrictEqual({
        results: {
          [`${PROVIDER_ID_MOCK}1`]: {
            proposedNames: [],
            error: undefined,
          },
          [`${PROVIDER_ID_MOCK}2`]: {
            proposedNames: [
              `${PROPOSED_NAME_MOCK}2`,
              `${PROPOSED_NAME_MOCK}2_2`,
            ],
            error: undefined,
          },
        },
      });
    });

    describe('with provider IDs', () => {
      it('updates entry using matching providers only', async () => {
        const provider1 = createMockProvider(1);
        const provider2 = createMockProvider(2);

        const controller = new NameController({
          ...CONTROLLER_ARGS_MOCK,
          providers: [provider1, provider2],
        });

        controller.state.names = {
          [NameType.ETHEREUM_ADDRESS]: {
            [VALUE_MOCK]: {
              name: null,
              providerId: null,
              proposedNames: {
                [`${PROVIDER_ID_MOCK}1`]: ['ShouldNotBeDeleted1'],
                [`${PROVIDER_ID_MOCK}2`]: ['ShouldBeDeleted2'],
                [`${PROVIDER_ID_MOCK}3`]: ['ShouldNotBeDeleted3'],
              },
            },
          },
        };

        const result = await controller.updateProposedNames({
          value: VALUE_MOCK,
          type: NameType.ETHEREUM_ADDRESS,
          providerIds: [`${PROVIDER_ID_MOCK}2`],
        });

        expect(controller.state).toStrictEqual({
          names: {
            [NameType.ETHEREUM_ADDRESS]: {
              [VALUE_MOCK]: {
                name: null,
                providerId: null,
                proposedNames: {
                  [`${PROVIDER_ID_MOCK}1`]: [`ShouldNotBeDeleted1`],
                  [`${PROVIDER_ID_MOCK}2`]: [
                    `${PROPOSED_NAME_MOCK}2`,
                    `${PROPOSED_NAME_MOCK}2_2`,
                  ],
                  [`${PROVIDER_ID_MOCK}3`]: ['ShouldNotBeDeleted3'],
                },
              },
            },
          },
        });

        expect(result).toStrictEqual({
          results: {
            [`${PROVIDER_ID_MOCK}2`]: {
              proposedNames: [
                `${PROPOSED_NAME_MOCK}2`,
                `${PROPOSED_NAME_MOCK}2_2`,
              ],
              error: undefined,
            },
          },
        });

        expect(provider1.getProposedNames).not.toHaveBeenCalled();
        expect(provider2.getProposedNames).toHaveBeenCalledTimes(1);
        expect(provider2.getProposedNames).toHaveBeenCalledWith({
          chainId: CHAIN_ID_MOCK,
          value: VALUE_MOCK,
          type: NameType.ETHEREUM_ADDRESS,
          providerIds: [`${PROVIDER_ID_MOCK}2`],
        });
      });

      it('passes relevant provider IDs only to provider', async () => {
        const provider1 = createMockProvider(1);
        const provider2 = createMockProvider(2);

        const controller = new NameController({
          ...CONTROLLER_ARGS_MOCK,
          providers: [provider1, provider2],
        });

        await controller.updateProposedNames({
          value: VALUE_MOCK,
          type: NameType.ETHEREUM_ADDRESS,
          providerIds: [`${PROVIDER_ID_MOCK}1`, `${PROVIDER_ID_MOCK}2`],
        });

        expect(provider1.getProposedNames).toHaveBeenCalledTimes(1);
        expect(provider1.getProposedNames).toHaveBeenCalledWith({
          chainId: CHAIN_ID_MOCK,
          value: VALUE_MOCK,
          type: NameType.ETHEREUM_ADDRESS,
          providerIds: [`${PROVIDER_ID_MOCK}1`],
        });

        expect(provider2.getProposedNames).toHaveBeenCalledTimes(1);
        expect(provider2.getProposedNames).toHaveBeenCalledWith({
          chainId: CHAIN_ID_MOCK,
          value: VALUE_MOCK,
          type: NameType.ETHEREUM_ADDRESS,
          providerIds: [`${PROVIDER_ID_MOCK}2`],
        });
      });

      it('ignores unrequested provider IDs in response', async () => {
        const provider1 = createMockProvider(1);

        provider1.getProposedNames.mockResolvedValue({
          results: {
            [`${PROVIDER_ID_MOCK}1`]: {
              proposedNames: [
                `${PROPOSED_NAME_MOCK}1`,
                `${PROPOSED_NAME_MOCK}1_2`,
              ],
            },
            [`${PROVIDER_ID_MOCK}2`]: {
              proposedNames: [
                `${PROPOSED_NAME_MOCK}2`,
                `${PROPOSED_NAME_MOCK}2_2`,
              ],
            },
          },
        });

        const controller = new NameController({
          ...CONTROLLER_ARGS_MOCK,
          providers: [provider1],
        });

        const result = await controller.updateProposedNames({
          value: VALUE_MOCK,
          type: NameType.ETHEREUM_ADDRESS,
          providerIds: [`${PROVIDER_ID_MOCK}1`],
        });

        expect(controller.state).toStrictEqual({
          names: {
            [NameType.ETHEREUM_ADDRESS]: {
              [VALUE_MOCK]: {
                name: null,
                providerId: null,
                proposedNames: {
                  [`${PROVIDER_ID_MOCK}1`]: [
                    `${PROPOSED_NAME_MOCK}1`,
                    `${PROPOSED_NAME_MOCK}1_2`,
                  ],
                },
              },
            },
          },
        });

        expect(result).toStrictEqual({
          results: {
            [`${PROVIDER_ID_MOCK}1`]: {
              proposedNames: [
                `${PROPOSED_NAME_MOCK}1`,
                `${PROPOSED_NAME_MOCK}1_2`,
              ],
              error: undefined,
            },
          },
        });
      });
    });

    describe('throws if', () => {
      it.each([
        ['missing', undefined],
        ['empty', ''],
        ['not a string', 12],
      ])('value is %s', async (_, value) => {
        const provider1 = createMockProvider(1);

        const controller = new NameController({
          ...CONTROLLER_ARGS_MOCK,
          providers: [provider1],
        });

        await expect(
          controller.updateProposedNames({
            value,
            type: NameType.ETHEREUM_ADDRESS,
          } as any),
        ).rejects.toThrow('Must specify a non-empty string for value.');
      });

      it.each([
        ['missing', undefined],
        ['empty', ''],
        ['not a match', 'test'],
        ['not a string', 12],
      ])('type is %s', async (_, type) => {
        const provider1 = createMockProvider(1);

        const controller = new NameController({
          ...CONTROLLER_ARGS_MOCK,
          providers: [provider1],
        });

        await expect(
          controller.updateProposedNames({
            value: VALUE_MOCK,
            type,
          } as any),
        ).rejects.toThrow(
          `Must specify one of the following types: ${Object.values(
            NameType,
          ).join(', ')}`,
        );
      });

      it('throws if missing providers', async () => {
        const provider1 = createMockProvider(1);

        const controller = new NameController({
          ...CONTROLLER_ARGS_MOCK,
          providers: [provider1],
        });

        await expect(
          controller.updateProposedNames({
            value: VALUE_MOCK,
            type: NameType.ETHEREUM_ADDRESS,
            providerIds: [`${PROVIDER_ID_MOCK}2`, `${PROVIDER_ID_MOCK}3`],
          }),
        ).rejects.toThrow(
          `Unknown name provider IDs for type '${NameType.ETHEREUM_ADDRESS}': ${PROVIDER_ID_MOCK}2, ${PROVIDER_ID_MOCK}3`,
        );
      });
    });
  });
});
