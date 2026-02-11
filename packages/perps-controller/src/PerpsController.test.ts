import { deriveStateFromMetadata } from '@metamask/base-controller';
import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MockAnyNamespace,
  MessengerActions,
  MessengerEvents,
} from '@metamask/messenger';

import type { PerpsControllerMessenger } from './PerpsController';
import { PerpsController } from './PerpsController';

describe('PerpsController', () => {
  describe('constructor', () => {
    it('accepts initial state', async () => {
      const givenState = {};

      await withController(
        { options: { state: givenState } },
        ({ controller }) => {
          expect(controller.state).toStrictEqual(givenState);
        },
      );
    });

    it('fills in missing initial state with defaults', async () => {
      await withController(({ controller }) => {
        expect(controller.state).toMatchInlineSnapshot(`{}`);
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
        ).toMatchInlineSnapshot(`{}`);
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
        ).toMatchInlineSnapshot(`{}`);
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
        ).toMatchInlineSnapshot(`{}`);
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
        ).toMatchInlineSnapshot(`{}`);
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
  MessengerActions<PerpsControllerMessenger>,
  MessengerEvents<PerpsControllerMessenger>
>;

/**
 * The callback that `withController` calls.
 */
type WithControllerCallback<ReturnValue> = (payload: {
  controller: PerpsController;
  rootMessenger: RootMessenger;
  controllerMessenger: PerpsControllerMessenger;
}) => Promise<ReturnValue> | ReturnValue;

/**
 * The options that `withController` takes.
 */
type WithControllerOptions = {
  options: Partial<ConstructorParameters<typeof PerpsController>[0]>;
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
function getMessenger(rootMessenger: RootMessenger): PerpsControllerMessenger {
  return new Messenger({
    namespace: 'PerpsController',
    parent: rootMessenger,
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
  const controller = new PerpsController({
    messenger: controllerMessenger,
    ...options,
  });
  return await testFunction({ controller, rootMessenger, controllerMessenger });
}
