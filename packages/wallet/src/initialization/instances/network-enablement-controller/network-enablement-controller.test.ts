import { Messenger } from '@metamask/messenger';
import { NetworkEnablementController } from '@metamask/network-enablement-controller';
import type { NetworkEnablementControllerState } from '@metamask/network-enablement-controller';
import { describe, expect, it, vi } from 'vitest';

import * as walletExports from '../../../index.js';
import { defaultConfigurations } from '../../defaults.js';
import type {
  DefaultActions,
  DefaultEvents,
  RootMessenger,
} from '../../defaults.js';
import { networkEnablementController } from './network-enablement-controller.js';

type ActionHandler = (...args: unknown[]) => unknown;

type AnyMessenger = Messenger<string>;

const PERSISTED_STATE: NetworkEnablementControllerState = {
  enabledNetworkMap: {
    eip155: {
      '0x1': false,
    },
  },
  nativeAssetIdentifiers: {
    'eip155:1': 'eip155:1/slip44:60',
  },
};

/**
 * Creates a root messenger for use in tests.
 *
 * @returns A root messenger.
 */
function getRootMessenger(): RootMessenger<DefaultActions, DefaultEvents> {
  return new Messenger({ namespace: 'Root' });
}

describe('networkEnablementController', () => {
  it('is registered as a default initialization configuration', () => {
    expect(Object.values(defaultConfigurations)).toContain(
      networkEnablementController,
    );
  });

  it('is exported from the package entry point', () => {
    expect(walletExports.networkEnablementController).toBe(
      networkEnablementController,
    );
  });

  it('initializes a NetworkEnablementController with default state', () => {
    const messenger =
      networkEnablementController.getMessenger(getRootMessenger());

    const instance = networkEnablementController.init({
      state: undefined,
      messenger,
      options: {},
    });

    expect(instance).toBeInstanceOf(NetworkEnablementController);
    expect(instance.state.enabledNetworkMap.eip155?.['0x1']).toBe(true);
    expect(instance.state.nativeAssetIdentifiers).toStrictEqual({});
  });

  it('forwards provided state over the defaults', () => {
    const messenger =
      networkEnablementController.getMessenger(getRootMessenger());

    const instance = networkEnablementController.init({
      state: PERSISTED_STATE,
      messenger,
      options: {},
    });

    expect(instance.state.enabledNetworkMap.eip155?.['0x1']).toBe(false);
    expect(instance.state.nativeAssetIdentifiers).toStrictEqual(
      PERSISTED_STATE.nativeAssetIdentifiers,
    );
  });

  it('exposes its state through the root messenger', () => {
    const rootMessenger = getRootMessenger();
    const messenger = networkEnablementController.getMessenger(rootMessenger);

    networkEnablementController.init({
      state: undefined,
      messenger,
      options: {},
    });

    expect(
      rootMessenger.call('NetworkEnablementController:getState')
        .enabledNetworkMap.eip155?.['0x1'],
    ).toBe(true);
  });

  it.each([
    'ConfigRegistryController:getState',
    'MultichainNetworkController:getState',
    'NetworkController:getState',
  ])('delegates the %s action', (actionType) => {
    const rootMessenger = getRootMessenger();
    const handler = vi.fn().mockReturnValue('result');
    registerActionHandler(rootMessenger, actionType, handler);
    const messenger = networkEnablementController.getMessenger(rootMessenger);

    const result = (
      messenger as unknown as { call(type: string): unknown }
    ).call(actionType);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(result).toBe('result');
  });

  it.each([
    'NetworkController:networkAdded',
    'NetworkController:networkRemoved',
    'NetworkController:stateChange',
    'TransactionController:transactionSubmitted',
  ])('delegates the %s event', (eventType) => {
    const rootMessenger = getRootMessenger();
    const messenger = networkEnablementController.getMessenger(rootMessenger);
    const listener = vi.fn();
    (
      messenger as unknown as {
        subscribe(type: string, handler: ActionHandler): void;
      }
    ).subscribe(eventType, listener);

    publishEvent(rootMessenger, eventType, 'payload');

    expect(listener).toHaveBeenCalledWith('payload');
  });
});

function registerActionHandler(
  parent: RootMessenger<DefaultActions, DefaultEvents>,
  actionType: string,
  handler: ActionHandler,
): void {
  const messenger = new Messenger({
    namespace: actionType.split(':')[0],
    parent: parent as unknown as AnyMessenger,
  });

  (
    messenger as unknown as {
      registerActionHandler(type: string, handler: ActionHandler): void;
    }
  ).registerActionHandler(actionType, handler);
}

function publishEvent(
  parent: RootMessenger<DefaultActions, DefaultEvents>,
  eventType: string,
  ...payload: unknown[]
): void {
  const messenger = new Messenger({
    namespace: eventType.split(':')[0],
    parent: parent as unknown as AnyMessenger,
  });

  (
    messenger as unknown as {
      publish(type: string, ...payload: unknown[]): void;
    }
  ).publish(eventType, ...payload);
}
