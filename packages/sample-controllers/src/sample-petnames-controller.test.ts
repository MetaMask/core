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
    it('uses all of the given state properties to initialize state', () => {
      const givenState = {
        namesByChainIdAndAddress: {
          '0x1': {
            '0xabcdef1': 'Primary Account',
            '0xabcdef2': 'Secondary Account',
          },
        },
      };
      const controller = new SamplePetnamesController({
        messenger: getMessenger(),
        state: givenState,
      });

      expect(controller.state).toStrictEqual(givenState);
    });

    it('fills in missing state properties with default values', () => {
      const controller = new SamplePetnamesController({
        messenger: getMessenger(),
      });

      expect(controller.state).toMatchInlineSnapshot(`
        Object {
          "namesByChainIdAndAddress": Object {},
        }
      `);
    });
  });

  describe('assignPetname', () => {
    for (const blockedKey of PROTOTYPE_POLLUTION_BLOCKLIST) {
      it(`throws if given a chainId of "${blockedKey}"`, () => {
        const controller = new SamplePetnamesController({
          messenger: getMessenger(),
        });

        expect(() =>
          // @ts-expect-error We are intentionally passing bad input.
          controller.assignPetname(blockedKey, '0xbbbbbb', 'Account 2'),
        ).toThrow('Invalid chain ID');
      });
    }

    it('registers the given pet name in state with the given chain ID and address', () => {
      const controller = new SamplePetnamesController({
        messenger: getMessenger(),
        state: {
          namesByChainIdAndAddress: {
            '0x1': {
              '0xaaaaaa': 'Account 1',
            },
          },
        },
      });

      controller.assignPetname('0x1', '0xbbbbbb', 'Account 2');

      expect(controller.state).toStrictEqual({
        namesByChainIdAndAddress: {
          '0x1': {
            '0xaaaaaa': 'Account 1',
            '0xbbbbbb': 'Account 2',
          },
        },
      });
    });

    it("creates a new group for the chain if it doesn't already exist", () => {
      const controller = new SamplePetnamesController({
        messenger: getMessenger(),
      });

      controller.assignPetname('0x1', '0xaaaaaa', 'My Account');

      expect(controller.state).toStrictEqual({
        namesByChainIdAndAddress: {
          '0x1': {
            '0xaaaaaa': 'My Account',
          },
        },
      });
    });

    it('overwrites any existing pet name for the address', () => {
      const controller = new SamplePetnamesController({
        messenger: getMessenger(),
        state: {
          namesByChainIdAndAddress: {
            '0x1': {
              '0xaaaaaa': 'Account 1',
            },
          },
        },
      });

      controller.assignPetname('0x1', '0xaaaaaa', 'Old Account');

      expect(controller.state).toStrictEqual({
        namesByChainIdAndAddress: {
          '0x1': {
            '0xaaaaaa': 'Old Account',
          },
        },
      });
    });

    it('lowercases the given address before registering it to avoid duplicate entries', () => {
      const controller = new SamplePetnamesController({
        messenger: getMessenger(),
        state: {
          namesByChainIdAndAddress: {
            '0x1': {
              '0xaaaaaa': 'Account 1',
            },
          },
        },
      });

      controller.assignPetname('0x1', '0xAAAAAA', 'Old Account');

      expect(controller.state).toStrictEqual({
        namesByChainIdAndAddress: {
          '0x1': {
            '0xaaaaaa': 'Old Account',
          },
        },
      });
    });
  });
});

/**
 * The union of actions that the root messenger allows.
 */
type RootAction = ExtractAvailableAction<SamplePetnamesControllerMessenger>;

/**
 * The union of events that the root messenger allows.
 */
type RootEvent = ExtractAvailableEvent<SamplePetnamesControllerMessenger>;

/**
 * Constructs the unrestricted messenger. This can be used to call actions and
 * publish events within the tests for this controller.
 *
 * @returns The unrestricted messenger suited for SamplePetnamesController.
 */
function getRootMessenger(): Messenger<RootAction, RootEvent> {
  return new Messenger<RootAction, RootEvent>();
}

/**
 * Constructs the messenger which is restricted to relevant SamplePetnamesController
 * actions and events.
 *
 * @param rootMessenger - The root messenger to restrict.
 * @returns The restricted messenger.
 */
function getMessenger(
  rootMessenger = getRootMessenger(),
): SamplePetnamesControllerMessenger {
  return rootMessenger.getRestricted({
    name: 'SamplePetnamesController',
    allowedActions: [],
    allowedEvents: [],
  });
}
