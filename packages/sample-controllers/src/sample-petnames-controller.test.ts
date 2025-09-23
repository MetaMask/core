import { Messenger, deriveStateFromMetadata } from '@metamask/base-controller';

import type { SamplePetnamesControllerMessenger } from './sample-petnames-controller';
import { SamplePetnamesController } from './sample-petnames-controller';
import type {
  ExtractAvailableAction,
  ExtractAvailableEvent,
} from '../../base-controller/tests/helpers';
import { PROTOTYPE_POLLUTION_BLOCKLIST } from '../../controller-utils/src/util';

describe('SamplePetnamesController', () => {
  describe('constructor', () => {
    it('accepts initial state', async () => {
      const givenState = {
        namesByChainIdAndAddress: {
          '0x1': {
            '0xabcdef1': 'Primary Account',
            '0xabcdef2': 'Secondary Account',
          },
        },
      };

      await withController(
        { options: { state: givenState } },
        ({ controller }) => {
          expect(controller.state).toStrictEqual(givenState);
        },
      );
    });

    it('fills in missing initial state with defaults', async () => {
      await withController(({ controller }) => {
        expect(controller.state).toMatchInlineSnapshot(`
          Object {
            "namesByChainIdAndAddress": Object {},
          }
        `);
      });
    });
  });

  describe('SamplePetnamesController:assignPetname', () => {
    for (const blockedKey of PROTOTYPE_POLLUTION_BLOCKLIST) {
      it(`throws if given a chainId of "${blockedKey}"`, async () => {
        await withController(({ rootMessenger }) => {
          expect(() =>
            rootMessenger.call(
              'SamplePetnamesController:assignPetname',
              // @ts-expect-error We are intentionally passing bad input.
              blockedKey,
              '0xbbbbbb',
              'Account 2',
            ),
          ).toThrow('Invalid chain ID');
        });
      });
    }

    it('registers the given pet name in state with the given chain ID and address', async () => {
      await withController(
        {
          options: {
            state: {
              namesByChainIdAndAddress: {
                '0x1': {
                  '0xaaaaaa': 'Account 1',
                },
              },
            },
          },
        },
        async ({ controller, rootMessenger }) => {
          rootMessenger.call(
            'SamplePetnamesController:assignPetname',
            '0x1',
            '0xbbbbbb',
            'Account 2',
          );

          expect(controller.state).toStrictEqual({
            namesByChainIdAndAddress: {
              '0x1': {
                '0xaaaaaa': 'Account 1',
                '0xbbbbbb': 'Account 2',
              },
            },
          });
        },
      );
    });

    it("creates a new group for the chain if it doesn't already exist", async () => {
      await withController(async ({ controller, rootMessenger }) => {
        rootMessenger.call(
          'SamplePetnamesController:assignPetname',
          '0x1',
          '0xaaaaaa',
          'My Account',
        );

        expect(controller.state).toStrictEqual({
          namesByChainIdAndAddress: {
            '0x1': {
              '0xaaaaaa': 'My Account',
            },
          },
        });
      });
    });

    it('overwrites any existing pet name for the address', async () => {
      await withController(
        {
          options: {
            state: {
              namesByChainIdAndAddress: {
                '0x1': {
                  '0xaaaaaa': 'Account 1',
                },
              },
            },
          },
        },
        async ({ controller, rootMessenger }) => {
          rootMessenger.call(
            'SamplePetnamesController:assignPetname',
            '0x1',
            '0xaaaaaa',
            'Old Account',
          );

          expect(controller.state).toStrictEqual({
            namesByChainIdAndAddress: {
              '0x1': {
                '0xaaaaaa': 'Old Account',
              },
            },
          });
        },
      );
    });

    it('lowercases the given address before registering it to avoid duplicate entries', async () => {
      await withController(async ({ controller, rootMessenger }) => {
        rootMessenger.call(
          'SamplePetnamesController:assignPetname',
          '0x1',
          '0xAAAAAA',
          'Account 1',
        );

        expect(controller.state).toStrictEqual({
          namesByChainIdAndAddress: {
            '0x1': {
              '0xaaaaaa': 'Account 1',
            },
          },
        });
      });
    });
  });

  describe('assignPetname', () => {
    it('does the same thing as the messenger action', async () => {
      await withController(
        {
          options: {
            state: {
              namesByChainIdAndAddress: {
                '0x1': {
                  '0xaaaaaa': 'Account 1',
                },
              },
            },
          },
        },
        async ({ controller }) => {
          controller.assignPetname('0x1', '0xbbbbbb', 'Account 2');

          expect(controller.state).toStrictEqual({
            namesByChainIdAndAddress: {
              '0x1': {
                '0xaaaaaa': 'Account 1',
                '0xbbbbbb': 'Account 2',
              },
            },
          });
        },
      );
    });
  });

  describe('metadata', () => {
    it('includes expected state in debug snapshots', async () => {
      await withController(({ controller }) => {
        expect(
          deriveStateFromMetadata(
            controller.state,
            controller.metadata,
            'anonymous',
          ),
        ).toMatchInlineSnapshot(`Object {}`);
      });
    });

    it('includes expected state in state logs', async () => {
      await withController(({ controller }) => {
        expect(
          deriveStateFromMetadata(
            controller.state,
            controller.metadata,
            'includeInStateLogs',
          ),
        ).toMatchInlineSnapshot(`
          Object {
            "namesByChainIdAndAddress": Object {},
          }
        `);
      });
    });

    it('persists expected state', async () => {
      await withController(({ controller }) => {
        expect(
          deriveStateFromMetadata(
            controller.state,
            controller.metadata,
            'persist',
          ),
        ).toMatchInlineSnapshot(`
          Object {
            "namesByChainIdAndAddress": Object {},
          }
        `);
      });
    });

    it('exposes expected state to UI', async () => {
      await withController(({ controller }) => {
        expect(
          deriveStateFromMetadata(
            controller.state,
            controller.metadata,
            'usedInUi',
          ),
        ).toMatchInlineSnapshot(`
          Object {
            "namesByChainIdAndAddress": Object {},
          }
        `);
      });
    });
  });
});

