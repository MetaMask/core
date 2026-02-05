import { Messenger } from '@metamask/messenger';

import { uiStateControllerSelectors } from './selectors';
import type {
  UiStateControllerActions,
  UiStateControllerEvents,
  UiStateControllerMessenger,
} from './UiStateController';
import {
  UiStateController,
  controllerName,
  getDefaultUiStateControllerState,
} from './UiStateController';

describe('UiStateController', () => {
  type RootMessenger = Messenger<
    'Root',
    UiStateControllerActions,
    UiStateControllerEvents
  >;

  /**
   * Constructs the root messenger.
   *
   * @returns The root messenger.
   */
  function getRootMessenger(): RootMessenger {
    return new Messenger<
      'Root',
      UiStateControllerActions,
      UiStateControllerEvents
    >({ namespace: 'Root' });
  }

  /**
   * Constructs the messenger for the UiStateController.
   *
   * @param rootMessenger - The root messenger.
   * @returns The controller-specific messenger.
   */
  function getMessenger(
    rootMessenger: RootMessenger,
  ): UiStateControllerMessenger {
    return new Messenger<
      typeof controllerName,
      UiStateControllerActions,
      UiStateControllerEvents,
      RootMessenger
    >({
      namespace: controllerName,
      parent: rootMessenger,
    });
  }

  type WithControllerCallback<ReturnValue> = (payload: {
    controller: UiStateController;
    rootMessenger: RootMessenger;
    messenger: UiStateControllerMessenger;
  }) => Promise<ReturnValue> | ReturnValue;

  type WithControllerOptions = {
    options: Partial<ConstructorParameters<typeof UiStateController>[0]>;
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
    const controller = new UiStateController({
      messenger,
      ...options,
    });
    return await testFunction({ controller, rootMessenger, messenger });
  }

  describe('constructor', () => {
    it('initializes with default state (client closed)', async () => {
      await withController(({ controller }) => {
        expect(controller.state).toMatchInlineSnapshot(`
          Object {
            "isUiOpen": false,
          }
        `);
      });
    });

    it('allows initializing with partial state', async () => {
      const givenState = { isUiOpen: true };
      await withController(
        { options: { state: givenState } },
        ({ controller }) => {
          expect(controller.state).toStrictEqual(givenState);
        },
      );
    });

    it('merges partial state with defaults', async () => {
      await withController({ options: { state: {} } }, ({ controller }) => {
        expect(controller.state).toMatchInlineSnapshot(`
          Object {
            "isUiOpen": false,
          }
        `);
      });
    });
  });

  describe('setUiOpen', () => {
    it('updates isUiOpen in state to the given value', async () => {
      await withController(({ controller }) => {
        controller.setUiOpen(true);

        expect(controller.state).toMatchInlineSnapshot(`
          Object {
            "isUiOpen": true,
          }
        `);

        controller.setUiOpen(false);

        expect(controller.state).toMatchInlineSnapshot(`
          Object {
            "isUiOpen": false,
          }
        `);
      });
    });
  });

  describe('messenger actions', () => {
    it('allows setting client open via messenger action', async () => {
      await withController(({ controller, messenger }) => {
        messenger.call(`${controllerName}:setUiOpen`, true);
        expect(controller.state).toStrictEqual({ isUiOpen: true });
      });
    });

    it('allows setting client closed via messenger action', async () => {
      await withController(({ controller, messenger }) => {
        controller.setUiOpen(true);
        messenger.call(`${controllerName}:setUiOpen`, false);
        expect(controller.state).toStrictEqual({ isUiOpen: false });
      });
    });
  });

  describe('getDefaultUiStateControllerState', () => {
    it('returns default state with client closed', () => {
      const defaultState = getDefaultUiStateControllerState();

      expect(defaultState.isUiOpen).toBe(false);
    });
  });

  describe('selectors', () => {
    describe('selectIsUiOpen', () => {
      it('returns true when client is open', () => {
        expect(
          uiStateControllerSelectors.selectIsUiOpen({
            isUiOpen: true,
          }),
        ).toBe(true);
      });

      it('returns false when client is closed', () => {
        expect(
          uiStateControllerSelectors.selectIsUiOpen({
            isUiOpen: false,
          }),
        ).toBe(false);
      });
    });
  });
});
