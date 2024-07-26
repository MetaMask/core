import { ControllerMessenger } from '@metamask/base-controller';

import type {
  ExtractAvailableAction,
  ExtractAvailableEvent,
} from '../../../packages/base-controller/tests/helpers';
import { PROTOTYPE_POLLUTION_BLOCKLIST } from '../../../packages/controller-utils/src/util';
import type { PetNamesControllerMessenger } from './pet-names-controller';
import { PetNamesController } from './pet-names-controller';

describe('PetNamesController', () => {
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
      const controller = new PetNamesController({
        messenger: getControllerMessenger(),
        state: givenState,
      });

      expect(controller.state).toStrictEqual(givenState);
    });

    it('fills in missing state properties with default values', () => {
      const controller = new PetNamesController({
        messenger: getControllerMessenger(),
      });

      expect(controller.state).toMatchInlineSnapshot(`
        Object {
          "namesByChainIdAndAddress": Object {},
        }
      `);
    });
  });

  describe('assignPetName', () => {
    for (const blockedKey of PROTOTYPE_POLLUTION_BLOCKLIST) {
      it(`throws if given a chainId of "${blockedKey}"`, () => {
        const controller = new PetNamesController({
          messenger: getControllerMessenger(),
        });

        expect(() =>
          // @ts-expect-error We are intentionally passing bad input.
          controller.assignPetName(blockedKey, '0xbbbbbb', 'Account 2'),
        ).toThrow('Invalid chain ID');
      });
    }

    it('registers the given pet name in state with the given chain ID and address', () => {
      const controller = new PetNamesController({
        messenger: getControllerMessenger(),
        state: {
          namesByChainIdAndAddress: {
            '0x1': {
              '0xaaaaaa': 'Account 1',
            },
          },
        },
      });

      controller.assignPetName('0x1', '0xbbbbbb', 'Account 2');

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
      const controller = new PetNamesController({
        messenger: getControllerMessenger(),
      });

      controller.assignPetName('0x1', '0xaaaaaa', 'My Account');

      expect(controller.state).toStrictEqual({
        namesByChainIdAndAddress: {
          '0x1': {
            '0xaaaaaa': 'My Account',
          },
        },
      });
    });

    it('overwrites any existing pet name for the address', () => {
      const controller = new PetNamesController({
        messenger: getControllerMessenger(),
        state: {
          namesByChainIdAndAddress: {
            '0x1': {
              '0xaaaaaa': 'Account 1',
            },
          },
        },
      });

      controller.assignPetName('0x1', '0xaaaaaa', 'Old Account');

      expect(controller.state).toStrictEqual({
        namesByChainIdAndAddress: {
          '0x1': {
            '0xaaaaaa': 'Old Account',
          },
        },
      });
    });

    it('lowercases the given address before registering it to avoid duplicate entries', () => {
      const controller = new PetNamesController({
        messenger: getControllerMessenger(),
        state: {
          namesByChainIdAndAddress: {
            '0x1': {
              '0xaaaaaa': 'Account 1',
            },
          },
        },
      });

      controller.assignPetName('0x1', '0xAAAAAA', 'Old Account');

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
type RootAction = ExtractAvailableAction<PetNamesControllerMessenger>;

/**
 * The union of events that the root messenger allows.
 */
type RootEvent = ExtractAvailableEvent<PetNamesControllerMessenger>;

/**
 * Constructs the unrestricted messenger. This can be used to call actions and
 * publish events within the tests for this controller.
 *
 * @returns The unrestricted messenger suited for PetNamesController.
 */
function getRootControllerMessenger(): ControllerMessenger<
  RootAction,
  RootEvent
> {
  return new ControllerMessenger<RootAction, RootEvent>();
}

/**
 * Constructs the messenger which is restricted to relevant PetNamesController
 * actions and events.
 *
 * @param rootMessenger - The root messenger to restrict.
 * @returns The restricted messenger.
 */
function getControllerMessenger(
  rootMessenger = getRootControllerMessenger(),
): PetNamesControllerMessenger {
  return rootMessenger.getRestricted({
    name: 'PetNamesController',
    allowedActions: [],
    allowedEvents: [],
  });
}
