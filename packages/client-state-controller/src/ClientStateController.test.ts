import { Messenger } from '@metamask/messenger';

import type {
  ClientStateControllerActions,
  ClientStateControllerEvents,
  ClientStateControllerMessenger,
} from './ClientStateController';
import {
  ClientStateController,
  controllerName,
  getDefaultClientStateControllerState,
} from './ClientStateController';
import { clientStateControllerSelectors } from './selectors';

describe('ClientStateController', () => {
  type RootMessenger = Messenger<
    'Root',
    ClientStateControllerActions,
    ClientStateControllerEvents
  >;

  /**
   * Constructs the root messenger.
   *
   * @returns The root messenger.
   */
  function getRootMessenger(): RootMessenger {
    return new Messenger<
      'Root',
      ClientStateControllerActions,
      ClientStateControllerEvents
    >({ namespace: 'Root' });
  }

  /**
   * Constructs the messenger for the ClientStateController.
   *
   * @param rootMessenger - The root messenger.
   * @returns The controller-specific messenger.
   */
  function getMessenger(
    rootMessenger: RootMessenger,
  ): ClientStateControllerMessenger {
    return new Messenger<
      typeof controllerName,
      ClientStateControllerActions,
      ClientStateControllerEvents,
      RootMessenger
    >({
      namespace: controllerName,
      parent: rootMessenger,
    });
  }

  type WithControllerCallback<ReturnValue> = (payload: {
    controller: ClientStateController;
    rootMessenger: RootMessenger;
    messenger: ClientStateControllerMessenger;
  }) => Promise<ReturnValue> | ReturnValue;

  type WithControllerOptions = {
    options: Partial<ConstructorParameters<typeof ClientStateController>[0]>;
  };

  /**
   * Wraps tests for the controller by creating the controller and messengers,
   * then calling the test function with them.
   *
   * @param args - Either a callback, or an options bag + a callback. The
   * options bag contains arguments for the controller constructor. The
   * callback is called with the new controller, root messenger, and
   * controller messenger.
   * @returns The return value of the callback.
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
    const controller = new ClientStateController({
      messenger,
      ...options,
    });
    return await testFunction({ controller, rootMessenger, messenger });
  }

  describe('constructor', () => {
    it('initializes with default state (client closed)', async () => {
      await withController(({ controller }) => {
        expect(controller.state.isClientOpen).toBe(false);
        expect(
          clientStateControllerSelectors.selectIsClientOpen(controller.state),
        ).toBe(false);
      });
    });

    it('allows initializing with partial state', async () => {
      await withController(
        { options: { state: { isClientOpen: true } } },
        ({ controller }) => {
          expect(controller.state.isClientOpen).toBe(true);
          expect(
            clientStateControllerSelectors.selectIsClientOpen(controller.state),
          ).toBe(true);
        },
      );
    });

    it('merges partial state with defaults', async () => {
      await withController({ options: { state: {} } }, ({ controller }) => {
        expect(controller.state.isClientOpen).toBe(false);
      });
    });
  });

  describe('setClientOpen', () => {
    it('updates isClientOpen in state to the given value', async () => {
      await withController(({ controller }) => {
        controller.setClientOpen(true);

        expect(controller.state.isClientOpen).toBe(true);
        expect(
          clientStateControllerSelectors.selectIsClientOpen(controller.state),
        ).toBe(true);

        controller.setClientOpen(false);

        expect(controller.state.isClientOpen).toBe(false);
        expect(
          clientStateControllerSelectors.selectIsClientOpen(controller.state),
        ).toBe(false);
      });
    });

    it('publishes stateChange event when isClientOpen changes to true', async () => {
      await withController(({ controller, messenger }) => {
        const listener = jest.fn();
        messenger.subscribe(`${controllerName}:stateChange`, listener);
        controller.setClientOpen(true);

        expect(listener).toHaveBeenCalledTimes(1);
        const [newState] = listener.mock.calls[0];
        expect(newState.isClientOpen).toBe(true);
      });
    });

    it('publishes stateChange event when isClientOpen changes to false', async () => {
      await withController(({ controller, messenger }) => {
        controller.setClientOpen(true);
        const listener = jest.fn();
        messenger.subscribe(`${controllerName}:stateChange`, listener);
        controller.setClientOpen(false);

        expect(listener).toHaveBeenCalledTimes(1);
        const [newState] = listener.mock.calls[0];
        expect(newState.isClientOpen).toBe(false);
      });
    });
  });

  describe('selectIsClientOpen selector', () => {
    it('returns true when client is open', async () => {
      await withController(({ controller }) => {
        controller.setClientOpen(true);
        expect(
          clientStateControllerSelectors.selectIsClientOpen(controller.state),
        ).toBe(true);
      });
    });

    it('returns false when client is closed', async () => {
      await withController(({ controller }) => {
        expect(
          clientStateControllerSelectors.selectIsClientOpen(controller.state),
        ).toBe(false);
      });
    });
  });

  describe('messenger actions', () => {
    it('allows getting state via messenger action', async () => {
      await withController(({ controller, messenger }) => {
        controller.setClientOpen(true);
        const state = messenger.call(`${controllerName}:getState`);
        expect(state.isClientOpen).toBe(true);
      });
    });

    it('allows setting client open via messenger action', async () => {
      await withController(({ controller, messenger }) => {
        messenger.call(`${controllerName}:setClientOpen`, true);
        expect(controller.state.isClientOpen).toBe(true);
      });
    });

    it('allows setting client closed via messenger action', async () => {
      await withController(({ controller, messenger }) => {
        controller.setClientOpen(true);
        messenger.call(`${controllerName}:setClientOpen`, false);
        expect(controller.state.isClientOpen).toBe(false);
      });
    });

    it('publishes stateChange when setting via messenger action', async () => {
      await withController(({ messenger }) => {
        const listener = jest.fn();
        messenger.subscribe(`${controllerName}:stateChange`, listener);
        messenger.call(`${controllerName}:setClientOpen`, true);

        expect(listener).toHaveBeenCalledTimes(1);
        const [newState] = listener.mock.calls[0];
        expect(newState.isClientOpen).toBe(true);
      });
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
        expect(
          clientStateControllerSelectors.selectIsClientOpen({
            isClientOpen: true,
          }),
        ).toBe(true);
      });

      it('returns false when client is closed', () => {
        expect(
          clientStateControllerSelectors.selectIsClientOpen({
            isClientOpen: false,
          }),
        ).toBe(false);
      });
    });
  });

  describe('lifecycle scenarios', () => {
    it('handles multiple open/close cycles', async () => {
      await withController(({ controller, messenger }) => {
        const listener = jest.fn();
        messenger.subscribe(`${controllerName}:stateChange`, listener);

        controller.setClientOpen(true);
        controller.setClientOpen(false);
        controller.setClientOpen(true);
        controller.setClientOpen(false);

        expect(listener).toHaveBeenCalledTimes(4);
        expect(
          clientStateControllerSelectors.selectIsClientOpen(controller.state),
        ).toBe(false);
      });
    });
  });
});
