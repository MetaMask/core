import { deriveStateFromMetadata } from '@metamask/base-controller';
import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MockAnyNamespace,
  MessengerActions,
  MessengerEvents,
} from '@metamask/messenger';

import type { EntropyControllerMessenger } from './entropy-controller';
import { EntropyController } from './entropy-controller';

describe('EntropyController', () => {
  describe('constructor', () => {
    it('accepts initial state', () => {
      const givenState = {
        entropySources: {
          'entropy-1': {
            type: 'bip44:srp' as const,
            metadata: {},
          },
        },
      };

      withController({ options: { state: givenState } }, ({ controller }) => {
        expect(controller.state).toStrictEqual(givenState);
      });
    });

    it('fills in missing initial state with defaults', () => {
      withController(({ controller }) => {
        expect(controller.state).toMatchInlineSnapshot(`
          {
            "entropySources": {},
          }
        `);
      });
    });
  });

  describe('metadata', () => {
    it('does not include entropy sources in debug snapshots', () => {
      withController(({ controller }) => {
        expect(
          deriveStateFromMetadata(
            controller.state,
            controller.metadata,
            'includeInDebugSnapshot',
          ),
        ).toMatchInlineSnapshot(`{}`);
      });
    });

    it('includes entropy sources in state logs', () => {
      withController(({ controller }) => {
        expect(
          deriveStateFromMetadata(
            controller.state,
            controller.metadata,
            'includeInStateLogs',
          ),
        ).toMatchInlineSnapshot(`
          {
            "entropySources": {},
          }
        `);
      });
    });

    it('persists entropy sources', () => {
      withController(({ controller }) => {
        expect(
          deriveStateFromMetadata(
            controller.state,
            controller.metadata,
            'persist',
          ),
        ).toMatchInlineSnapshot(`
          {
            "entropySources": {},
          }
        `);
      });
    });

    it('exposes entropy sources to UI', () => {
      withController(({ controller }) => {
        expect(
          deriveStateFromMetadata(
            controller.state,
            controller.metadata,
            'usedInUi',
          ),
        ).toMatchInlineSnapshot(`
          {
            "entropySources": {},
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
  MockAnyNamespace,
  MessengerActions<EntropyControllerMessenger>,
  MessengerEvents<EntropyControllerMessenger>
>;

/**
 * The callback that `withController` calls.
 */
type WithControllerCallback<ReturnValue> = (payload: {
  controller: EntropyController;
  rootMessenger: RootMessenger;
  controllerMessenger: EntropyControllerMessenger;
}) => ReturnValue;

/**
 * The options that `withController` takes.
 */
type WithControllerOptions = {
  options: Partial<ConstructorParameters<typeof EntropyController>[0]>;
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
function getMessenger(
  rootMessenger: RootMessenger,
): EntropyControllerMessenger {
  return new Messenger({
    namespace: 'EntropyController',
    parent: rootMessenger,
  });
}

/**
 * Wrap tests for the controller under test by ensuring that the controller is
 * created ahead of time with the given options.
 *
 * @param args - Either a function, or an options bag + a function. The options
 * bag contains arguments for the controller constructor. All constructor
 * arguments are optional and will be filled in with defaults as needed
 * (including `messenger`). The function is called with the instantiated
 * controller, root messenger, and controller messenger.
 * @returns The same return value as the given function.
 */
function withController<ReturnValue>(
  ...args:
    | [WithControllerCallback<ReturnValue>]
    | [WithControllerOptions, WithControllerCallback<ReturnValue>]
): ReturnValue {
  const [{ options = {} }, testFunction] =
    args.length === 2 ? args : [{}, args[0]];
  const rootMessenger = getRootMessenger();
  const controllerMessenger = getMessenger(rootMessenger);
  const controller = new EntropyController({
    messenger: controllerMessenger,
    ...options,
  });
  return testFunction({ controller, rootMessenger, controllerMessenger });
}