/**
 * The type of the messenger populated with all external actions and events
 * required by the controller under test.
 */
type RootMessenger = Messenger<
  ExtractAvailableAction<SamplePetnamesControllerMessenger>,
  ExtractAvailableEvent<SamplePetnamesControllerMessenger>
>;

/**
 * The callback that `withController` calls.
 */
type WithControllerCallback<ReturnValue> = (payload: {
  controller: SamplePetnamesController;
  rootMessenger: RootMessenger;
  controllerMessenger: SamplePetnamesControllerMessenger;
}) => Promise<ReturnValue> | ReturnValue;

/**
 * The options that `withController` takes.
 */
type WithControllerOptions = {
  options: Partial<ConstructorParameters<typeof SamplePetnamesController>[0]>;
};

/**
 * Constructs the messenger populated with all external actions and events
 * required by the controller under test.
 *
 * @returns The root messenger.
 */
function getRootMessenger(): RootMessenger {
  return new Messenger();
}

/**
 * Constructs the messenger for the controller under test.
 *
 * @param rootMessenger - The root messenger, with all external actions and
 * events required by the controller's messenger.
 * @returns The controller-specific messenger.
 */
function getMessenger(
  rootMessenger: RootMessenger,
): SamplePetnamesControllerMessenger {
  return rootMessenger.getRestricted({
    name: 'SamplePetnamesController',
    allowedActions: [],
    allowedEvents: [],
  });
}

/**
 * Wrap tests for the controller under test by ensuring that the controller is
 * created ahead of time and then safely destroyed afterward as needed.
 *
 * @param args - Either a function, or an options bag + a function. The options
 * bag contains arguments for the controller constructor. All constructor
 * arguments are optional and will be filled in with defaults in as needed
 * (including `messenger`). The function is called with the instantiated
 * controller, root messenger, and controller messenger.
 * @returns The same return value as the given function.
 */
async function withController<ReturnValue>(
  ...args:
    | [WithControllerCallback<ReturnValue>]
    | [WithControllerOptions, WithControllerCallback<ReturnValue>]
): Promise<ReturnValue> {
  const [{ options = {} }, testFunction] =
    args.length === 2 ? args : [{}, args[0]];
  const rootMessenger = getRootMessenger();
  const controllerMessenger = getMessenger(rootMessenger);
  const controller = new SamplePetnamesController({
    messenger: controllerMessenger,
    ...options,
  });
  return await testFunction({ controller, rootMessenger, controllerMessenger });
}
