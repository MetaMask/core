import { Messenger } from '@metamask/base-controller';

import type { SamplePetnamesControllerMessenger } from './sample-petnames-controller';
import { SamplePetnamesController } from './sample-petnames-controller';
import type {
  ExtractAvailableAction,
  ExtractAvailableEvent,
} from '../../base-controller/tests/helpers';
import { PROTOTYPE_POLLUTION_BLOCKLIST } from '../../controller-utils/src/util';

describe('SamplePetnamesController', () => {
  describe('constructor', () => {
    it('uses all of the given state properties to initialize state', async () => {
      const givenState = {
        namesByChainIdAndAddress: {
          '0x1': {
            '0xabcdef1': 'Primary Account',
            '0xabcdef2': 'Secondary Account',
          },
        },
      };

      await withController({ state: givenState }, ({ controller }) => {
        expect(controller.state).toStrictEqual(givenState);
      });
    });

    it('fills in missing state properties with default values', async () => {
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
        await withController(({ unrestrictedMessenger }) => {
          expect(() =>
            unrestrictedMessenger.call(
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
          state: {
            namesByChainIdAndAddress: {
              '0x1': {
                '0xaaaaaa': 'Account 1',
              },
            },
          },
        },
        async ({ controller, unrestrictedMessenger }) => {
          unrestrictedMessenger.call(
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
      await withController(async ({ controller, unrestrictedMessenger }) => {
        unrestrictedMessenger.call(
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
          state: {
            namesByChainIdAndAddress: {
              '0x1': {
                '0xaaaaaa': 'Account 1',
              },
            },
          },
        },
        async ({ controller, unrestrictedMessenger }) => {
          unrestrictedMessenger.call(
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
      await withController(async ({ controller, unrestrictedMessenger }) => {
        unrestrictedMessenger.call(
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
          state: {
            namesByChainIdAndAddress: {
              '0x1': {
                '0xaaaaaa': 'Account 1',
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
});

/**
 * The type of the messenger where all actions and events will be registered.
 */
type UnrestrictedMessenger = Messenger<
  ExtractAvailableAction<SamplePetnamesControllerMessenger>,
  ExtractAvailableEvent<SamplePetnamesControllerMessenger>
>;

/**
 * The callback that `withController` calls.
 */
type WithControllerCallback<ReturnValue> = ({
  controller,
}: {
  controller: SamplePetnamesController;
  unrestrictedMessenger: UnrestrictedMessenger;
  restrictedMessenger: SamplePetnamesControllerMessenger;
}) => Promise<ReturnValue> | ReturnValue;

/**
 * The options that `withController` take.
 */
type WithControllerOptions = Partial<
  ConstructorParameters<typeof SamplePetnamesController>[0]
>;

/**
 * The arguments that `withController` takes.
 */
type WithControllerArgs<ReturnValue> =
  | [WithControllerCallback<ReturnValue>]
  | [WithControllerOptions, WithControllerCallback<ReturnValue>];

/**
 * Constructs the unrestricted messenger for these tests. This is where all
 * actions and events will ultimately be registered.
 *
 * @returns The unrestricted messenger.
 */
function buildUnrestrictedMessenger(): UnrestrictedMessenger {
  return new Messenger();
}

/**
 * Constructs the messenger suited for SamplePetnamesController.
 *
 * @param unrestrictedMessenger - The messenger from which the controller
 * messenger will be derived.
 * @returns The restricted messenger.
 */
function buildRestrictedMessenger(
  unrestrictedMessenger = buildUnrestrictedMessenger(),
): SamplePetnamesControllerMessenger {
  return unrestrictedMessenger.getRestricted({
    name: 'SamplePetnamesController',
    allowedActions: [],
    allowedEvents: [],
  });
}

/**
 * Constructs a SamplePetnamesController based on the given options, and calls
 * the given function with that controller.
 *
 * @param args - Either a function, or an options bag + a function. The options
 * bag is equivalent to the options that the controller takes, but `messenger`
 * is filled in if not given. The function will be called with the built
 * controller, unrestricted messenger, and restricted messenger.
 * @returns The same return value as the given callback.
 */
async function withController<ReturnValue>(
  ...args: WithControllerArgs<ReturnValue>
): Promise<ReturnValue> {
  const [{ ...rest }, fn] = args.length === 2 ? args : [{}, args[0]];
  const unrestrictedMessenger = buildUnrestrictedMessenger();
  const restrictedMessenger = buildRestrictedMessenger(unrestrictedMessenger);
  const controller = new SamplePetnamesController({
    messenger: restrictedMessenger,
    ...rest,
  });
  return await fn({ controller, unrestrictedMessenger, restrictedMessenger });
}
