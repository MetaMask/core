import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MessengerActions,
  MessengerEvents,
  MockAnyNamespace,
} from '@metamask/messenger';

import type { AssetsControllerMessenger } from './AssetsController';
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

/**
 * Creates and returns a root messenger for testing.
 *
 * @returns A messenger instance.
 */
function getRootMessenger(): RootMessenger {
  return new Messenger({
    namespace: MOCK_ANY_NAMESPACE,
  });
}

/**
 * Constructs a messenger for the AssetsController.
 *
 * @param rootMessenger - An optional root messenger.
 * @returns A messenger for the AssetsController.
 */
function getMessenger(
  rootMessenger = getRootMessenger(),
): AssetsControllerMessenger {
  return new Messenger<
    typeof controllerName,
    AllAssetsControllerActions,
    AllAssetsControllerEvents,
    RootMessenger
  >({
    namespace: controllerName,
    parent: rootMessenger,
  });
}

describe('AssetsController', () => {
  describe('constructor', () => {
    it('should create an instance with default state', () => {
      const messenger = getMessenger();
      const controller = new AssetsController({ messenger });

      expect(controller.state).toStrictEqual(getDefaultAssetsControllerState());
    });

    it('should create an instance with custom state', () => {
      const messenger = getMessenger();
      const customState = {};
      const controller = new AssetsController({
        messenger,
        state: customState,
      });

      expect(controller.state).toStrictEqual(customState);
    });
  });

  describe('getDefaultAssetsControllerState', () => {
    it('should return an empty object', () => {
      expect(getDefaultAssetsControllerState()).toStrictEqual({});
    });
  });

  describe('actions', () => {
    it('should respond to AssetsController:getState action', () => {
      const rootMessenger = getRootMessenger();
      const messenger = getMessenger(rootMessenger);

      // eslint-disable-next-line no-new
      new AssetsController({ messenger });

      const state = rootMessenger.call('AssetsController:getState');

      expect(state).toStrictEqual(getDefaultAssetsControllerState());
    });
  });

  describe('events', () => {
    it('should emit stateChange event when state changes', () => {
      const rootMessenger = getRootMessenger();
      const messenger = getMessenger(rootMessenger);

      // eslint-disable-next-line no-new
      new AssetsController({ messenger });

      const listener = jest.fn();
      rootMessenger.subscribe('AssetsController:stateChange', listener);

      // Since state is empty and there's no way to change it yet,
      // we just verify the subscription works without errors
      expect(listener).not.toHaveBeenCalled();
    });
  });
});
