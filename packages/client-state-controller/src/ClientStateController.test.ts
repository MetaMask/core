import { Messenger } from '@metamask/messenger';

import type {
  ClientStateControllerActions,
  ClientStateControllerEvents,
  ClientStateControllerMessenger,
  ClientStateControllerState,
} from './ClientStateController';
import {
  ClientStateController,
  controllerName,
  getDefaultClientStateControllerState,
  selectIsClientOpen,
} from './ClientStateController';

describe('ClientStateController', () => {
  /**
   * Creates a messenger for the ClientStateController.
   *
   * @returns A messenger for the controller.
   */
  function createMessenger(): ClientStateControllerMessenger {
    const rootMessenger = new Messenger<
      'Root',
      ClientStateControllerActions,
      ClientStateControllerEvents
    >({ namespace: 'Root' });

    return new Messenger<
      typeof controllerName,
      ClientStateControllerActions,
      ClientStateControllerEvents,
      typeof rootMessenger
    >({
      namespace: controllerName,
      parent: rootMessenger,
    });
  }

  /**
   * Creates a ClientStateController.
   *
   * @param options - Options for creating the controller.
   * @param options.state - Initial state to set on the controller.
   * @returns The controller and messenger.
   */
  function createController(options?: {
    state?: Partial<ClientStateControllerState>;
  }): {
    controller: ClientStateController;
    messenger: ClientStateControllerMessenger;
  } {
    const messenger = createMessenger();
    const controller = new ClientStateController({
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

  describe('setClientOpen', () => {
    it('updates state when client opens', () => {
      const { controller } = createController();

      controller.setClientOpen(true);

      expect(controller.state.isClientOpen).toBe(true);
      expect(controller.isClientOpen).toBe(true);
    });

    it('updates state when client closes', () => {
      const { controller } = createController();
      controller.setClientOpen(true);

      controller.setClientOpen(false);

      expect(controller.state.isClientOpen).toBe(false);
      expect(controller.isClientOpen).toBe(false);
    });

    it('does not update state when setting the same value', () => {
      const { controller, messenger } = createController();
      controller.setClientOpen(true);
      const listener = jest.fn();
      messenger.subscribe(`${controllerName}:stateChange`, listener);

      controller.setClientOpen(true);

      expect(listener).not.toHaveBeenCalled();
    });

    it('publishes stateChange event when client opens', () => {
      const { controller, messenger } = createController();
      const listener = jest.fn();

      messenger.subscribe(`${controllerName}:stateChange`, listener);
      controller.setClientOpen(true);

      expect(listener).toHaveBeenCalledTimes(1);
      const [newState] = listener.mock.calls[0];
      expect(newState.isClientOpen).toBe(true);
    });

    it('publishes stateChange event when client closes', () => {
      const { controller, messenger } = createController();
      controller.setClientOpen(true);
      const listener = jest.fn();

      messenger.subscribe(`${controllerName}:stateChange`, listener);
      controller.setClientOpen(false);

      expect(listener).toHaveBeenCalledTimes(1);
      const [newState] = listener.mock.calls[0];
      expect(newState.isClientOpen).toBe(false);
    });

    it('does not publish stateChange when state does not change', () => {
      const { controller, messenger } = createController();
      controller.setClientOpen(true);
      const listener = jest.fn();

      messenger.subscribe(`${controllerName}:stateChange`, listener);
      controller.setClientOpen(true);

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('isClientOpen getter', () => {
    it('returns true when client is open', () => {
      const { controller } = createController();
      controller.setClientOpen(true);

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
      controller.setClientOpen(true);

      const state = messenger.call(`${controllerName}:getState`);

      expect(state.isClientOpen).toBe(true);
    });

    it('allows setting client open via messenger action', () => {
      const { controller, messenger } = createController();

      messenger.call(`${controllerName}:setClientOpen`, true);

      expect(controller.state.isClientOpen).toBe(true);
    });

    it('allows setting client closed via messenger action', () => {
      const { controller, messenger } = createController();
      controller.setClientOpen(true);

      messenger.call(`${controllerName}:setClientOpen`, false);

      expect(controller.state.isClientOpen).toBe(false);
    });

    it('publishes stateChange when setting via messenger action', () => {
      const { messenger } = createController();
      const listener = jest.fn();

      messenger.subscribe(`${controllerName}:stateChange`, listener);
      messenger.call(`${controllerName}:setClientOpen`, true);

      expect(listener).toHaveBeenCalledTimes(1);
      const [newState] = listener.mock.calls[0];
      expect(newState.isClientOpen).toBe(true);
    });
  });

  describe('getDefaultClientStateControllerState', () => {
    it('returns default state with client closed', () => {
      const defaultState = getDefaultClientStateControllerState();

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

      controller.setClientOpen(true);
      controller.setClientOpen(false);
      controller.setClientOpen(true);
      controller.setClientOpen(false);

      expect(listener).toHaveBeenCalledTimes(4);
      expect(controller.isClientOpen).toBe(false);
    });

    it('ignores repeated calls with same value', () => {
      const { controller, messenger } = createController();
      const listener = jest.fn();

      messenger.subscribe(`${controllerName}:stateChange`, listener);

      controller.setClientOpen(true);
      controller.setClientOpen(true);
      controller.setClientOpen(true);

      expect(listener).toHaveBeenCalledTimes(1);
    });
  });
});
