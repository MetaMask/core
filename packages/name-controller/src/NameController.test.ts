import { NameController } from './NameController';
import type { NameProvider } from './types';
import { NameType } from './types';

const NAME_MOCK = 'TestName';
const PROPOSED_NAME_MOCK = 'TestProposedName';
const PROPOSED_NAME_2_MOCK = 'TestProposedName2';
const SOURCE_ID_MOCK = 'TestSourceId';
const SOURCE_LABEL_MOCK = 'TestSourceLabel';
const VALUE_MOCK = 'TestValue';
const CHAIN_ID_MOCK = '0x1';
const GET_CHAIN_ID_MOCK = () => CHAIN_ID_MOCK;
const TIME_MOCK = 123;

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

// eslint-disable-next-line jest/prefer-spy-on
Date.now = jest.fn().mockReturnValue(TIME_MOCK * 1000);

/**
 * Creates a mock name provider.
 *
 * @param index - Index of the provider used to generate unique values.
 * @param options - Additional options to configure the mock provider.
 * @param options.retryDelay - Optional retry delay to return.
 * @returns Mock instance of a name provider.
 */
function createMockProvider(
  index: number,
  { retryDelay }: { retryDelay?: number } = {},
): jest.Mocked<NameProvider> {
  return {
    getMetadata: jest.fn().mockReturnValue({
      sourceIds: {
        [NameType.ETHEREUM_ADDRESS]: [SOURCE_ID_MOCK + String(index)],
      },
      sourceLabels: {
        [SOURCE_ID_MOCK + String(index)]: SOURCE_LABEL_MOCK + String(index),
      },
    }),
    getProposedNames: jest.fn().mockResolvedValue({
      results: {
        [SOURCE_ID_MOCK + String(index)]: {
          proposedNames: [
            PROPOSED_NAME_MOCK + String(index),
            `${PROPOSED_NAME_MOCK + String(index)}_2`,
          ],
          retryDelay,
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
        sourceId: `${SOURCE_ID_MOCK}1`,
      });

      expect(controller.state.names).toStrictEqual({
        [NameType.ETHEREUM_ADDRESS]: {
          [VALUE_MOCK]: {
            [CHAIN_ID_MOCK]: {
              name: NAME_MOCK,
              sourceId: `${SOURCE_ID_MOCK}1`,
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
            [CHAIN_ID_MOCK]: {
              name: null,
              sourceId: null,
              proposedNames: {
                [SOURCE_ID_MOCK]: {
                  proposedNames: [PROPOSED_NAME_MOCK, PROPOSED_NAME_2_MOCK],
                  lastRequestTime: null,
                  retryDelay: null,
                },
              },
            },
          },
        },
      };

      controller.setName({
        value: VALUE_MOCK,
        type: NameType.ETHEREUM_ADDRESS,
        name: NAME_MOCK,
        sourceId: `${SOURCE_ID_MOCK}1`,
      });

      expect(controller.state.names).toStrictEqual({
        [NameType.ETHEREUM_ADDRESS]: {
          [VALUE_MOCK]: {
            [CHAIN_ID_MOCK]: {
              name: NAME_MOCK,
              sourceId: `${SOURCE_ID_MOCK}1`,
              proposedNames: {
                [SOURCE_ID_MOCK]: {
                  proposedNames: [PROPOSED_NAME_MOCK, PROPOSED_NAME_2_MOCK],
                  lastRequestTime: null,
                  retryDelay: null,
                },
              },
            },
          },
        },
      });
    });

    it('removes source ID from entry if not specified', () => {
      const controller = new NameController(CONTROLLER_ARGS_MOCK);

      controller.state.names = {
        [NameType.ETHEREUM_ADDRESS]: {
          [VALUE_MOCK]: {
            [CHAIN_ID_MOCK]: {
              name: null,
              sourceId: SOURCE_ID_MOCK,
              proposedNames: {
                [SOURCE_ID_MOCK]: {
                  proposedNames: [PROPOSED_NAME_MOCK, PROPOSED_NAME_2_MOCK],
                  lastRequestTime: null,
                  retryDelay: null,
                },
              },
            },
          },
        },
      };

      controller.setName({
        value: VALUE_MOCK,
        type: NameType.ETHEREUM_ADDRESS,
        name: NAME_MOCK,
      });

      expect(controller.state.names).toStrictEqual({
        [NameType.ETHEREUM_ADDRESS]: {
          [VALUE_MOCK]: {
            [CHAIN_ID_MOCK]: {
              name: NAME_MOCK,
              sourceId: null,
              proposedNames: {
                [SOURCE_ID_MOCK]: {
                  proposedNames: [PROPOSED_NAME_MOCK, PROPOSED_NAME_2_MOCK],
                  lastRequestTime: null,
                  retryDelay: null,
                },
              },
            },
          },
        },
      });
    });

    it('stores alternate name for each ethereum address for each chain ID', () => {
      const alternateChainId = `${CHAIN_ID_MOCK}2`;
      const alternateName = `${NAME_MOCK}2`;

      const controller = new NameController({
        ...CONTROLLER_ARGS_MOCK,
        getChainId: () => alternateChainId,
      });

      controller.state.names = {
        [NameType.ETHEREUM_ADDRESS]: {
          [VALUE_MOCK]: {
            [CHAIN_ID_MOCK]: {
              name: NAME_MOCK,
              sourceId: SOURCE_ID_MOCK,
              proposedNames: {
                [SOURCE_ID_MOCK]: {
                  proposedNames: [PROPOSED_NAME_MOCK, PROPOSED_NAME_2_MOCK],
                  lastRequestTime: TIME_MOCK,
                  retryDelay: null,
                },
              },
            },
          },
        },
      };

      controller.setName({
        value: VALUE_MOCK,
        type: NameType.ETHEREUM_ADDRESS,
        name: alternateName,
      });

      expect(controller.state.names).toStrictEqual({
        [NameType.ETHEREUM_ADDRESS]: {
          [VALUE_MOCK]: {
            [CHAIN_ID_MOCK]: {
              name: NAME_MOCK,
              sourceId: SOURCE_ID_MOCK,
              proposedNames: {
                [SOURCE_ID_MOCK]: {
                  proposedNames: [PROPOSED_NAME_MOCK, PROPOSED_NAME_2_MOCK],
                  lastRequestTime: TIME_MOCK,
                  retryDelay: null,
                },
              },
            },
            [alternateChainId]: {
              name: alternateName,
              sourceId: null,
              proposedNames: {},
            },
          },
        },
      });
    });

    it('can clear saved name', () => {
      const provider1 = createMockProvider(1);

      const controller = new NameController({
        ...CONTROLLER_ARGS_MOCK,
        providers: [provider1],
      });

      controller.state.names = {
        [NameType.ETHEREUM_ADDRESS]: {
          [VALUE_MOCK]: {
            [CHAIN_ID_MOCK]: {
              name: NAME_MOCK,
              sourceId: SOURCE_ID_MOCK,
              proposedNames: {
                [SOURCE_ID_MOCK]: {
                  proposedNames: [PROPOSED_NAME_MOCK, PROPOSED_NAME_2_MOCK],
                  lastRequestTime: null,
                  retryDelay: null,
                },
              },
            },
          },
        },
      };

      controller.setName({
        value: VALUE_MOCK,
        type: NameType.ETHEREUM_ADDRESS,
        name: null,
      });

      expect(controller.state.names).toStrictEqual({
        [NameType.ETHEREUM_ADDRESS]: {
          [VALUE_MOCK]: {
            [CHAIN_ID_MOCK]: {
              name: null,
              sourceId: null,
              proposedNames: {
                [SOURCE_ID_MOCK]: {
                  proposedNames: [PROPOSED_NAME_MOCK, PROPOSED_NAME_2_MOCK],
                  lastRequestTime: null,
                  retryDelay: null,
                },
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
        ).toThrow('Must specify a non-empty string or null for name.');
      });

      it.each([
        ['empty', ''],
        ['not a string', 12],
      ])('source ID is %s', (_, sourceId) => {
        const controller = new NameController(CONTROLLER_ARGS_MOCK);

        expect(() =>
          controller.setName({
            value: VALUE_MOCK,
            type: NameType.ETHEREUM_ADDRESS,
            name: NAME_MOCK,
            sourceId,
          } as any),
        ).toThrow('Must specify a non-empty string for sourceId.');
      });

      it('source ID is unrecognised for type', () => {
        const controller = new NameController(CONTROLLER_ARGS_MOCK);

        expect(() =>
          controller.setName({
            value: VALUE_MOCK,
            type: NameType.ETHEREUM_ADDRESS,
            name: NAME_MOCK,
            sourceId: SOURCE_ID_MOCK,
          } as any),
        ).toThrow(
          `Unknown source ID for type '${NameType.ETHEREUM_ADDRESS}': ${SOURCE_ID_MOCK}`,
        );
      });

      it('source ID is set but name is being cleared', () => {
        const controller = new NameController(CONTROLLER_ARGS_MOCK);

        expect(() =>
          controller.setName({
            value: VALUE_MOCK,
            type: NameType.ETHEREUM_ADDRESS,
            name: null,
            sourceId: SOURCE_ID_MOCK,
          } as any),
        ).toThrow(
          `Cannot specify a source ID when clearing the saved name: ${SOURCE_ID_MOCK}`,
        );
      });
    });
  });

  describe('updateProposedNames', () => {
    it.each([
      ['', (controller: NameController) => controller.state.names],
      [' and no existing type state', () => ({})],
    ])(
      'creates entry with proposed names if value is new%s',
      async (_, getExistingState) => {
        const provider1 = createMockProvider(1);
        const provider2 = createMockProvider(2, { retryDelay: 3 });

        const controller = new NameController({
          ...CONTROLLER_ARGS_MOCK,
          providers: [provider1, provider2],
        });

        controller.state.names = getExistingState(controller) as any;

        const result = await controller.updateProposedNames({
          value: VALUE_MOCK,
          type: NameType.ETHEREUM_ADDRESS,
        });

        expect(controller.state.names).toStrictEqual({
          [NameType.ETHEREUM_ADDRESS]: {
            [VALUE_MOCK]: {
              [CHAIN_ID_MOCK]: {
                name: null,
                sourceId: null,
                proposedNames: {
                  [`${SOURCE_ID_MOCK}1`]: {
                    proposedNames: [
                      `${PROPOSED_NAME_MOCK}1`,
                      `${PROPOSED_NAME_MOCK}1_2`,
                    ],
                    lastRequestTime: TIME_MOCK,
                    retryDelay: null,
                  },
                  [`${SOURCE_ID_MOCK}2`]: {
                    proposedNames: [
                      `${PROPOSED_NAME_MOCK}2`,
                      `${PROPOSED_NAME_MOCK}2_2`,
                    ],
                    lastRequestTime: TIME_MOCK,
                    retryDelay: 3,
                  },
                },
              },
            },
          },
        });

        expect(result).toStrictEqual({
          results: {
            [`${SOURCE_ID_MOCK}1`]: {
              proposedNames: [
                `${PROPOSED_NAME_MOCK}1`,
                `${PROPOSED_NAME_MOCK}1_2`,
              ],
              error: undefined,
            },
            [`${SOURCE_ID_MOCK}2`]: {
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
            [CHAIN_ID_MOCK]: {
              name: null,
              sourceId: null,
              proposedNames: {
                [`${SOURCE_ID_MOCK}1`]: {
                  proposedNames: ['ShouldBeDeleted1'],
                  lastRequestTime: 12,
                  retryDelay: null,
                },
                [`${SOURCE_ID_MOCK}2`]: {
                  proposedNames: ['ShouldBeDeleted2'],
                  lastRequestTime: 12,
                  retryDelay: null,
                },
              },
            },
          },
        },
      };

      const result = await controller.updateProposedNames({
        value: VALUE_MOCK,
        type: NameType.ETHEREUM_ADDRESS,
      });

      expect(controller.state.names).toStrictEqual({
        [NameType.ETHEREUM_ADDRESS]: {
          [VALUE_MOCK]: {
            [CHAIN_ID_MOCK]: {
              name: null,
              sourceId: null,
              proposedNames: {
                [`${SOURCE_ID_MOCK}1`]: {
                  proposedNames: [
                    `${PROPOSED_NAME_MOCK}1`,
                    `${PROPOSED_NAME_MOCK}1_2`,
                  ],
                  lastRequestTime: TIME_MOCK,
                  retryDelay: null,
                },
                [`${SOURCE_ID_MOCK}2`]: {
                  proposedNames: [
                    `${PROPOSED_NAME_MOCK}2`,
                    `${PROPOSED_NAME_MOCK}2_2`,
                  ],
                  lastRequestTime: TIME_MOCK,
                  retryDelay: null,
                },
              },
            },
          },
        },
      });

      expect(result).toStrictEqual({
        results: {
          [`${SOURCE_ID_MOCK}1`]: {
            proposedNames: [
              `${PROPOSED_NAME_MOCK}1`,
              `${PROPOSED_NAME_MOCK}1_2`,
            ],
            error: undefined,
          },
          [`${SOURCE_ID_MOCK}2`]: {
            proposedNames: [
              `${PROPOSED_NAME_MOCK}2`,
              `${PROPOSED_NAME_MOCK}2_2`,
            ],
            error: undefined,
          },
        },
      });
    });

    it('removes proposed names if source ID not used by any provider', async () => {
      const provider1 = createMockProvider(1);
      const provider2 = createMockProvider(2);

      const controller = new NameController({
        ...CONTROLLER_ARGS_MOCK,
        providers: [provider1, provider2],
      });

      controller.state.names = {
        [NameType.ETHEREUM_ADDRESS]: {
          [VALUE_MOCK]: {
            [CHAIN_ID_MOCK]: {
              name: null,
              sourceId: null,
              proposedNames: {
                [`${SOURCE_ID_MOCK}3`]: {
                  proposedNames: ['ShouldBeDeleted3'],
                  lastRequestTime: 12,
                  retryDelay: null,
                },
              },
            },
          },
        },
      };

      await controller.updateProposedNames({
        value: VALUE_MOCK,
        type: NameType.ETHEREUM_ADDRESS,
      });

      expect(controller.state.names).toStrictEqual({
        [NameType.ETHEREUM_ADDRESS]: {
          [VALUE_MOCK]: {
            [CHAIN_ID_MOCK]: {
              name: null,
              sourceId: null,
              proposedNames: {
                [`${SOURCE_ID_MOCK}1`]: {
                  proposedNames: [
                    `${PROPOSED_NAME_MOCK}1`,
                    `${PROPOSED_NAME_MOCK}1_2`,
                  ],
                  lastRequestTime: TIME_MOCK,
                  retryDelay: null,
                },
                [`${SOURCE_ID_MOCK}2`]: {
                  proposedNames: [
                    `${PROPOSED_NAME_MOCK}2`,
                    `${PROPOSED_NAME_MOCK}2_2`,
                  ],
                  lastRequestTime: TIME_MOCK,
                  retryDelay: null,
                },
              },
            },
          },
        },
      });
    });

    it.each([
      ['undefined', undefined],
      ['empty string', ''],
    ])('ignores proposed name if %s', async (_, proposedName) => {
      const provider1 = createMockProvider(1);
      const provider2 = createMockProvider(2);

      provider1.getProposedNames.mockResolvedValue({
        results: {
          [`${SOURCE_ID_MOCK}1`]: { proposedNames: [proposedName as string] },
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

      expect(controller.state.names).toStrictEqual({
        [NameType.ETHEREUM_ADDRESS]: {
          [VALUE_MOCK]: {
            [CHAIN_ID_MOCK]: {
              name: null,
              sourceId: null,
              proposedNames: {
                [`${SOURCE_ID_MOCK}1`]: {
                  proposedNames: [],
                  lastRequestTime: TIME_MOCK,
                  retryDelay: null,
                },
                [`${SOURCE_ID_MOCK}2`]: {
                  proposedNames: [
                    `${PROPOSED_NAME_MOCK}2`,
                    `${PROPOSED_NAME_MOCK}2_2`,
                  ],
                  lastRequestTime: TIME_MOCK,
                  retryDelay: null,
                },
              },
            },
          },
        },
      });

      expect(result).toStrictEqual({
        results: {
          [`${SOURCE_ID_MOCK}1`]: {
            proposedNames: [],
            error: undefined,
          },
          [`${SOURCE_ID_MOCK}2`]: {
            proposedNames: [
              `${PROPOSED_NAME_MOCK}2`,
              `${PROPOSED_NAME_MOCK}2_2`,
            ],
            error: undefined,
          },
        },
      });
    });

    it('updates source state', async () => {
      const provider1 = createMockProvider(1);
      const provider2 = createMockProvider(2);

      const controller = new NameController({
        ...CONTROLLER_ARGS_MOCK,
        providers: [provider1, provider2],
      });

      controller.state.nameSources = {
        [`${SOURCE_ID_MOCK}3`]: {
          label: `${SOURCE_LABEL_MOCK}3`,
        },
        [`${SOURCE_ID_MOCK}4`]: {
          label: `${SOURCE_LABEL_MOCK}4`,
        },
      };

      await controller.updateProposedNames({
        value: VALUE_MOCK,
        type: NameType.ETHEREUM_ADDRESS,
      });

      expect(controller.state.nameSources).toStrictEqual({
        [`${SOURCE_ID_MOCK}1`]: {
          label: `${SOURCE_LABEL_MOCK}1`,
        },
        [`${SOURCE_ID_MOCK}2`]: {
          label: `${SOURCE_LABEL_MOCK}2`,
        },
        [`${SOURCE_ID_MOCK}3`]: {
          label: `${SOURCE_LABEL_MOCK}3`,
        },
        [`${SOURCE_ID_MOCK}4`]: {
          label: `${SOURCE_LABEL_MOCK}4`,
        },
      });
    });

    it('stores alternate proposed names for each ethereum address for each chain ID', async () => {
      const provider1 = createMockProvider(1);
      const provider2 = createMockProvider(2);
      const alternateChainId = `${CHAIN_ID_MOCK}2`;

      const controller = new NameController({
        ...CONTROLLER_ARGS_MOCK,
        getChainId: () => alternateChainId,
        providers: [provider1, provider2],
      });

      controller.state.names = {
        [NameType.ETHEREUM_ADDRESS]: {
          [VALUE_MOCK]: {
            [CHAIN_ID_MOCK]: {
              name: null,
              sourceId: null,
              proposedNames: {
                [`${SOURCE_ID_MOCK}1`]: {
                  proposedNames: ['ShouldNotBeDeleted1'],
                  lastRequestTime: 12,
                  retryDelay: null,
                },
                [`${SOURCE_ID_MOCK}2`]: {
                  proposedNames: ['ShouldNotBeDeleted2'],
                  lastRequestTime: 12,
                  retryDelay: null,
                },
                [`${SOURCE_ID_MOCK}3`]: {
                  proposedNames: ['ShouldNotBeDeleted3'],
                  lastRequestTime: 12,
                  retryDelay: null,
                },
              },
            },
          },
        },
      };

      await controller.updateProposedNames({
        value: VALUE_MOCK,
        type: NameType.ETHEREUM_ADDRESS,
      });

      expect(controller.state.names).toStrictEqual({
        [NameType.ETHEREUM_ADDRESS]: {
          [VALUE_MOCK]: {
            [CHAIN_ID_MOCK]: {
              name: null,
              sourceId: null,
              proposedNames: {
                [`${SOURCE_ID_MOCK}1`]: {
                  proposedNames: ['ShouldNotBeDeleted1'],
                  lastRequestTime: 12,
                  retryDelay: null,
                },
                [`${SOURCE_ID_MOCK}2`]: {
                  proposedNames: ['ShouldNotBeDeleted2'],
                  lastRequestTime: 12,
                  retryDelay: null,
                },
                [`${SOURCE_ID_MOCK}3`]: {
                  proposedNames: ['ShouldNotBeDeleted3'],
                  lastRequestTime: 12,
                  retryDelay: null,
                },
              },
            },
            [alternateChainId]: {
              name: null,
              sourceId: null,
              proposedNames: {
                [`${SOURCE_ID_MOCK}1`]: {
                  proposedNames: [
                    `${PROPOSED_NAME_MOCK}1`,
                    `${PROPOSED_NAME_MOCK}1_2`,
                  ],
                  lastRequestTime: TIME_MOCK,
                  retryDelay: null,
                },
                [`${SOURCE_ID_MOCK}2`]: {
                  proposedNames: [
                    `${PROPOSED_NAME_MOCK}2`,
                    `${PROPOSED_NAME_MOCK}2_2`,
                  ],
                  lastRequestTime: TIME_MOCK,
                  retryDelay: null,
                },
              },
            },
          },
        },
      });
    });

    it('ignores source IDs in response if not in metadata', async () => {
      const provider1 = createMockProvider(1);

      provider1.getProposedNames.mockResolvedValue({
        results: {
          [`${SOURCE_ID_MOCK}1`]: {
            proposedNames: [
              `${PROPOSED_NAME_MOCK}1`,
              `${PROPOSED_NAME_MOCK}1_2`,
            ],
          },
          [`${SOURCE_ID_MOCK}2`]: {
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
      });

      expect(controller.state.names).toStrictEqual({
        [NameType.ETHEREUM_ADDRESS]: {
          [VALUE_MOCK]: {
            [CHAIN_ID_MOCK]: {
              name: null,
              sourceId: null,
              proposedNames: {
                [`${SOURCE_ID_MOCK}1`]: {
                  proposedNames: [
                    `${PROPOSED_NAME_MOCK}1`,
                    `${PROPOSED_NAME_MOCK}1_2`,
                  ],
                  lastRequestTime: TIME_MOCK,
                  retryDelay: null,
                },
              },
            },
          },
        },
      });

      expect(result).toStrictEqual({
        results: {
          [`${SOURCE_ID_MOCK}1`]: {
            proposedNames: [
              `${PROPOSED_NAME_MOCK}1`,
              `${PROPOSED_NAME_MOCK}1_2`,
            ],
            error: undefined,
          },
        },
      });
    });

    it('ignores empty or undefined proposed names', async () => {
      const provider1 = createMockProvider(1);

      provider1.getProposedNames.mockResolvedValue({
        results: {
          [`${SOURCE_ID_MOCK}1`]: {
            proposedNames: [
              `${PROPOSED_NAME_MOCK}1`,
              undefined,
              null,
              '',
              `${PROPOSED_NAME_MOCK}1_2`,
            ],
          },
        },
      } as any);

      const controller = new NameController({
        ...CONTROLLER_ARGS_MOCK,
        providers: [provider1],
      });

      const result = await controller.updateProposedNames({
        value: VALUE_MOCK,
        type: NameType.ETHEREUM_ADDRESS,
      });

      expect(controller.state.names).toStrictEqual({
        [NameType.ETHEREUM_ADDRESS]: {
          [VALUE_MOCK]: {
            [CHAIN_ID_MOCK]: {
              name: null,
              sourceId: null,
              proposedNames: {
                [`${SOURCE_ID_MOCK}1`]: {
                  proposedNames: [
                    `${PROPOSED_NAME_MOCK}1`,
                    `${PROPOSED_NAME_MOCK}1_2`,
                  ],
                  lastRequestTime: TIME_MOCK,
                  retryDelay: null,
                },
              },
            },
          },
        },
      });

      expect(result).toStrictEqual({
        results: {
          [`${SOURCE_ID_MOCK}1`]: {
            proposedNames: [
              `${PROPOSED_NAME_MOCK}1`,
              `${PROPOSED_NAME_MOCK}1_2`,
            ],
            error: undefined,
          },
        },
      });
    });

    describe('does not update existing proposed names if', () => {
      it('new value is undefined', async () => {
        const provider1 = createMockProvider(1);
        const provider2 = createMockProvider(2);

        provider1.getProposedNames.mockResolvedValue({
          results: {
            [`${SOURCE_ID_MOCK}1`]: { proposedNames: undefined },
          },
        });

        provider2.getProposedNames.mockResolvedValue({
          results: {},
        });

        const controller = new NameController({
          ...CONTROLLER_ARGS_MOCK,
          providers: [provider1, provider2],
        });

        controller.state.names = {
          [NameType.ETHEREUM_ADDRESS]: {
            [VALUE_MOCK]: {
              [CHAIN_ID_MOCK]: {
                name: null,
                sourceId: null,
                proposedNames: {
                  [`${SOURCE_ID_MOCK}1`]: {
                    proposedNames: ['ShouldNotBeUpdated1'],
                    lastRequestTime: 11,
                    retryDelay: 1,
                  },
                  [`${SOURCE_ID_MOCK}2`]: {
                    proposedNames: ['ShouldNotBeUpdated2'],
                    lastRequestTime: 12,
                    retryDelay: 2,
                  },
                },
              },
            },
          },
        };

        await controller.updateProposedNames({
          value: VALUE_MOCK,
          type: NameType.ETHEREUM_ADDRESS,
        });

        expect(controller.state.names).toStrictEqual({
          [NameType.ETHEREUM_ADDRESS]: {
            [VALUE_MOCK]: {
              [CHAIN_ID_MOCK]: {
                name: null,
                sourceId: null,
                proposedNames: {
                  [`${SOURCE_ID_MOCK}1`]: {
                    proposedNames: ['ShouldNotBeUpdated1'],
                    lastRequestTime: TIME_MOCK,
                    retryDelay: null,
                  },
                  [`${SOURCE_ID_MOCK}2`]: {
                    proposedNames: ['ShouldNotBeUpdated2'],
                    lastRequestTime: TIME_MOCK,
                    retryDelay: null,
                  },
                },
              },
            },
          },
        });
      });

      it('result error', async () => {
        const provider1 = createMockProvider(1);

        provider1.getProposedNames.mockResolvedValue({
          results: {
            [`${SOURCE_ID_MOCK}1`]: {
              proposedNames: [PROPOSED_NAME_MOCK],
              error: new Error('TestError'),
            },
          },
        });

        const controller = new NameController({
          ...CONTROLLER_ARGS_MOCK,
          providers: [provider1],
        });

        controller.state.names = {
          [NameType.ETHEREUM_ADDRESS]: {
            [VALUE_MOCK]: {
              [CHAIN_ID_MOCK]: {
                name: null,
                sourceId: null,
                proposedNames: {
                  [`${SOURCE_ID_MOCK}1`]: {
                    proposedNames: ['ShouldNotBeUpdated1'],
                    lastRequestTime: 11,
                    retryDelay: 1,
                  },
                },
              },
            },
          },
        };

        await controller.updateProposedNames({
          value: VALUE_MOCK,
          type: NameType.ETHEREUM_ADDRESS,
        });

        expect(controller.state.names).toStrictEqual({
          [NameType.ETHEREUM_ADDRESS]: {
            [VALUE_MOCK]: {
              [CHAIN_ID_MOCK]: {
                name: null,
                sourceId: null,
                proposedNames: {
                  [`${SOURCE_ID_MOCK}1`]: {
                    proposedNames: ['ShouldNotBeUpdated1'],
                    lastRequestTime: TIME_MOCK,
                    retryDelay: null,
                  },
                },
              },
            },
          },
        });
      });

      it('response error', async () => {
        const provider1 = createMockProvider(1);

        provider1.getProposedNames.mockResolvedValue({
          results: {
            [`${SOURCE_ID_MOCK}1`]: {
              proposedNames: [PROPOSED_NAME_MOCK],
            },
          },
          error: new Error('TestError'),
        });

        const controller = new NameController({
          ...CONTROLLER_ARGS_MOCK,
          providers: [provider1],
        });

        controller.state.names = {
          [NameType.ETHEREUM_ADDRESS]: {
            [VALUE_MOCK]: {
              [CHAIN_ID_MOCK]: {
                name: null,
                sourceId: null,
                proposedNames: {
                  [`${SOURCE_ID_MOCK}1`]: {
                    proposedNames: ['ShouldNotBeUpdated1'],
                    lastRequestTime: 11,
                    retryDelay: 1,
                  },
                },
              },
            },
          },
        };

        await controller.updateProposedNames({
          value: VALUE_MOCK,
          type: NameType.ETHEREUM_ADDRESS,
        });

        expect(controller.state.names).toStrictEqual({
          [NameType.ETHEREUM_ADDRESS]: {
            [VALUE_MOCK]: {
              [CHAIN_ID_MOCK]: {
                name: null,
                sourceId: null,
                proposedNames: {
                  [`${SOURCE_ID_MOCK}1`]: {
                    proposedNames: ['ShouldNotBeUpdated1'],
                    lastRequestTime: TIME_MOCK,
                    retryDelay: null,
                  },
                },
              },
            },
          },
        });
      });
    });

    describe('with error', () => {
      it('returns result errors if unhandled error while getting proposed name using provider', async () => {
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

        expect(controller.state.names).toStrictEqual({
          [NameType.ETHEREUM_ADDRESS]: {
            [VALUE_MOCK]: {
              [CHAIN_ID_MOCK]: {
                name: null,
                sourceId: null,
                proposedNames: {
                  [`${SOURCE_ID_MOCK}1`]: {
                    proposedNames: [],
                    lastRequestTime: TIME_MOCK,
                    retryDelay: null,
                  },
                  [`${SOURCE_ID_MOCK}2`]: {
                    proposedNames: [
                      `${PROPOSED_NAME_MOCK}2`,
                      `${PROPOSED_NAME_MOCK}2_2`,
                    ],
                    lastRequestTime: TIME_MOCK,
                    retryDelay: null,
                  },
                },
              },
            },
          },
        });

        expect(result).toStrictEqual({
          results: {
            [`${SOURCE_ID_MOCK}1`]: {
              proposedNames: undefined,
              error,
            },
            [`${SOURCE_ID_MOCK}2`]: {
              proposedNames: [
                `${PROPOSED_NAME_MOCK}2`,
                `${PROPOSED_NAME_MOCK}2_2`,
              ],
              error: undefined,
            },
          },
        });
      });

      it('returns result errors if response error while getting proposed name using provider', async () => {
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

        expect(controller.state.names).toStrictEqual({
          [NameType.ETHEREUM_ADDRESS]: {
            [VALUE_MOCK]: {
              [CHAIN_ID_MOCK]: {
                name: null,
                sourceId: null,
                proposedNames: {
                  [`${SOURCE_ID_MOCK}1`]: {
                    proposedNames: [],
                    lastRequestTime: TIME_MOCK,
                    retryDelay: null,
                  },
                  [`${SOURCE_ID_MOCK}2`]: {
                    proposedNames: [
                      `${PROPOSED_NAME_MOCK}2`,
                      `${PROPOSED_NAME_MOCK}2_2`,
                    ],
                    lastRequestTime: TIME_MOCK,
                    retryDelay: null,
                  },
                },
              },
            },
          },
        });

        expect(result).toStrictEqual({
          results: {
            [`${SOURCE_ID_MOCK}1`]: {
              proposedNames: undefined,
              error,
            },
            [`${SOURCE_ID_MOCK}2`]: {
              proposedNames: [
                `${PROPOSED_NAME_MOCK}2`,
                `${PROPOSED_NAME_MOCK}2_2`,
              ],
              error: undefined,
            },
          },
        });
      });

      it('stores emtpy array if result error while getting proposed name using provider', async () => {
        const provider1 = createMockProvider(1);
        const provider2 = createMockProvider(2);
        const error = new Error('TestError');

        provider1.getProposedNames.mockResolvedValue({
          results: {
            [`${SOURCE_ID_MOCK}1`]: {
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

        expect(controller.state.names).toStrictEqual({
          [NameType.ETHEREUM_ADDRESS]: {
            [VALUE_MOCK]: {
              [CHAIN_ID_MOCK]: {
                name: null,
                sourceId: null,
                proposedNames: {
                  [`${SOURCE_ID_MOCK}1`]: {
                    proposedNames: [],
                    lastRequestTime: TIME_MOCK,
                    retryDelay: null,
                  },
                  [`${SOURCE_ID_MOCK}2`]: {
                    proposedNames: [
                      `${PROPOSED_NAME_MOCK}2`,
                      `${PROPOSED_NAME_MOCK}2_2`,
                    ],
                    lastRequestTime: TIME_MOCK,
                    retryDelay: null,
                  },
                },
              },
            },
          },
        });

        expect(result).toStrictEqual({
          results: {
            [`${SOURCE_ID_MOCK}1`]: {
              proposedNames: undefined,
              error,
            },
            [`${SOURCE_ID_MOCK}2`]: {
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

    describe('with source IDs', () => {
      it('updates entry using matching providers only', async () => {
        const provider1 = createMockProvider(1);
        const provider2 = createMockProvider(2);
        const provider3 = createMockProvider(3);

        const controller = new NameController({
          ...CONTROLLER_ARGS_MOCK,
          providers: [provider1, provider2, provider3],
        });

        controller.state.names = {
          [NameType.ETHEREUM_ADDRESS]: {
            [VALUE_MOCK]: {
              [CHAIN_ID_MOCK]: {
                name: null,
                sourceId: null,
                proposedNames: {
                  [`${SOURCE_ID_MOCK}1`]: {
                    proposedNames: ['ShouldNotBeDeleted1'],
                    lastRequestTime: 12,
                    retryDelay: null,
                  },
                  [`${SOURCE_ID_MOCK}2`]: {
                    proposedNames: ['ShouldBeDeleted2'],
                    lastRequestTime: 12,
                    retryDelay: null,
                  },
                  [`${SOURCE_ID_MOCK}3`]: {
                    proposedNames: ['ShouldNotBeDeleted3'],
                    lastRequestTime: 12,
                    retryDelay: null,
                  },
                },
              },
            },
          },
        };

        const result = await controller.updateProposedNames({
          value: VALUE_MOCK,
          type: NameType.ETHEREUM_ADDRESS,
          sourceIds: [`${SOURCE_ID_MOCK}2`],
        });

        expect(controller.state.names).toStrictEqual({
          [NameType.ETHEREUM_ADDRESS]: {
            [VALUE_MOCK]: {
              [CHAIN_ID_MOCK]: {
                name: null,
                sourceId: null,
                proposedNames: {
                  [`${SOURCE_ID_MOCK}1`]: {
                    proposedNames: [`ShouldNotBeDeleted1`],
                    lastRequestTime: 12,
                    retryDelay: null,
                  },
                  [`${SOURCE_ID_MOCK}2`]: {
                    proposedNames: [
                      `${PROPOSED_NAME_MOCK}2`,
                      `${PROPOSED_NAME_MOCK}2_2`,
                    ],
                    lastRequestTime: TIME_MOCK,
                    retryDelay: null,
                  },
                  [`${SOURCE_ID_MOCK}3`]: {
                    proposedNames: ['ShouldNotBeDeleted3'],
                    lastRequestTime: 12,
                    retryDelay: null,
                  },
                },
              },
            },
          },
        });

        expect(result).toStrictEqual({
          results: {
            [`${SOURCE_ID_MOCK}2`]: {
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
          sourceIds: [`${SOURCE_ID_MOCK}2`],
        });
      });

      it('passes relevant source IDs only to provider', async () => {
        const provider1 = createMockProvider(1);
        const provider2 = createMockProvider(2);

        const controller = new NameController({
          ...CONTROLLER_ARGS_MOCK,
          providers: [provider1, provider2],
        });

        await controller.updateProposedNames({
          value: VALUE_MOCK,
          type: NameType.ETHEREUM_ADDRESS,
          sourceIds: [`${SOURCE_ID_MOCK}1`, `${SOURCE_ID_MOCK}2`],
        });

        expect(provider1.getProposedNames).toHaveBeenCalledTimes(1);
        expect(provider1.getProposedNames).toHaveBeenCalledWith({
          chainId: CHAIN_ID_MOCK,
          value: VALUE_MOCK,
          type: NameType.ETHEREUM_ADDRESS,
          sourceIds: [`${SOURCE_ID_MOCK}1`],
        });

        expect(provider2.getProposedNames).toHaveBeenCalledTimes(1);
        expect(provider2.getProposedNames).toHaveBeenCalledWith({
          chainId: CHAIN_ID_MOCK,
          value: VALUE_MOCK,
          type: NameType.ETHEREUM_ADDRESS,
          sourceIds: [`${SOURCE_ID_MOCK}2`],
        });
      });

      it('ignores unrequested source IDs in response', async () => {
        const provider1 = createMockProvider(1);

        provider1.getProposedNames.mockResolvedValue({
          results: {
            [`${SOURCE_ID_MOCK}1`]: {
              proposedNames: [
                `${PROPOSED_NAME_MOCK}1`,
                `${PROPOSED_NAME_MOCK}1_2`,
              ],
            },
            [`${SOURCE_ID_MOCK}2`]: {
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
          sourceIds: [`${SOURCE_ID_MOCK}1`],
        });

        expect(controller.state.names).toStrictEqual({
          [NameType.ETHEREUM_ADDRESS]: {
            [VALUE_MOCK]: {
              [CHAIN_ID_MOCK]: {
                name: null,
                sourceId: null,
                proposedNames: {
                  [`${SOURCE_ID_MOCK}1`]: {
                    proposedNames: [
                      `${PROPOSED_NAME_MOCK}1`,
                      `${PROPOSED_NAME_MOCK}1_2`,
                    ],
                    lastRequestTime: TIME_MOCK,
                    retryDelay: null,
                  },
                },
              },
            },
          },
        });

        expect(result).toStrictEqual({
          results: {
            [`${SOURCE_ID_MOCK}1`]: {
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

      it('throws if missing sources', async () => {
        const provider1 = createMockProvider(1);

        const controller = new NameController({
          ...CONTROLLER_ARGS_MOCK,
          providers: [provider1],
        });

        await expect(
          controller.updateProposedNames({
            value: VALUE_MOCK,
            type: NameType.ETHEREUM_ADDRESS,
            sourceIds: [`${SOURCE_ID_MOCK}2`, `${SOURCE_ID_MOCK}3`],
          }),
        ).rejects.toThrow(
          `Unknown source IDs for type '${NameType.ETHEREUM_ADDRESS}': ${SOURCE_ID_MOCK}2, ${SOURCE_ID_MOCK}3`,
        );
      });

      it('throws if duplicate source IDs', async () => {
        const provider1 = createMockProvider(1);
        const provider2 = createMockProvider(2);
        const provider3 = createMockProvider(3);
        const provider4 = createMockProvider(1);
        const provider5 = createMockProvider(2);

        const controller = new NameController({
          ...CONTROLLER_ARGS_MOCK,
          providers: [provider1, provider2, provider3, provider4, provider5],
        });

        await expect(
          controller.updateProposedNames({
            value: VALUE_MOCK,
            type: NameType.ETHEREUM_ADDRESS,
          }),
        ).rejects.toThrow(
          `Duplicate source IDs found for type '${NameType.ETHEREUM_ADDRESS}': ${SOURCE_ID_MOCK}1, ${SOURCE_ID_MOCK}2`,
        );
      });
    });

    describe('with onlyUpdateAfterDelay', () => {
      it('does not update if no retryDelay and default delay not elapsed', async () => {
        const provider1 = createMockProvider(1);
        const provider2 = createMockProvider(2);

        const controller = new NameController({
          ...CONTROLLER_ARGS_MOCK,
          providers: [provider1, provider2],
        });

        controller.state.names = {
          [NameType.ETHEREUM_ADDRESS]: {
            [VALUE_MOCK]: {
              [CHAIN_ID_MOCK]: {
                name: null,
                sourceId: null,
                proposedNames: {
                  [`${SOURCE_ID_MOCK}1`]: {
                    proposedNames: ['ShouldNotBeUpdated1'],
                    lastRequestTime: 12,
                    retryDelay: null,
                  },
                  [`${SOURCE_ID_MOCK}2`]: {
                    proposedNames: ['ShouldNotBeUpdated2'],
                    lastRequestTime: 13,
                    retryDelay: null,
                  },
                },
              },
            },
          },
        };

        const result = await controller.updateProposedNames({
          value: VALUE_MOCK,
          type: NameType.ETHEREUM_ADDRESS,
          onlyUpdateAfterDelay: true,
        });

        expect(controller.state.names).toStrictEqual({
          [NameType.ETHEREUM_ADDRESS]: {
            [VALUE_MOCK]: {
              [CHAIN_ID_MOCK]: {
                name: null,
                sourceId: null,
                proposedNames: {
                  [`${SOURCE_ID_MOCK}1`]: {
                    proposedNames: ['ShouldNotBeUpdated1'],
                    lastRequestTime: 12,
                    retryDelay: null,
                  },
                  [`${SOURCE_ID_MOCK}2`]: {
                    proposedNames: ['ShouldNotBeUpdated2'],
                    lastRequestTime: 13,
                    retryDelay: null,
                  },
                },
              },
            },
          },
        });

        expect(result).toStrictEqual({
          results: {},
        });
      });

      it('does not update if retryDelay not elapsed', async () => {
        const provider1 = createMockProvider(1);
        const provider2 = createMockProvider(2);

        const controller = new NameController({
          ...CONTROLLER_ARGS_MOCK,
          providers: [provider1, provider2],
        });

        controller.state.names = {
          [NameType.ETHEREUM_ADDRESS]: {
            [VALUE_MOCK]: {
              [CHAIN_ID_MOCK]: {
                name: null,
                sourceId: null,
                proposedNames: {
                  [`${SOURCE_ID_MOCK}1`]: {
                    proposedNames: ['ShouldNotBeUpdated1'],
                    lastRequestTime: TIME_MOCK - 9,
                    retryDelay: 10,
                  },
                  [`${SOURCE_ID_MOCK}2`]: {
                    proposedNames: ['ShouldNotBeUpdated2'],
                    lastRequestTime: TIME_MOCK - 6,
                    retryDelay: 7,
                  },
                },
              },
            },
          },
        };

        const result = await controller.updateProposedNames({
          value: VALUE_MOCK,
          type: NameType.ETHEREUM_ADDRESS,
          onlyUpdateAfterDelay: true,
        });

        expect(controller.state.names).toStrictEqual({
          [NameType.ETHEREUM_ADDRESS]: {
            [VALUE_MOCK]: {
              [CHAIN_ID_MOCK]: {
                name: null,
                sourceId: null,
                proposedNames: {
                  [`${SOURCE_ID_MOCK}1`]: {
                    proposedNames: ['ShouldNotBeUpdated1'],
                    lastRequestTime: TIME_MOCK - 9,
                    retryDelay: 10,
                  },
                  [`${SOURCE_ID_MOCK}2`]: {
                    proposedNames: ['ShouldNotBeUpdated2'],
                    lastRequestTime: TIME_MOCK - 6,
                    retryDelay: 7,
                  },
                },
              },
            },
          },
        });

        expect(result).toStrictEqual({
          results: {},
        });
      });

      it('updates if default delay elapsed', async () => {
        const provider1 = createMockProvider(1);
        const provider2 = createMockProvider(2);

        const controller = new NameController({
          ...CONTROLLER_ARGS_MOCK,
          providers: [provider1, provider2],
        });

        controller.state.names = {
          [NameType.ETHEREUM_ADDRESS]: {
            [VALUE_MOCK]: {
              [CHAIN_ID_MOCK]: {
                name: null,
                sourceId: null,
                proposedNames: {
                  [`${SOURCE_ID_MOCK}1`]: {
                    proposedNames: ['ShouldNotBeUpdated1'],
                    lastRequestTime: TIME_MOCK - 120,
                    retryDelay: null,
                  },
                  [`${SOURCE_ID_MOCK}2`]: {
                    proposedNames: ['ShouldNotBeUpdated2'],
                    lastRequestTime: TIME_MOCK - 121,
                    retryDelay: null,
                  },
                },
              },
            },
          },
        };

        const result = await controller.updateProposedNames({
          value: VALUE_MOCK,
          type: NameType.ETHEREUM_ADDRESS,
          onlyUpdateAfterDelay: true,
        });

        expect(controller.state.names).toStrictEqual({
          [NameType.ETHEREUM_ADDRESS]: {
            [VALUE_MOCK]: {
              [CHAIN_ID_MOCK]: {
                name: null,
                sourceId: null,
                proposedNames: {
                  [`${SOURCE_ID_MOCK}1`]: {
                    proposedNames: [
                      `${PROPOSED_NAME_MOCK}1`,
                      `${PROPOSED_NAME_MOCK}1_2`,
                    ],
                    lastRequestTime: TIME_MOCK,
                    retryDelay: null,
                  },
                  [`${SOURCE_ID_MOCK}2`]: {
                    proposedNames: [
                      `${PROPOSED_NAME_MOCK}2`,
                      `${PROPOSED_NAME_MOCK}2_2`,
                    ],
                    lastRequestTime: TIME_MOCK,
                    retryDelay: null,
                  },
                },
              },
            },
          },
        });

        expect(result).toStrictEqual({
          results: {
            [`${SOURCE_ID_MOCK}1`]: {
              proposedNames: [
                `${PROPOSED_NAME_MOCK}1`,
                `${PROPOSED_NAME_MOCK}1_2`,
              ],
              error: undefined,
            },
            [`${SOURCE_ID_MOCK}2`]: {
              proposedNames: [
                `${PROPOSED_NAME_MOCK}2`,
                `${PROPOSED_NAME_MOCK}2_2`,
              ],
              error: undefined,
            },
          },
        });
      });

      it('updates if retryDelay elapsed', async () => {
        const provider1 = createMockProvider(1);
        const provider2 = createMockProvider(2);

        const controller = new NameController({
          ...CONTROLLER_ARGS_MOCK,
          providers: [provider1, provider2],
        });

        controller.state.names = {
          [NameType.ETHEREUM_ADDRESS]: {
            [VALUE_MOCK]: {
              [CHAIN_ID_MOCK]: {
                name: null,
                sourceId: null,
                proposedNames: {
                  [`${SOURCE_ID_MOCK}1`]: {
                    proposedNames: ['ShouldNotBeUpdated1'],
                    lastRequestTime: TIME_MOCK - 10,
                    retryDelay: 10,
                  },
                  [`${SOURCE_ID_MOCK}2`]: {
                    proposedNames: ['ShouldNotBeUpdated2'],
                    lastRequestTime: TIME_MOCK - 16,
                    retryDelay: 15,
                  },
                },
              },
            },
          },
        };

        const result = await controller.updateProposedNames({
          value: VALUE_MOCK,
          type: NameType.ETHEREUM_ADDRESS,
          onlyUpdateAfterDelay: true,
        });

        expect(controller.state.names).toStrictEqual({
          [NameType.ETHEREUM_ADDRESS]: {
            [VALUE_MOCK]: {
              [CHAIN_ID_MOCK]: {
                name: null,
                sourceId: null,
                proposedNames: {
                  [`${SOURCE_ID_MOCK}1`]: {
                    proposedNames: [
                      `${PROPOSED_NAME_MOCK}1`,
                      `${PROPOSED_NAME_MOCK}1_2`,
                    ],
                    lastRequestTime: TIME_MOCK,
                    retryDelay: null,
                  },
                  [`${SOURCE_ID_MOCK}2`]: {
                    proposedNames: [
                      `${PROPOSED_NAME_MOCK}2`,
                      `${PROPOSED_NAME_MOCK}2_2`,
                    ],
                    lastRequestTime: TIME_MOCK,
                    retryDelay: null,
                  },
                },
              },
            },
          },
        });

        expect(result).toStrictEqual({
          results: {
            [`${SOURCE_ID_MOCK}1`]: {
              proposedNames: [
                `${PROPOSED_NAME_MOCK}1`,
                `${PROPOSED_NAME_MOCK}1_2`,
              ],
              error: undefined,
            },
            [`${SOURCE_ID_MOCK}2`]: {
              proposedNames: [
                `${PROPOSED_NAME_MOCK}2`,
                `${PROPOSED_NAME_MOCK}2_2`,
              ],
              error: undefined,
            },
          },
        });
      });

      it('updates if no proposed name entry', async () => {
        const provider1 = createMockProvider(1);
        const provider2 = createMockProvider(2);

        const controller = new NameController({
          ...CONTROLLER_ARGS_MOCK,
          providers: [provider1, provider2],
        });

        controller.state.names = {} as any;

        const result = await controller.updateProposedNames({
          value: VALUE_MOCK,
          type: NameType.ETHEREUM_ADDRESS,
          onlyUpdateAfterDelay: true,
        });

        expect(controller.state.names).toStrictEqual({
          [NameType.ETHEREUM_ADDRESS]: {
            [VALUE_MOCK]: {
              [CHAIN_ID_MOCK]: {
                name: null,
                sourceId: null,
                proposedNames: {
                  [`${SOURCE_ID_MOCK}1`]: {
                    proposedNames: [
                      `${PROPOSED_NAME_MOCK}1`,
                      `${PROPOSED_NAME_MOCK}1_2`,
                    ],
                    lastRequestTime: TIME_MOCK,
                    retryDelay: null,
                  },
                  [`${SOURCE_ID_MOCK}2`]: {
                    proposedNames: [
                      `${PROPOSED_NAME_MOCK}2`,
                      `${PROPOSED_NAME_MOCK}2_2`,
                    ],
                    lastRequestTime: TIME_MOCK,
                    retryDelay: null,
                  },
                },
              },
            },
          },
        });

        expect(result).toStrictEqual({
          results: {
            [`${SOURCE_ID_MOCK}1`]: {
              proposedNames: [
                `${PROPOSED_NAME_MOCK}1`,
                `${PROPOSED_NAME_MOCK}1_2`,
              ],
              error: undefined,
            },
            [`${SOURCE_ID_MOCK}2`]: {
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
  });
});
