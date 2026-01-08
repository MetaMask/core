import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MessengerActions,
  MessengerEvents,
  MockAnyNamespace,
} from '@metamask/messenger';

import type {
  AssetsControllerMessenger,
  AssetsControllerState,
} from './AssetsController';
import {
  AssetsController,
  controllerName,
  getDefaultAssetsControllerState,
} from './AssetsController';

type AllAssetsControllerActions = MessengerActions<AssetsControllerMessenger>;

type AllAssetsControllerEvents = MessengerEvents<AssetsControllerMessenger>;

type RootMessenger = Messenger<
  MockAnyNamespace,
  AllAssetsControllerActions,
  AllAssetsControllerEvents
>;

type WithControllerCallback<ReturnValue> = ({
  controller,
  messenger,
}: {
  controller: AssetsController;
  messenger: RootMessenger;
}) => Promise<ReturnValue> | ReturnValue;

type WithControllerOptions = {
  state?: Partial<AssetsControllerState>;
};

type WithControllerArgs<ReturnValue> =
  | [WithControllerCallback<ReturnValue>]
  | [WithControllerOptions, WithControllerCallback<ReturnValue>];

/**
 * Builds a controller based on the given options, and calls the given function
 * with that controller.
 *
 * @param args - Either a function, or an options bag + a function. The options
 * bag accepts controller options and config; the function
 * will be called with the built controller.
 * @returns Whatever the callback returns.
 */
async function withController<ReturnValue>(
  ...args: WithControllerArgs<ReturnValue>
): Promise<ReturnValue> {
  const [{ state = {} }, testFunction] =
    args.length === 2 ? args : [{}, args[0]];

  const messenger: RootMessenger = new Messenger({
    namespace: MOCK_ANY_NAMESPACE,
  });

  const controllerMessenger = new Messenger<
    typeof controllerName,
    AllAssetsControllerActions,
    AllAssetsControllerEvents,
    RootMessenger
  >({
    namespace: controllerName,
    parent: messenger,
  });

  const controller = new AssetsController({
    messenger: controllerMessenger,
    state,
  });

  return await testFunction({
    controller,
    messenger,
  });
}

describe('AssetsController', () => {
  describe('constructor', () => {
    it('should create an instance with default state', async () => {
      await withController(({ controller }) => {
        expect(controller.state).toStrictEqual(
          getDefaultAssetsControllerState(),
        );
      });
    });

    it('should create an instance with custom state', async () => {
      const customState = {};
      await withController({ state: customState }, ({ controller }) => {
        expect(controller.state).toStrictEqual(customState);
      });
    });
  });

  describe('getDefaultAssetsControllerState', () => {
    it('should return an empty object', () => {
      expect(getDefaultAssetsControllerState()).toStrictEqual({});
    });
  });

  describe('actions', () => {
    it('should respond to AssetsController:getState action', async () => {
      await withController(({ messenger }) => {
        const state = messenger.call('AssetsController:getState');
        expect(state).toStrictEqual(getDefaultAssetsControllerState());
      });
    });
  });

  describe('events', () => {
    it('should allow subscribing to stateChange event', async () => {
      await withController(({ messenger }) => {
        const listener = jest.fn();
        messenger.subscribe('AssetsController:stateChange', listener);

        // Since state is empty and there's no way to change it yet,
        // we just verify the subscription works without errors
        expect(listener).not.toHaveBeenCalled();
      });
    });
  });
});
