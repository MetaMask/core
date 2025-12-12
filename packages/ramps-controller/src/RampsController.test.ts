import { deriveStateFromMetadata } from '@metamask/base-controller';
import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MockAnyNamespace,
  MessengerActions,
  MessengerEvents,
} from '@metamask/messenger';

import type { OnRampServiceGetCountriesAction } from './OnRampService-method-action-types';
import type { RampsControllerMessenger } from './RampsController';
import { RampsController } from './RampsController';

describe('RampsController', () => {
  describe('constructor', () => {
    it('uses default state when no state is provided', async () => {
      await withController(({ controller }) => {
        expect(controller.state).toMatchInlineSnapshot(`
          Object {
            "regionEligibility": null,
          }
        `);
      });
    });

    it('accepts initial state', async () => {
      const givenState = {
        regionEligibility: true,
      };

      await withController(
        { options: { state: givenState } },
        ({ controller }) => {
          expect(controller.state).toStrictEqual(givenState);
        },
      );
    });

    it('fills in missing initial state with defaults', async () => {
      await withController({ options: { state: {} } }, ({ controller }) => {
        expect(controller.state).toMatchInlineSnapshot(`
            Object {
              "regionEligibility": null,
            }
          `);
      });
    });
  });

  describe('metadata', () => {
    it('includes expected state in debug snapshots', async () => {
      await withController(({ controller }) => {
        expect(
          deriveStateFromMetadata(
            controller.state,
            controller.metadata,
            'includeInDebugSnapshot',
          ),
        ).toMatchInlineSnapshot(`
          Object {
            "regionEligibility": null,
          }
        `);
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
            "regionEligibility": null,
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
            "regionEligibility": null,
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
            "regionEligibility": null,
          }
        `);
      });
    });
  });

  describe('getRegionEligibility', () => {
    it('updates region eligibility state when countries are fetched and country is supported', async () => {
      await withController(async ({ controller, rootMessenger }) => {
        const mockCountries = [
          {
            isoCode: 'US',
            flag: '🇺🇸',
            name: 'United States of America',
            phone: {
              prefix: '+1',
              placeholder: '(555) 123-4567',
              template: '(XXX) XXX-XXXX',
            },
            currency: 'USD',
            supported: true,
            recommended: true,
            transakSupported: true,
          },
          {
            isoCode: 'GB',
            flag: '🇬🇧',
            name: 'United Kingdom',
            phone: {
              prefix: '+44',
              placeholder: '7123 456789',
              template: 'XXXX XXXXXX',
            },
            currency: 'GBP',
            supported: false,
            recommended: false,
            transakSupported: false,
          },
        ];

        rootMessenger.registerActionHandler(
          'OnRampService:getCountries',
          async () => mockCountries,
        );

        const result = await controller.getRegionEligibility('US');

        expect(result).toBe(true);
        expect(controller.state.regionEligibility).toBe(true);
      });
    });

    it('returns false and updates state when country is not supported', async () => {
      await withController(async ({ controller, rootMessenger }) => {
        const mockCountries = [
          {
            isoCode: 'US',
            flag: '🇺🇸',
            name: 'United States of America',
            phone: {
              prefix: '+1',
              placeholder: '(555) 123-4567',
              template: '(XXX) XXX-XXXX',
            },
            currency: 'USD',
            supported: true,
            recommended: true,
            transakSupported: true,
          },
        ];

        rootMessenger.registerActionHandler(
          'OnRampService:getCountries',
          async () => mockCountries,
        );

        const result = await controller.getRegionEligibility('GB');

        expect(result).toBe(false);
        expect(controller.state.regionEligibility).toBe(false);
      });
    });
  });
});

/**
 * The type of the messenger populated with all external actions and events
 * required by the controller under test.
 */
type RootMessenger = Messenger<
  MockAnyNamespace,
  | MessengerActions<RampsControllerMessenger>
  | OnRampServiceGetCountriesAction,
  MessengerEvents<RampsControllerMessenger>
>;

/**
 * The callback that `withController` calls.
 */
type WithControllerCallback<ReturnValue> = (payload: {
  controller: RampsController;
  rootMessenger: RootMessenger;
  messenger: RampsControllerMessenger;
}) => Promise<ReturnValue> | ReturnValue;

/**
 * The options bag that `withController` takes.
 */
type WithControllerOptions = {
  options: Partial<ConstructorParameters<typeof RampsController>[0]>;
};

/**
 * Constructs the messenger populated with all external actions and events
 * required by the controller under test.
 *
 * @returns The root messenger.
 */
function getRootMessenger(): RootMessenger {
  return new Messenger({ namespace: MOCK_ANY_NAMESPACE });
}

/**
 * Constructs the messenger for the controller under test.
 *
 * @param rootMessenger - The root messenger, with all external actions and
 * events required by the controller's messenger.
 * @returns The controller-specific messenger.
 */
function getMessenger(rootMessenger: RootMessenger): RampsControllerMessenger {
  const messenger: RampsControllerMessenger = new Messenger({
    namespace: 'RampsController',
    parent: rootMessenger,
  });
  rootMessenger.delegate({
    messenger,
    actions: ['OnRampService:getCountries'],
  });
  return messenger;
}

/**
 * Wrap tests for the controller under test by ensuring that the controller is
 * created ahead of time and then safely destroyed afterward as needed.
 *
 * @param args - Either a function, or an options bag + a function. The options
 * bag contains arguments for the controller constructor. All constructor
 * arguments are optional and will be filled in with defaults in as needed
 * (including `messenger`). The function is called with the new
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
  const messenger = getMessenger(rootMessenger);
  const controller = new RampsController({
    messenger,
    ...options,
  });
  return await testFunction({ controller, rootMessenger, messenger });
}
