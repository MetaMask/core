import { Messenger } from '@metamask/messenger';

import type {
  ApplicationStateControllerActions,
  ApplicationStateControllerEvents,
  ApplicationStateControllerMessenger,
  ApplicationStateControllerState,
} from './ApplicationStateController';
import {
  ApplicationStateController,
  controllerName,
  getDefaultApplicationStateControllerState,
  selectIsClientOpen,
} from './ApplicationStateController';

describe('ApplicationStateController', () => {
  /**
   * Creates a messenger for the ApplicationStateController.
   *
   * @returns A messenger for the controller.
   */
  function createMessenger(): ApplicationStateControllerMessenger {
    const rootMessenger = new Messenger<
      'Root',
      ApplicationStateControllerActions,
      ApplicationStateControllerEvents
    >({ namespace: 'Root' });

    return new Messenger<
      typeof controllerName,
      ApplicationStateControllerActions,
      ApplicationStateControllerEvents,
      typeof rootMessenger
    >({
      namespace: controllerName,
      parent: rootMessenger,
    });
  }

  /**
   * Creates an ApplicationStateController.
   *
   * @param options - Options for creating the controller.
   * @param options.state - Initial state to set on the controller.
   * @returns The controller and messenger.
   */
  function createController(options?: {
    state?: Partial<ApplicationStateControllerState>;
  }): {
    controller: ApplicationStateController;
    messenger: ApplicationStateControllerMessenger;
  } {
    const messenger = createMessenger();
    const controller = new ApplicationStateController({
      messenger,
      state: options?.state,
    });
    return { controller, messenger };
  }

  describe('constructor', () => {
    it('initializes with default state (client closed)', () => {
      const { controller } = createController();

      expect(controller.state.isClientOpen).toBe(false);
      expect(controller.isClientOpen).toBe(false);
    });

    it('allows initializing with partial state', () => {
      const { controller } = createController({
        state: { isClientOpen: true },
      });

      expect(controller.state.isClientOpen).toBe(true);
      expect(controller.isClientOpen).toBe(true);
    });

    it('merges partial state with defaults', () => {
      const { controller } = createController({
        state: {},
      });

      expect(controller.state.isClientOpen).toBe(false);
    });
  });

  describe('setClientState', () => {
    it('updates state when client opens', () => {
      const { controller } = createController();

      controller.setClientState(true);

      expect(controller.state.isClientOpen).toBe(true);
      expect(controller.isClientOpen).toBe(true);
    });

    it('updates state when client closes', () => {
      const { controller } = createController();
      controller.setClientState(true);

      controller.setClientState(false);

      expect(controller.state.isClientOpen).toBe(false);
      expect(controller.isClientOpen).toBe(false);
    });

    it('does not update state when setting the same value', () => {
      const { controller, messenger } = createController();
      controller.setClientState(true);
      const listener = jest.fn();
      messenger.subscribe(`${controllerName}:stateChange`, listener);

      controller.setClientState(true);

      expect(listener).not.toHaveBeenCalled();
    });

    it('publishes stateChange event when client opens', () => {
      const { controller, messenger } = createController();
      const listener = jest.fn();

      messenger.subscribe(`${controllerName}:stateChange`, listener);
      controller.setClientState(true);

      expect(listener).toHaveBeenCalledTimes(1);
      const [newState] = listener.mock.calls[0];
      expect(newState.isClientOpen).toBe(true);
    });

    it('publishes stateChange event when client closes', () => {
      const { controller, messenger } = createController();
      controller.setClientState(true);
      const listener = jest.fn();

      messenger.subscribe(`${controllerName}:stateChange`, listener);
      controller.setClientState(false);

      expect(listener).toHaveBeenCalledTimes(1);
      const [newState] = listener.mock.calls[0];
      expect(newState.isClientOpen).toBe(false);
    });

    it('does not publish stateChange when state does not change', () => {
      const { controller, messenger } = createController();
      controller.setClientState(true);
      const listener = jest.fn();

      messenger.subscribe(`${controllerName}:stateChange`, listener);
      controller.setClientState(true);

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('isClientOpen getter', () => {
    it('returns true when client is open', () => {
      const { controller } = createController();
      controller.setClientState(true);

      expect(controller.isClientOpen).toBe(true);
    });

    it('returns false when client is closed', () => {
      const { controller } = createController();

      expect(controller.isClientOpen).toBe(false);
    });
  });

  describe('messenger actions', () => {
    it('allows getting state via messenger action', () => {
      const { controller, messenger } = createController();
      controller.setClientState(true);

      const state = messenger.call(`${controllerName}:getState`);

      expect(state.isClientOpen).toBe(true);
    });

    it('allows setting client open via messenger action', () => {
      const { controller, messenger } = createController();

      messenger.call(`${controllerName}:setClientState`, true);

      expect(controller.state.isClientOpen).toBe(true);
    });

    it('allows setting client closed via messenger action', () => {
      const { controller, messenger } = createController();
      controller.setClientState(true);

      messenger.call(`${controllerName}:setClientState`, false);

      expect(controller.state.isClientOpen).toBe(false);
    });

    it('publishes stateChange when setting via messenger action', () => {
      const { messenger } = createController();
      const listener = jest.fn();

      messenger.subscribe(`${controllerName}:stateChange`, listener);
      messenger.call(`${controllerName}:setClientState`, true);

      expect(listener).toHaveBeenCalledTimes(1);
      const [newState] = listener.mock.calls[0];
      expect(newState.isClientOpen).toBe(true);
    });
  });

  describe('getDefaultApplicationStateControllerState', () => {
    it('returns default state with client closed', () => {
      const defaultState = getDefaultApplicationStateControllerState();

      expect(defaultState.isClientOpen).toBe(false);
    });
  });

  describe('selectors', () => {
    describe('selectIsClientOpen', () => {
      it('returns true when client is open', () => {
        expect(selectIsClientOpen({ isClientOpen: true })).toBe(true);
      });

      it('returns false when client is closed', () => {
        expect(selectIsClientOpen({ isClientOpen: false })).toBe(false);
      });
    });
  });

  describe('lifecycle scenarios', () => {
    it('handles multiple open/close cycles', () => {
      const { controller, messenger } = createController();
      const listener = jest.fn();

      messenger.subscribe(`${controllerName}:stateChange`, listener);

      controller.setClientState(true);
      controller.setClientState(false);
      controller.setClientState(true);
      controller.setClientState(false);

      expect(listener).toHaveBeenCalledTimes(4);
      expect(controller.isClientOpen).toBe(false);
    });

    it('ignores repeated calls with same value', () => {
      const { controller, messenger } = createController();
      const listener = jest.fn();

      messenger.subscribe(`${controllerName}:stateChange`, listener);

      controller.setClientState(true);
      controller.setClientState(true);
      controller.setClientState(true);

      expect(listener).toHaveBeenCalledTimes(1);
    });
  });
});
