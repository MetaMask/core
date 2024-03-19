import type {
  SetNameRequest,
  UpdateProposedNamesRequest,
  NameControllerState,
} from './NameController';
import {
  FALLBACK_VARIATION,
  NameController,
  NameOrigin,
  PROPOSED_NAME_EXPIRE_DURATION,
} from './NameController';
import type { NameProvider } from './types';
import { NameType } from './types';

const NAME_MOCK = 'TestName';
const PROPOSED_NAME_MOCK = 'TestProposedName';
const PROPOSED_NAME_2_MOCK = 'TestProposedName2';
const SOURCE_ID_MOCK = 'TestSourceId';
const SOURCE_LABEL_MOCK = 'TestSourceLabel';
const VALUE_MOCK = 'testvalue';
const CHAIN_ID_MOCK = '0x1';
const TIME_MOCK = 123;

const MESSENGER_MOCK = {
  registerActionHandler: jest.fn(),
  registerInitialEventPayload: jest.fn(),
  publish: jest.fn(),
  // TODO: Replace `any` with type
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any;

const CONTROLLER_ARGS_MOCK = {
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
 * @param options.updateDelay - Optional update delay to return.
 * @returns Mock instance of a name provider.
 */
function createMockProvider(
  index: number,
  { updateDelay }: { updateDelay?: number } = {},
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
          updateDelay,
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
        variation: CHAIN_ID_MOCK,
      });

      expect(controller.state.names).toStrictEqual<
        NameControllerState['names']
      >({
        [NameType.ETHEREUM_ADDRESS]: {
          [VALUE_MOCK]: {
            [CHAIN_ID_MOCK]: {
              name: NAME_MOCK,
              sourceId: `${SOURCE_ID_MOCK}1`,
              origin: NameOrigin.API,
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
        state: {
          names: {
            [NameType.ETHEREUM_ADDRESS]: {
              [VALUE_MOCK]: {
                [CHAIN_ID_MOCK]: {
                  name: null,
                  sourceId: null,
                  origin: null,
                  proposedNames: {
                    [SOURCE_ID_MOCK]: {
                      proposedNames: [PROPOSED_NAME_MOCK, PROPOSED_NAME_2_MOCK],
                      lastRequestTime: null,
                      updateDelay: null,
                    },
                  },
                },
              },
            },
          },
        },
      });

      controller.setName({
        value: VALUE_MOCK,
        type: NameType.ETHEREUM_ADDRESS,
        name: NAME_MOCK,
        sourceId: `${SOURCE_ID_MOCK}1`,
        variation: CHAIN_ID_MOCK,
      });

      expect(controller.state.names).toStrictEqual<
        NameControllerState['names']
      >({
        [NameType.ETHEREUM_ADDRESS]: {
          [VALUE_MOCK]: {
            [CHAIN_ID_MOCK]: {
              name: NAME_MOCK,
              sourceId: `${SOURCE_ID_MOCK}1`,
              origin: NameOrigin.API,
              proposedNames: {
                [SOURCE_ID_MOCK]: {
                  proposedNames: [PROPOSED_NAME_MOCK, PROPOSED_NAME_2_MOCK],
                  lastRequestTime: null,
                  updateDelay: null,
                },
              },
            },
          },
        },
      });
    });

    it('removes source ID from entry if not specified', () => {
      const controller = new NameController({
        ...CONTROLLER_ARGS_MOCK,
        state: {
          names: {
            [NameType.ETHEREUM_ADDRESS]: {
              [VALUE_MOCK]: {
                [CHAIN_ID_MOCK]: {
                  name: null,
                  sourceId: SOURCE_ID_MOCK,
                  origin: NameOrigin.API,
                  proposedNames: {
                    [SOURCE_ID_MOCK]: {
                      proposedNames: [PROPOSED_NAME_MOCK, PROPOSED_NAME_2_MOCK],
                      lastRequestTime: null,
                      updateDelay: null,
                    },
                  },
                },
              },
            },
          },
        },
      });

      controller.setName({
        value: VALUE_MOCK,
        type: NameType.ETHEREUM_ADDRESS,
        name: NAME_MOCK,
        variation: CHAIN_ID_MOCK,
      });

      expect(controller.state.names).toStrictEqual<
        NameControllerState['names']
      >({
        [NameType.ETHEREUM_ADDRESS]: {
          [VALUE_MOCK]: {
            [CHAIN_ID_MOCK]: {
              name: NAME_MOCK,
              sourceId: null,
              origin: NameOrigin.API,
              proposedNames: {
                [SOURCE_ID_MOCK]: {
                  proposedNames: [PROPOSED_NAME_MOCK, PROPOSED_NAME_2_MOCK],
                  lastRequestTime: null,
                  updateDelay: null,
                },
              },
            },
          },
        },
      });
    });

    it('stores alternate name for each ethereum address for each variation', () => {
      const alternateChainId = `${CHAIN_ID_MOCK}2`;
      const alternateName = `${NAME_MOCK}2`;

      const controller = new NameController({
        ...CONTROLLER_ARGS_MOCK,
        state: {
          names: {
            [NameType.ETHEREUM_ADDRESS]: {
              [VALUE_MOCK]: {
                [CHAIN_ID_MOCK]: {
                  name: NAME_MOCK,
                  sourceId: SOURCE_ID_MOCK,
                  origin: NameOrigin.API,
                  proposedNames: {
                    [SOURCE_ID_MOCK]: {
                      proposedNames: [PROPOSED_NAME_MOCK, PROPOSED_NAME_2_MOCK],
                      lastRequestTime: TIME_MOCK,
                      updateDelay: null,
                    },
                  },
                },
              },
            },
          },
        },
      });

      controller.setName({
        value: VALUE_MOCK,
        type: NameType.ETHEREUM_ADDRESS,
        name: alternateName,
        variation: alternateChainId,
      });

      expect(controller.state.names).toStrictEqual<
        NameControllerState['names']
      >({
        [NameType.ETHEREUM_ADDRESS]: {
          [VALUE_MOCK]: {
            [CHAIN_ID_MOCK]: {
              name: NAME_MOCK,
              sourceId: SOURCE_ID_MOCK,
              origin: NameOrigin.API,
              proposedNames: {
                [SOURCE_ID_MOCK]: {
                  proposedNames: [PROPOSED_NAME_MOCK, PROPOSED_NAME_2_MOCK],
                  lastRequestTime: TIME_MOCK,
                  updateDelay: null,
                },
              },
            },
            [alternateChainId]: {
              name: alternateName,
              sourceId: null,
              origin: NameOrigin.API,
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
        state: {
          names: {
            [NameType.ETHEREUM_ADDRESS]: {
              [VALUE_MOCK]: {
                [CHAIN_ID_MOCK]: {
                  name: NAME_MOCK,
                  sourceId: SOURCE_ID_MOCK,
                  origin: NameOrigin.API,
                  proposedNames: {
                    [SOURCE_ID_MOCK]: {
                      proposedNames: [PROPOSED_NAME_MOCK, PROPOSED_NAME_2_MOCK],
                      lastRequestTime: null,
                      updateDelay: null,
                    },
                  },
                },
              },
            },
          },
        },
      });

      controller.setName({
        value: VALUE_MOCK,
        type: NameType.ETHEREUM_ADDRESS,
        name: null,
        variation: CHAIN_ID_MOCK,
      });

      expect(controller.state.names).toStrictEqual<
        NameControllerState['names']
      >({
        [NameType.ETHEREUM_ADDRESS]: {
          [VALUE_MOCK]: {
            [CHAIN_ID_MOCK]: {
              name: null,
              sourceId: null,
              origin: null,
              proposedNames: {
                [SOURCE_ID_MOCK]: {
                  proposedNames: [PROPOSED_NAME_MOCK, PROPOSED_NAME_2_MOCK],
                  lastRequestTime: null,
                  updateDelay: null,
                },
              },
            },
          },
        },
      });
    });

    it('stores address as lowercase', () => {
      const provider1 = createMockProvider(1);

      const controller = new NameController({
        ...CONTROLLER_ARGS_MOCK,
        providers: [provider1],
        state: {
          names: {
            [NameType.ETHEREUM_ADDRESS]: {
              [VALUE_MOCK]: {
                [CHAIN_ID_MOCK]: {
                  name: null,
                  sourceId: null,
                  origin: null,
                  proposedNames: {
                    [SOURCE_ID_MOCK]: {
                      proposedNames: [PROPOSED_NAME_MOCK, PROPOSED_NAME_2_MOCK],
                      lastRequestTime: null,
                      updateDelay: null,
                    },
                  },
                },
              },
            },
          },
        },
      });

      controller.setName({
        value: 'tESTvALue',
        type: NameType.ETHEREUM_ADDRESS,
        name: NAME_MOCK,
        sourceId: `${SOURCE_ID_MOCK}1`,
        variation: CHAIN_ID_MOCK,
      });

      expect(controller.state.names).toStrictEqual<
        NameControllerState['names']
      >({
        [NameType.ETHEREUM_ADDRESS]: {
          [VALUE_MOCK]: {
            [CHAIN_ID_MOCK]: {
              name: NAME_MOCK,
              sourceId: `${SOURCE_ID_MOCK}1`,
              origin: NameOrigin.API,
              proposedNames: {
                [SOURCE_ID_MOCK]: {
                  proposedNames: [PROPOSED_NAME_MOCK, PROPOSED_NAME_2_MOCK],
                  lastRequestTime: null,
                  updateDelay: null,
                },
              },
            },
          },
        },
      });
    });

    it('stores origin', () => {
      const provider1 = createMockProvider(1);

      const controller = new NameController({
        ...CONTROLLER_ARGS_MOCK,
        providers: [provider1],
        state: {
          names: {
            [NameType.ETHEREUM_ADDRESS]: {
              [VALUE_MOCK]: {
                [CHAIN_ID_MOCK]: {
                  name: null,
                  sourceId: null,
                  origin: null,
                  proposedNames: {
                    [SOURCE_ID_MOCK]: {
                      proposedNames: [PROPOSED_NAME_MOCK, PROPOSED_NAME_2_MOCK],
                      lastRequestTime: null,
                      updateDelay: null,
                    },
                  },
                },
              },
            },
          },
        },
      });

      controller.setName({
        value: VALUE_MOCK,
        type: NameType.ETHEREUM_ADDRESS,
        name: NAME_MOCK,
        sourceId: `${SOURCE_ID_MOCK}1`,
        origin: NameOrigin.ADDRESS_BOOK,
        variation: CHAIN_ID_MOCK,
      });

      expect(controller.state.names).toStrictEqual<
        NameControllerState['names']
      >({
        [NameType.ETHEREUM_ADDRESS]: {
          [VALUE_MOCK]: {
            [CHAIN_ID_MOCK]: {
              name: NAME_MOCK,
              sourceId: `${SOURCE_ID_MOCK}1`,
              origin: NameOrigin.ADDRESS_BOOK,
              proposedNames: {
                [SOURCE_ID_MOCK]: {
                  proposedNames: [PROPOSED_NAME_MOCK, PROPOSED_NAME_2_MOCK],
                  lastRequestTime: null,
                  updateDelay: null,
                },
              },
            },
          },
        },
      });
    });

    it('does not throw if variation is fallback and type is Ethereum address', () => {
      const controller = new NameController(CONTROLLER_ARGS_MOCK);

      expect(() => {
        controller.setName({
          value: VALUE_MOCK,
          type: NameType.ETHEREUM_ADDRESS,
          name: NAME_MOCK,
          variation: FALLBACK_VARIATION,
        });
      }).not.toThrow();
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
            variation: CHAIN_ID_MOCK,
          } as SetNameRequest),
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
            variation: CHAIN_ID_MOCK,
          } as SetNameRequest),
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
            variation: CHAIN_ID_MOCK,
          } as SetNameRequest),
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
            variation: CHAIN_ID_MOCK,
          } as SetNameRequest),
        ).toThrow('Must specify a non-empty string for sourceId.');
      });

      it.each([
        ['missing', undefined],
        ['empty', ''],
        ['not a string', 12],
        ['not a hexadecimal chain ID', '0x1gh'],
      ])('variation is %s and type is Ethereum address', (_, variation) => {
        const controller = new NameController(CONTROLLER_ARGS_MOCK);

        expect(() =>
          controller.setName({
            value: VALUE_MOCK,
            type: NameType.ETHEREUM_ADDRESS,
            name: NAME_MOCK,
            variation,
          } as SetNameRequest),
        ).toThrow(
          `Must specify a chain ID in hexidecimal format or the fallback, "*", for variation when using 'ethereumAddress' type.`,
        );
      });

      it('source ID is unrecognised for type', () => {
        const controller = new NameController(CONTROLLER_ARGS_MOCK);

        expect(() =>
          controller.setName({
            value: VALUE_MOCK,
            type: NameType.ETHEREUM_ADDRESS,
            name: NAME_MOCK,
            sourceId: SOURCE_ID_MOCK,
            variation: CHAIN_ID_MOCK,
          }),
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
            variation: CHAIN_ID_MOCK,
          }),
        ).toThrow(
          `Cannot specify a source ID when clearing the saved name: ${SOURCE_ID_MOCK}`,
        );
      });

      it('origin is unrecognised', () => {
        const controller = new NameController(CONTROLLER_ARGS_MOCK);

        expect(() =>
          controller.setName({
            value: VALUE_MOCK,
            type: NameType.ETHEREUM_ADDRESS,
            name: NAME_MOCK,
            origin: 'invalid origin' as NameOrigin,
            variation: CHAIN_ID_MOCK,
          }),
        ).toThrow(/Must specify one of the following origins/u);
      });

      it('origin is set but name is being cleared', () => {
        const controller = new NameController(CONTROLLER_ARGS_MOCK);

        expect(() =>
          controller.setName({
            value: VALUE_MOCK,
            type: NameType.ETHEREUM_ADDRESS,
            name: null,
            variation: CHAIN_ID_MOCK,
            origin: NameOrigin.ADDRESS_BOOK,
          }),
        ).toThrow(
          `Cannot specify an origin when clearing the saved name: ${NameOrigin.ADDRESS_BOOK}`,
        );
      });
    });
  });

  describe('updateProposedNames', () => {
    it.each([
      ['', {}],
      [' and no existing type state', { names: {} }],
    ])(
      'creates entry with proposed names if value is new%s',
      async (_, existingState) => {
        const provider1 = createMockProvider(1);
        const provider2 = createMockProvider(2, { updateDelay: 3 });

        const controller = new NameController({
          ...CONTROLLER_ARGS_MOCK,
          providers: [provider1, provider2],
          // @ts-expect-error We are intentionally setting invalid state.
          state: existingState,
        });

        const result = await controller.updateProposedNames({
          value: VALUE_MOCK,
          type: NameType.ETHEREUM_ADDRESS,
          variation: CHAIN_ID_MOCK,
        });

        expect(controller.state.names).toStrictEqual({
          [NameType.ETHEREUM_ADDRESS]: {
            [VALUE_MOCK]: {
              [CHAIN_ID_MOCK]: {
                name: null,
                sourceId: null,
                origin: null,
                proposedNames: {
                  [`${SOURCE_ID_MOCK}1`]: {
                    proposedNames: [
                      `${PROPOSED_NAME_MOCK}1`,
                      `${PROPOSED_NAME_MOCK}1_2`,
                    ],
                    lastRequestTime: TIME_MOCK,
                    updateDelay: null,
                  },
                  [`${SOURCE_ID_MOCK}2`]: {
                    proposedNames: [
                      `${PROPOSED_NAME_MOCK}2`,
                      `${PROPOSED_NAME_MOCK}2_2`,
                    ],
                    lastRequestTime: TIME_MOCK,
                    updateDelay: 3,
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
        state: {
          names: {
            [NameType.ETHEREUM_ADDRESS]: {
              [VALUE_MOCK]: {
                [CHAIN_ID_MOCK]: {
                  name: null,
                  sourceId: null,
                  origin: null,
                  proposedNames: {
                    [`${SOURCE_ID_MOCK}1`]: {
                      proposedNames: ['ShouldBeDeleted1'],
                      lastRequestTime: 12,
                      updateDelay: null,
                    },
                    [`${SOURCE_ID_MOCK}2`]: {
                      proposedNames: ['ShouldBeDeleted2'],
                      lastRequestTime: 12,
                      updateDelay: null,
                    },
                  },
                },
              },
            },
          },
        },
      });

      const result = await controller.updateProposedNames({
        value: VALUE_MOCK,
        type: NameType.ETHEREUM_ADDRESS,
        variation: CHAIN_ID_MOCK,
      });

      expect(controller.state.names).toStrictEqual<
        NameControllerState['names']
      >({
        [NameType.ETHEREUM_ADDRESS]: {
          [VALUE_MOCK]: {
            [CHAIN_ID_MOCK]: {
              name: null,
              sourceId: null,
              origin: null,
              proposedNames: {
                [`${SOURCE_ID_MOCK}1`]: {
                  proposedNames: [
                    `${PROPOSED_NAME_MOCK}1`,
                    `${PROPOSED_NAME_MOCK}1_2`,
                  ],
                  lastRequestTime: TIME_MOCK,
                  updateDelay: null,
                },
                [`${SOURCE_ID_MOCK}2`]: {
                  proposedNames: [
                    `${PROPOSED_NAME_MOCK}2`,
                    `${PROPOSED_NAME_MOCK}2_2`,
                  ],
                  lastRequestTime: TIME_MOCK,
                  updateDelay: null,
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
        state: {
          names: {
            [NameType.ETHEREUM_ADDRESS]: {
              [VALUE_MOCK]: {
                [CHAIN_ID_MOCK]: {
                  name: null,
                  sourceId: null,
                  origin: null,
                  proposedNames: {
                    [`${SOURCE_ID_MOCK}3`]: {
                      proposedNames: ['ShouldBeDeleted3'],
                      lastRequestTime: 12,
                      updateDelay: null,
                    },
                  },
                },
              },
            },
          },
        },
      });

      await controller.updateProposedNames({
        value: VALUE_MOCK,
        type: NameType.ETHEREUM_ADDRESS,
        variation: CHAIN_ID_MOCK,
      });

      expect(controller.state.names).toStrictEqual<
        NameControllerState['names']
      >({
        [NameType.ETHEREUM_ADDRESS]: {
          [VALUE_MOCK]: {
            [CHAIN_ID_MOCK]: {
              name: null,
              sourceId: null,
              origin: null,
              proposedNames: {
                [`${SOURCE_ID_MOCK}1`]: {
                  proposedNames: [
                    `${PROPOSED_NAME_MOCK}1`,
                    `${PROPOSED_NAME_MOCK}1_2`,
                  ],
                  lastRequestTime: TIME_MOCK,
                  updateDelay: null,
                },
                [`${SOURCE_ID_MOCK}2`]: {
                  proposedNames: [
                    `${PROPOSED_NAME_MOCK}2`,
                    `${PROPOSED_NAME_MOCK}2_2`,
                  ],
                  lastRequestTime: TIME_MOCK,
                  updateDelay: null,
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
        variation: CHAIN_ID_MOCK,
      });

      expect(controller.state.names).toStrictEqual<
        NameControllerState['names']
      >({
        [NameType.ETHEREUM_ADDRESS]: {
          [VALUE_MOCK]: {
            [CHAIN_ID_MOCK]: {
              name: null,
              sourceId: null,
              origin: null,
              proposedNames: {
                [`${SOURCE_ID_MOCK}1`]: {
                  proposedNames: [],
                  lastRequestTime: TIME_MOCK,
                  updateDelay: null,
                },
                [`${SOURCE_ID_MOCK}2`]: {
                  proposedNames: [
                    `${PROPOSED_NAME_MOCK}2`,
                    `${PROPOSED_NAME_MOCK}2_2`,
                  ],
                  lastRequestTime: TIME_MOCK,
                  updateDelay: null,
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
        state: {
          nameSources: {
            [`${SOURCE_ID_MOCK}3`]: {
              label: `${SOURCE_LABEL_MOCK}3`,
            },
            [`${SOURCE_ID_MOCK}4`]: {
              label: `${SOURCE_LABEL_MOCK}4`,
            },
          },
        },
      });

      await controller.updateProposedNames({
        value: VALUE_MOCK,
        type: NameType.ETHEREUM_ADDRESS,
        variation: CHAIN_ID_MOCK,
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

    it('stores alternate proposed names for each ethereum address for each variation', async () => {
      const provider1 = createMockProvider(1);
      const provider2 = createMockProvider(2);
      const alternateChainId = `${CHAIN_ID_MOCK}2`;

      const controller = new NameController({
        ...CONTROLLER_ARGS_MOCK,
        providers: [provider1, provider2],
        state: {
          names: {
            [NameType.ETHEREUM_ADDRESS]: {
              [VALUE_MOCK]: {
                [CHAIN_ID_MOCK]: {
                  name: null,
                  sourceId: null,
                  origin: null,
                  proposedNames: {
                    [`${SOURCE_ID_MOCK}1`]: {
                      proposedNames: ['ShouldNotBeDeleted1'],
                      lastRequestTime: 12,
                      updateDelay: null,
                    },
                    [`${SOURCE_ID_MOCK}2`]: {
                      proposedNames: ['ShouldNotBeDeleted2'],
                      lastRequestTime: 12,
                      updateDelay: null,
                    },
                    [`${SOURCE_ID_MOCK}3`]: {
                      proposedNames: ['ShouldNotBeDeleted3'],
                      lastRequestTime: 12,
                      updateDelay: null,
                    },
                  },
                },
              },
            },
          },
        },
      });

      await controller.updateProposedNames({
        value: VALUE_MOCK,
        type: NameType.ETHEREUM_ADDRESS,
        variation: alternateChainId,
      });

      expect(controller.state.names).toStrictEqual<
        NameControllerState['names']
      >({
        [NameType.ETHEREUM_ADDRESS]: {
          [VALUE_MOCK]: {
            [CHAIN_ID_MOCK]: {
              name: null,
              sourceId: null,
              origin: null,
              proposedNames: {
                [`${SOURCE_ID_MOCK}1`]: {
                  proposedNames: ['ShouldNotBeDeleted1'],
                  lastRequestTime: 12,
                  updateDelay: null,
                },
                [`${SOURCE_ID_MOCK}2`]: {
                  proposedNames: ['ShouldNotBeDeleted2'],
                  lastRequestTime: 12,
                  updateDelay: null,
                },
                [`${SOURCE_ID_MOCK}3`]: {
                  proposedNames: ['ShouldNotBeDeleted3'],
                  lastRequestTime: 12,
                  updateDelay: null,
                },
              },
            },
            [alternateChainId]: {
              name: null,
              sourceId: null,
              origin: null,
              proposedNames: {
                [`${SOURCE_ID_MOCK}1`]: {
                  proposedNames: [
                    `${PROPOSED_NAME_MOCK}1`,
                    `${PROPOSED_NAME_MOCK}1_2`,
                  ],
                  lastRequestTime: TIME_MOCK,
                  updateDelay: null,
                },
                [`${SOURCE_ID_MOCK}2`]: {
                  proposedNames: [
                    `${PROPOSED_NAME_MOCK}2`,
                    `${PROPOSED_NAME_MOCK}2_2`,
                  ],
                  lastRequestTime: TIME_MOCK,
                  updateDelay: null,
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
        variation: CHAIN_ID_MOCK,
      });

      expect(controller.state.names).toStrictEqual<
        NameControllerState['names']
      >({
        [NameType.ETHEREUM_ADDRESS]: {
          [VALUE_MOCK]: {
            [CHAIN_ID_MOCK]: {
              name: null,
              sourceId: null,
              origin: null,
              proposedNames: {
                [`${SOURCE_ID_MOCK}1`]: {
                  proposedNames: [
                    `${PROPOSED_NAME_MOCK}1`,
                    `${PROPOSED_NAME_MOCK}1_2`,
                  ],
                  lastRequestTime: TIME_MOCK,
                  updateDelay: null,
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
        // TODO: Replace `any` with type
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);

      const controller = new NameController({
        ...CONTROLLER_ARGS_MOCK,
        providers: [provider1],
      });

      const result = await controller.updateProposedNames({
        value: VALUE_MOCK,
        type: NameType.ETHEREUM_ADDRESS,
        variation: CHAIN_ID_MOCK,
      });

      expect(controller.state.names).toStrictEqual<
        NameControllerState['names']
      >({
        [NameType.ETHEREUM_ADDRESS]: {
          [VALUE_MOCK]: {
            [CHAIN_ID_MOCK]: {
              name: null,
              sourceId: null,
              origin: null,
              proposedNames: {
                [`${SOURCE_ID_MOCK}1`]: {
                  proposedNames: [
                    `${PROPOSED_NAME_MOCK}1`,
                    `${PROPOSED_NAME_MOCK}1_2`,
                  ],
                  lastRequestTime: TIME_MOCK,
                  updateDelay: null,
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

    it('stores address as lowercase', async () => {
      const provider1 = createMockProvider(1);

      const controller = new NameController({
        ...CONTROLLER_ARGS_MOCK,
        providers: [provider1],
        state: {
          names: {
            [NameType.ETHEREUM_ADDRESS]: {
              [VALUE_MOCK]: {
                [CHAIN_ID_MOCK]: {
                  name: NAME_MOCK,
                  sourceId: `${SOURCE_ID_MOCK}1`,
                  origin: NameOrigin.API,
                  proposedNames: {
                    [`${SOURCE_ID_MOCK}1`]: {
                      proposedNames: [],
                      lastRequestTime: null,
                      updateDelay: null,
                    },
                  },
                },
              },
            },
          },
        },
      });

      await controller.updateProposedNames({
        value: 'tESTvALue',
        type: NameType.ETHEREUM_ADDRESS,
        variation: CHAIN_ID_MOCK,
      });

      expect(controller.state.names).toStrictEqual<
        NameControllerState['names']
      >({
        [NameType.ETHEREUM_ADDRESS]: {
          [VALUE_MOCK]: {
            [CHAIN_ID_MOCK]: {
              name: NAME_MOCK,
              sourceId: `${SOURCE_ID_MOCK}1`,
              origin: NameOrigin.API,
              proposedNames: {
                [`${SOURCE_ID_MOCK}1`]: {
                  proposedNames: [
                    `${PROPOSED_NAME_MOCK}1`,
                    `${PROPOSED_NAME_MOCK}1_2`,
                  ],
                  lastRequestTime: TIME_MOCK,
                  updateDelay: null,
                },
              },
            },
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
          state: {
            names: {
              [NameType.ETHEREUM_ADDRESS]: {
                [VALUE_MOCK]: {
                  [CHAIN_ID_MOCK]: {
                    name: null,
                    sourceId: null,
                    origin: null,
                    proposedNames: {
                      [`${SOURCE_ID_MOCK}1`]: {
                        proposedNames: ['ShouldNotBeUpdated1'],
                        lastRequestTime: 11,
                        updateDelay: 1,
                      },
                      [`${SOURCE_ID_MOCK}2`]: {
                        proposedNames: ['ShouldNotBeUpdated2'],
                        lastRequestTime: 12,
                        updateDelay: 2,
                      },
                    },
                  },
                },
              },
            },
          },
        });

        await controller.updateProposedNames({
          value: VALUE_MOCK,
          type: NameType.ETHEREUM_ADDRESS,
          variation: CHAIN_ID_MOCK,
        });

        expect(controller.state.names).toStrictEqual<
          NameControllerState['names']
        >({
          [NameType.ETHEREUM_ADDRESS]: {
            [VALUE_MOCK]: {
              [CHAIN_ID_MOCK]: {
                name: null,
                sourceId: null,
                origin: null,
                proposedNames: {
                  [`${SOURCE_ID_MOCK}1`]: {
                    proposedNames: ['ShouldNotBeUpdated1'],
                    lastRequestTime: TIME_MOCK,
                    updateDelay: null,
                  },
                  [`${SOURCE_ID_MOCK}2`]: {
                    proposedNames: ['ShouldNotBeUpdated2'],
                    lastRequestTime: TIME_MOCK,
                    updateDelay: null,
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
          state: {
            names: {
              [NameType.ETHEREUM_ADDRESS]: {
                [VALUE_MOCK]: {
                  [CHAIN_ID_MOCK]: {
                    name: null,
                    sourceId: null,
                    origin: null,
                    proposedNames: {
                      [`${SOURCE_ID_MOCK}1`]: {
                        proposedNames: ['ShouldNotBeUpdated1'],
                        lastRequestTime: 11,
                        updateDelay: 1,
                      },
                    },
                  },
                },
              },
            },
          },
        });

        await controller.updateProposedNames({
          value: VALUE_MOCK,
          type: NameType.ETHEREUM_ADDRESS,
          variation: CHAIN_ID_MOCK,
        });

        expect(controller.state.names).toStrictEqual<
          NameControllerState['names']
        >({
          [NameType.ETHEREUM_ADDRESS]: {
            [VALUE_MOCK]: {
              [CHAIN_ID_MOCK]: {
                name: null,
                sourceId: null,
                origin: null,
                proposedNames: {
                  [`${SOURCE_ID_MOCK}1`]: {
                    proposedNames: ['ShouldNotBeUpdated1'],
                    lastRequestTime: TIME_MOCK,
                    updateDelay: null,
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
          state: {
            names: {
              [NameType.ETHEREUM_ADDRESS]: {
                [VALUE_MOCK]: {
                  [CHAIN_ID_MOCK]: {
                    name: null,
                    sourceId: null,
                    origin: null,
                    proposedNames: {
                      [`${SOURCE_ID_MOCK}1`]: {
                        proposedNames: ['ShouldNotBeUpdated1'],
                        lastRequestTime: 11,
                        updateDelay: 1,
                      },
                    },
                  },
                },
              },
            },
          },
        });

        await controller.updateProposedNames({
          value: VALUE_MOCK,
          type: NameType.ETHEREUM_ADDRESS,
          variation: CHAIN_ID_MOCK,
        });

        expect(controller.state.names).toStrictEqual<
          NameControllerState['names']
        >({
          [NameType.ETHEREUM_ADDRESS]: {
            [VALUE_MOCK]: {
              [CHAIN_ID_MOCK]: {
                name: null,
                sourceId: null,
                origin: null,
                proposedNames: {
                  [`${SOURCE_ID_MOCK}1`]: {
                    proposedNames: ['ShouldNotBeUpdated1'],
                    lastRequestTime: TIME_MOCK,
                    updateDelay: null,
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
          variation: CHAIN_ID_MOCK,
        });

        expect(controller.state.names).toStrictEqual<
          NameControllerState['names']
        >({
          [NameType.ETHEREUM_ADDRESS]: {
            [VALUE_MOCK]: {
              [CHAIN_ID_MOCK]: {
                name: null,
                sourceId: null,
                origin: null,
                proposedNames: {
                  [`${SOURCE_ID_MOCK}1`]: {
                    proposedNames: [],
                    lastRequestTime: TIME_MOCK,
                    updateDelay: null,
                  },
                  [`${SOURCE_ID_MOCK}2`]: {
                    proposedNames: [
                      `${PROPOSED_NAME_MOCK}2`,
                      `${PROPOSED_NAME_MOCK}2_2`,
                    ],
                    lastRequestTime: TIME_MOCK,
                    updateDelay: null,
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
          variation: CHAIN_ID_MOCK,
        });

        expect(controller.state.names).toStrictEqual<
          NameControllerState['names']
        >({
          [NameType.ETHEREUM_ADDRESS]: {
            [VALUE_MOCK]: {
              [CHAIN_ID_MOCK]: {
                name: null,
                sourceId: null,
                origin: null,
                proposedNames: {
                  [`${SOURCE_ID_MOCK}1`]: {
                    proposedNames: [],
                    lastRequestTime: TIME_MOCK,
                    updateDelay: null,
                  },
                  [`${SOURCE_ID_MOCK}2`]: {
                    proposedNames: [
                      `${PROPOSED_NAME_MOCK}2`,
                      `${PROPOSED_NAME_MOCK}2_2`,
                    ],
                    lastRequestTime: TIME_MOCK,
                    updateDelay: null,
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
          variation: CHAIN_ID_MOCK,
        });

        expect(controller.state.names).toStrictEqual<
          NameControllerState['names']
        >({
          [NameType.ETHEREUM_ADDRESS]: {
            [VALUE_MOCK]: {
              [CHAIN_ID_MOCK]: {
                name: null,
                sourceId: null,
                origin: null,
                proposedNames: {
                  [`${SOURCE_ID_MOCK}1`]: {
                    proposedNames: [],
                    lastRequestTime: TIME_MOCK,
                    updateDelay: null,
                  },
                  [`${SOURCE_ID_MOCK}2`]: {
                    proposedNames: [
                      `${PROPOSED_NAME_MOCK}2`,
                      `${PROPOSED_NAME_MOCK}2_2`,
                    ],
                    lastRequestTime: TIME_MOCK,
                    updateDelay: null,
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
          state: {
            names: {
              [NameType.ETHEREUM_ADDRESS]: {
                [VALUE_MOCK]: {
                  [CHAIN_ID_MOCK]: {
                    name: null,
                    sourceId: null,
                    origin: null,
                    proposedNames: {
                      [`${SOURCE_ID_MOCK}1`]: {
                        proposedNames: ['ShouldNotBeDeleted1'],
                        lastRequestTime: 12,
                        updateDelay: null,
                      },
                      [`${SOURCE_ID_MOCK}2`]: {
                        proposedNames: ['ShouldBeDeleted2'],
                        lastRequestTime: 12,
                        updateDelay: null,
                      },
                      [`${SOURCE_ID_MOCK}3`]: {
                        proposedNames: ['ShouldNotBeDeleted3'],
                        lastRequestTime: 12,
                        updateDelay: null,
                      },
                    },
                  },
                },
              },
            },
          },
        });

        const result = await controller.updateProposedNames({
          value: VALUE_MOCK,
          type: NameType.ETHEREUM_ADDRESS,
          sourceIds: [`${SOURCE_ID_MOCK}2`],
          variation: CHAIN_ID_MOCK,
        });

        expect(controller.state.names).toStrictEqual<
          NameControllerState['names']
        >({
          [NameType.ETHEREUM_ADDRESS]: {
            [VALUE_MOCK]: {
              [CHAIN_ID_MOCK]: {
                name: null,
                sourceId: null,
                origin: null,
                proposedNames: {
                  [`${SOURCE_ID_MOCK}1`]: {
                    proposedNames: [`ShouldNotBeDeleted1`],
                    lastRequestTime: 12,
                    updateDelay: null,
                  },
                  [`${SOURCE_ID_MOCK}2`]: {
                    proposedNames: [
                      `${PROPOSED_NAME_MOCK}2`,
                      `${PROPOSED_NAME_MOCK}2_2`,
                    ],
                    lastRequestTime: TIME_MOCK,
                    updateDelay: null,
                  },
                  [`${SOURCE_ID_MOCK}3`]: {
                    proposedNames: ['ShouldNotBeDeleted3'],
                    lastRequestTime: 12,
                    updateDelay: null,
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
          variation: CHAIN_ID_MOCK,
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
          variation: CHAIN_ID_MOCK,
        });

        expect(provider1.getProposedNames).toHaveBeenCalledTimes(1);
        expect(provider1.getProposedNames).toHaveBeenCalledWith({
          variation: CHAIN_ID_MOCK,
          value: VALUE_MOCK,
          type: NameType.ETHEREUM_ADDRESS,
          sourceIds: [`${SOURCE_ID_MOCK}1`],
        });

        expect(provider2.getProposedNames).toHaveBeenCalledTimes(1);
        expect(provider2.getProposedNames).toHaveBeenCalledWith({
          variation: CHAIN_ID_MOCK,
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
          variation: CHAIN_ID_MOCK,
        });

        expect(controller.state.names).toStrictEqual<
          NameControllerState['names']
        >({
          [NameType.ETHEREUM_ADDRESS]: {
            [VALUE_MOCK]: {
              [CHAIN_ID_MOCK]: {
                name: null,
                sourceId: null,
                origin: null,
                proposedNames: {
                  [`${SOURCE_ID_MOCK}1`]: {
                    proposedNames: [
                      `${PROPOSED_NAME_MOCK}1`,
                      `${PROPOSED_NAME_MOCK}1_2`,
                    ],
                    lastRequestTime: TIME_MOCK,
                    updateDelay: null,
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
            variation: CHAIN_ID_MOCK,
          } as UpdateProposedNamesRequest),
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
            variation: CHAIN_ID_MOCK,
          } as UpdateProposedNamesRequest),
        ).rejects.toThrow(
          `Must specify one of the following types: ${Object.values(
            NameType,
          ).join(', ')}`,
        );
      });

      it.each([
        ['missing', undefined],
        ['empty', ''],
        ['not a string', 12],
        ['not a hexadecimal chain ID', '0x1gh'],
      ])(
        'variation is %s and type is Ethereum address',
        async (_, variation) => {
          const controller = new NameController(CONTROLLER_ARGS_MOCK);

          await expect(() =>
            controller.updateProposedNames({
              value: VALUE_MOCK,
              type: NameType.ETHEREUM_ADDRESS,
              variation,
              // TODO: Replace `any` with type
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } as any),
          ).rejects.toThrow(
            `Must specify a chain ID in hexidecimal format or the fallback, "*", for variation when using 'ethereumAddress' type.`,
          );
        },
      );

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
            variation: CHAIN_ID_MOCK,
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
            variation: CHAIN_ID_MOCK,
          }),
        ).rejects.toThrow(
          `Duplicate source IDs found for type '${NameType.ETHEREUM_ADDRESS}': ${SOURCE_ID_MOCK}1, ${SOURCE_ID_MOCK}2`,
        );
      });
    });

    describe('with onlyUpdateAfterDelay', () => {
      it('does not update if no updateDelay and controller delay not elapsed', async () => {
        const provider1 = createMockProvider(1);
        const provider2 = createMockProvider(2);

        const controller = new NameController({
          ...CONTROLLER_ARGS_MOCK,
          providers: [provider1, provider2],
          updateDelay: 123,
          state: {
            names: {
              [NameType.ETHEREUM_ADDRESS]: {
                [VALUE_MOCK]: {
                  [CHAIN_ID_MOCK]: {
                    name: null,
                    sourceId: null,
                    origin: null,
                    proposedNames: {
                      [`${SOURCE_ID_MOCK}1`]: {
                        proposedNames: ['ShouldNotBeUpdated1'],
                        lastRequestTime: TIME_MOCK - 122,
                        updateDelay: null,
                      },
                      [`${SOURCE_ID_MOCK}2`]: {
                        proposedNames: ['ShouldNotBeUpdated2'],
                        lastRequestTime: TIME_MOCK - 121,
                        updateDelay: null,
                      },
                    },
                  },
                },
              },
            },
          },
        });

        const result = await controller.updateProposedNames({
          value: VALUE_MOCK,
          type: NameType.ETHEREUM_ADDRESS,
          onlyUpdateAfterDelay: true,
          variation: CHAIN_ID_MOCK,
        });

        expect(controller.state.names).toStrictEqual<
          NameControllerState['names']
        >({
          [NameType.ETHEREUM_ADDRESS]: {
            [VALUE_MOCK]: {
              [CHAIN_ID_MOCK]: {
                name: null,
                sourceId: null,
                origin: null,
                proposedNames: {
                  [`${SOURCE_ID_MOCK}1`]: {
                    proposedNames: ['ShouldNotBeUpdated1'],
                    lastRequestTime: TIME_MOCK - 122,
                    updateDelay: null,
                  },
                  [`${SOURCE_ID_MOCK}2`]: {
                    proposedNames: ['ShouldNotBeUpdated2'],
                    lastRequestTime: TIME_MOCK - 121,
                    updateDelay: null,
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

      it('does not update if updateDelay not elapsed', async () => {
        const provider1 = createMockProvider(1);
        const provider2 = createMockProvider(2);

        const controller = new NameController({
          ...CONTROLLER_ARGS_MOCK,
          providers: [provider1, provider2],
          state: {
            names: {
              [NameType.ETHEREUM_ADDRESS]: {
                [VALUE_MOCK]: {
                  [CHAIN_ID_MOCK]: {
                    name: null,
                    sourceId: null,
                    origin: null,
                    proposedNames: {
                      [`${SOURCE_ID_MOCK}1`]: {
                        proposedNames: ['ShouldNotBeUpdated1'],
                        lastRequestTime: TIME_MOCK - 9,
                        updateDelay: 10,
                      },
                      [`${SOURCE_ID_MOCK}2`]: {
                        proposedNames: ['ShouldNotBeUpdated2'],
                        lastRequestTime: TIME_MOCK - 6,
                        updateDelay: 7,
                      },
                    },
                  },
                },
              },
            },
          },
        });

        const result = await controller.updateProposedNames({
          value: VALUE_MOCK,
          type: NameType.ETHEREUM_ADDRESS,
          onlyUpdateAfterDelay: true,
          variation: CHAIN_ID_MOCK,
        });

        expect(controller.state.names).toStrictEqual<
          NameControllerState['names']
        >({
          [NameType.ETHEREUM_ADDRESS]: {
            [VALUE_MOCK]: {
              [CHAIN_ID_MOCK]: {
                name: null,
                sourceId: null,
                origin: null,
                proposedNames: {
                  [`${SOURCE_ID_MOCK}1`]: {
                    proposedNames: ['ShouldNotBeUpdated1'],
                    lastRequestTime: TIME_MOCK - 9,
                    updateDelay: 10,
                  },
                  [`${SOURCE_ID_MOCK}2`]: {
                    proposedNames: ['ShouldNotBeUpdated2'],
                    lastRequestTime: TIME_MOCK - 6,
                    updateDelay: 7,
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

      it('updates if controller delay elapsed', async () => {
        const provider1 = createMockProvider(1);
        const provider2 = createMockProvider(2);

        const controller = new NameController({
          ...CONTROLLER_ARGS_MOCK,
          providers: [provider1, provider2],
          updateDelay: 123,
          state: {
            names: {
              [NameType.ETHEREUM_ADDRESS]: {
                [VALUE_MOCK]: {
                  [CHAIN_ID_MOCK]: {
                    name: null,
                    sourceId: null,
                    origin: null,
                    proposedNames: {
                      [`${SOURCE_ID_MOCK}1`]: {
                        proposedNames: ['ShouldNotBeUpdated1'],
                        lastRequestTime: TIME_MOCK - 123,
                        updateDelay: null,
                      },
                      [`${SOURCE_ID_MOCK}2`]: {
                        proposedNames: ['ShouldNotBeUpdated2'],
                        lastRequestTime: TIME_MOCK - 124,
                        updateDelay: null,
                      },
                    },
                  },
                },
              },
            },
          },
        });

        const result = await controller.updateProposedNames({
          value: VALUE_MOCK,
          type: NameType.ETHEREUM_ADDRESS,
          onlyUpdateAfterDelay: true,
          variation: CHAIN_ID_MOCK,
        });

        expect(controller.state.names).toStrictEqual<
          NameControllerState['names']
        >({
          [NameType.ETHEREUM_ADDRESS]: {
            [VALUE_MOCK]: {
              [CHAIN_ID_MOCK]: {
                name: null,
                sourceId: null,
                origin: null,
                proposedNames: {
                  [`${SOURCE_ID_MOCK}1`]: {
                    proposedNames: [
                      `${PROPOSED_NAME_MOCK}1`,
                      `${PROPOSED_NAME_MOCK}1_2`,
                    ],
                    lastRequestTime: TIME_MOCK,
                    updateDelay: null,
                  },
                  [`${SOURCE_ID_MOCK}2`]: {
                    proposedNames: [
                      `${PROPOSED_NAME_MOCK}2`,
                      `${PROPOSED_NAME_MOCK}2_2`,
                    ],
                    lastRequestTime: TIME_MOCK,
                    updateDelay: null,
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

      it('updates if updateDelay elapsed', async () => {
        const provider1 = createMockProvider(1);
        const provider2 = createMockProvider(2);

        const controller = new NameController({
          ...CONTROLLER_ARGS_MOCK,
          providers: [provider1, provider2],
          state: {
            names: {
              [NameType.ETHEREUM_ADDRESS]: {
                [VALUE_MOCK]: {
                  [CHAIN_ID_MOCK]: {
                    name: null,
                    sourceId: null,
                    origin: null,
                    proposedNames: {
                      [`${SOURCE_ID_MOCK}1`]: {
                        proposedNames: ['ShouldNotBeUpdated1'],
                        lastRequestTime: TIME_MOCK - 10,
                        updateDelay: 10,
                      },
                      [`${SOURCE_ID_MOCK}2`]: {
                        proposedNames: ['ShouldNotBeUpdated2'],
                        lastRequestTime: TIME_MOCK - 16,
                        updateDelay: 15,
                      },
                    },
                  },
                },
              },
            },
          },
        });

        const result = await controller.updateProposedNames({
          value: VALUE_MOCK,
          type: NameType.ETHEREUM_ADDRESS,
          onlyUpdateAfterDelay: true,
          variation: CHAIN_ID_MOCK,
        });

        expect(controller.state.names).toStrictEqual<
          NameControllerState['names']
        >({
          [NameType.ETHEREUM_ADDRESS]: {
            [VALUE_MOCK]: {
              [CHAIN_ID_MOCK]: {
                name: null,
                sourceId: null,
                origin: null,
                proposedNames: {
                  [`${SOURCE_ID_MOCK}1`]: {
                    proposedNames: [
                      `${PROPOSED_NAME_MOCK}1`,
                      `${PROPOSED_NAME_MOCK}1_2`,
                    ],
                    lastRequestTime: TIME_MOCK,
                    updateDelay: null,
                  },
                  [`${SOURCE_ID_MOCK}2`]: {
                    proposedNames: [
                      `${PROPOSED_NAME_MOCK}2`,
                      `${PROPOSED_NAME_MOCK}2_2`,
                    ],
                    lastRequestTime: TIME_MOCK,
                    updateDelay: null,
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
          state: {
            // @ts-expect-error We are intentionally setting invalid state.
            names: {},
          },
        });

        const result = await controller.updateProposedNames({
          value: VALUE_MOCK,
          type: NameType.ETHEREUM_ADDRESS,
          onlyUpdateAfterDelay: true,
          variation: CHAIN_ID_MOCK,
        });

        expect(controller.state.names).toStrictEqual<
          NameControllerState['names']
        >({
          [NameType.ETHEREUM_ADDRESS]: {
            [VALUE_MOCK]: {
              [CHAIN_ID_MOCK]: {
                name: null,
                sourceId: null,
                origin: null,
                proposedNames: {
                  [`${SOURCE_ID_MOCK}1`]: {
                    proposedNames: [
                      `${PROPOSED_NAME_MOCK}1`,
                      `${PROPOSED_NAME_MOCK}1_2`,
                    ],
                    lastRequestTime: TIME_MOCK,
                    updateDelay: null,
                  },
                  [`${SOURCE_ID_MOCK}2`]: {
                    proposedNames: [
                      `${PROPOSED_NAME_MOCK}2`,
                      `${PROPOSED_NAME_MOCK}2_2`,
                    ],
                    lastRequestTime: TIME_MOCK,
                    updateDelay: null,
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

    describe('removes entries', () => {
      it('if all proposed names are expired', async () => {
        const provider1 = createMockProvider(1);
        const provider2 = createMockProvider(2);

        const controller = new NameController({
          ...CONTROLLER_ARGS_MOCK,
          providers: [provider1, provider2],
          state: {
            names: {
              [NameType.ETHEREUM_ADDRESS]: {
                [VALUE_MOCK]: {
                  [CHAIN_ID_MOCK]: {
                    name: null,
                    sourceId: null,
                    origin: null,
                    proposedNames: {
                      [`${SOURCE_ID_MOCK}1`]: {
                        proposedNames: ['ExpiredName'],
                        lastRequestTime:
                          TIME_MOCK - PROPOSED_NAME_EXPIRE_DURATION - 1,
                        updateDelay: null,
                      },
                      [`${SOURCE_ID_MOCK}2`]: {
                        proposedNames: ['AnotherExpiredName'],
                        lastRequestTime:
                          TIME_MOCK - PROPOSED_NAME_EXPIRE_DURATION - 2,
                        updateDelay: null,
                      },
                    },
                  },
                },
              },
            },
          },
        });

        await controller.updateProposedNames({
          value: 'another value',
          type: NameType.ETHEREUM_ADDRESS,
          variation: CHAIN_ID_MOCK,
        });

        expect(
          controller.state.names[NameType.ETHEREUM_ADDRESS][VALUE_MOCK][
            CHAIN_ID_MOCK
          ],
        ).toBeUndefined();
      });

      it('if all proposed names are expired then updates entry with new proposed names', async () => {
        const provider1 = createMockProvider(1);
        const provider2 = createMockProvider(2);

        const controller = new NameController({
          ...CONTROLLER_ARGS_MOCK,
          providers: [provider1, provider2],
          state: {
            names: {
              [NameType.ETHEREUM_ADDRESS]: {
                [`${VALUE_MOCK}1`]: {
                  [CHAIN_ID_MOCK]: {
                    name: null,
                    sourceId: null,
                    origin: null,
                    proposedNames: {
                      [`${SOURCE_ID_MOCK}1`]: {
                        proposedNames: ['NotExpiredName'],
                        lastRequestTime: null,
                        updateDelay: null,
                      },
                    },
                  },
                },
                [VALUE_MOCK]: {
                  [CHAIN_ID_MOCK]: {
                    name: null,
                    sourceId: null,
                    origin: null,
                    proposedNames: {
                      [`${SOURCE_ID_MOCK}1`]: {
                        proposedNames: ['ExpiredName'],
                        lastRequestTime:
                          TIME_MOCK - PROPOSED_NAME_EXPIRE_DURATION - 1,
                        updateDelay: null,
                      },
                      [`${SOURCE_ID_MOCK}2`]: {
                        proposedNames: ['AnotherExpiredName'],
                        lastRequestTime: null,
                        updateDelay: null,
                      },
                    },
                  },
                },
              },
            },
          },
        });

        await controller.updateProposedNames({
          value: VALUE_MOCK,
          type: NameType.ETHEREUM_ADDRESS,
          variation: CHAIN_ID_MOCK,
        });

        expect(controller.state.names).toStrictEqual<
          NameControllerState['names']
        >({
          [NameType.ETHEREUM_ADDRESS]: {
            [`${VALUE_MOCK}1`]: {
              [CHAIN_ID_MOCK]: {
                name: null,
                sourceId: null,
                origin: null,
                proposedNames: {
                  [`${SOURCE_ID_MOCK}1`]: {
                    proposedNames: ['NotExpiredName'],
                    lastRequestTime: null,
                    updateDelay: null,
                  },
                },
              },
            },
            [VALUE_MOCK]: {
              [CHAIN_ID_MOCK]: {
                name: null,
                sourceId: null,
                origin: null,
                proposedNames: {
                  [`${SOURCE_ID_MOCK}1`]: {
                    proposedNames: [
                      `${PROPOSED_NAME_MOCK}1`,
                      `${PROPOSED_NAME_MOCK}1_2`,
                    ],
                    lastRequestTime: TIME_MOCK,
                    updateDelay: null,
                  },
                  [`${SOURCE_ID_MOCK}2`]: {
                    proposedNames: [
                      `${PROPOSED_NAME_MOCK}2`,
                      `${PROPOSED_NAME_MOCK}2_2`,
                    ],
                    lastRequestTime: TIME_MOCK,
                    updateDelay: null,
                  },
                },
              },
            },
          },
        });
      });
    });

    describe('does not remove entries', () => {
      it('if any proposed name is not expired yet', async () => {
        const provider1 = createMockProvider(1);
        const provider2 = createMockProvider(2);

        const controller = new NameController({
          ...CONTROLLER_ARGS_MOCK,
          providers: [provider1, provider2],
          state: {
            names: {
              [NameType.ETHEREUM_ADDRESS]: {
                [VALUE_MOCK]: {
                  [CHAIN_ID_MOCK]: {
                    name: null,
                    sourceId: null,
                    origin: null,
                    proposedNames: {
                      [`${SOURCE_ID_MOCK}1`]: {
                        proposedNames: ['ExpiredName'],
                        lastRequestTime:
                          TIME_MOCK - PROPOSED_NAME_EXPIRE_DURATION - 1,
                        updateDelay: null,
                      },
                      [`${SOURCE_ID_MOCK}2`]: {
                        proposedNames: ['NotExpiredName'],
                        lastRequestTime:
                          TIME_MOCK - PROPOSED_NAME_EXPIRE_DURATION + 1,
                        updateDelay: null,
                      },
                    },
                  },
                },
              },
            },
          },
        });

        await controller.updateProposedNames({
          value: 'another value',
          type: NameType.ETHEREUM_ADDRESS,
          variation: CHAIN_ID_MOCK,
        });

        expect(controller.state.names[NameType.ETHEREUM_ADDRESS]).toStrictEqual(
          expect.objectContaining({
            [VALUE_MOCK]: {
              [CHAIN_ID_MOCK]: {
                name: null,
                sourceId: null,
                origin: null,
                proposedNames: {
                  [`${SOURCE_ID_MOCK}1`]: {
                    proposedNames: ['ExpiredName'],
                    lastRequestTime:
                      TIME_MOCK - PROPOSED_NAME_EXPIRE_DURATION - 1,
                    updateDelay: null,
                  },
                  [`${SOURCE_ID_MOCK}2`]: {
                    proposedNames: ['NotExpiredName'],
                    lastRequestTime:
                      TIME_MOCK - PROPOSED_NAME_EXPIRE_DURATION + 1,
                    updateDelay: null,
                  },
                },
              },
            },
          }),
        );
      });

      it('if name is defined', async () => {
        const provider1 = createMockProvider(1);
        const provider2 = createMockProvider(2);

        const controller = new NameController({
          ...CONTROLLER_ARGS_MOCK,
          providers: [provider1, provider2],
          state: {
            names: {
              [NameType.ETHEREUM_ADDRESS]: {
                [VALUE_MOCK]: {
                  [CHAIN_ID_MOCK]: {
                    name: 'A defined name',
                    sourceId: null,
                    origin: null,
                    proposedNames: {
                      [`${SOURCE_ID_MOCK}1`]: {
                        proposedNames: ['ExpiredName'],
                        lastRequestTime:
                          TIME_MOCK - PROPOSED_NAME_EXPIRE_DURATION - 1,
                        updateDelay: null,
                      },
                    },
                  },
                },
              },
            },
          },
        });

        await controller.updateProposedNames({
          value: 'another value',
          type: NameType.ETHEREUM_ADDRESS,
          variation: CHAIN_ID_MOCK,
        });

        expect(controller.state.names[NameType.ETHEREUM_ADDRESS]).toStrictEqual(
          expect.objectContaining({
            [VALUE_MOCK]: {
              [CHAIN_ID_MOCK]: {
                name: 'A defined name',
                sourceId: null,
                origin: null,
                proposedNames: {
                  [`${SOURCE_ID_MOCK}1`]: {
                    proposedNames: ['ExpiredName'],
                    lastRequestTime:
                      TIME_MOCK - PROPOSED_NAME_EXPIRE_DURATION - 1,
                    updateDelay: null,
                  },
                },
              },
            },
          }),
        );
      });
    });
  });
});
