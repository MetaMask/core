import { Messenger } from '@metamask/messenger';
import {
  PreferencesController,
  getDefaultPreferencesState,
} from '@metamask/preferences-controller';

import { defaultConfigurations } from '../../defaults';
import type {
  DefaultActions,
  DefaultEvents,
  RootMessenger,
} from '../../defaults';
import { preferencesController } from './preferences-controller';

/**
 * Creates a root messenger for use in tests.
 *
 * @returns A root messenger.
 */
function getRootMessenger(): RootMessenger<DefaultActions, DefaultEvents> {
  return new Messenger({ namespace: 'Root' });
}

describe('preferencesController', () => {
  it('is registered as a default initialization configuration', () => {
    expect(Object.values(defaultConfigurations)).toContain(
      preferencesController,
    );
  });

  it('initializes a PreferencesController with default state', () => {
    const messenger = preferencesController.getMessenger(getRootMessenger());

    const instance = preferencesController.init({
      state: undefined,
      messenger,
      options: {},
    });

    expect(instance).toBeInstanceOf(PreferencesController);
    expect(instance.state).toStrictEqual(getDefaultPreferencesState());
  });

  it('merges provided state over the defaults', () => {
    const messenger = preferencesController.getMessenger(getRootMessenger());

    const instance = preferencesController.init({
      state: { ipfsGateway: 'https://example.com/ipfs/', privacyMode: true },
      messenger,
      options: {},
    });

    expect(instance.state.ipfsGateway).toBe('https://example.com/ipfs/');
    expect(instance.state.privacyMode).toBe(true);
    expect(instance.state.useTokenDetection).toBe(
      getDefaultPreferencesState().useTokenDetection,
    );
  });

  it('exposes its state through the root messenger', () => {
    const rootMessenger = getRootMessenger();
    const messenger = preferencesController.getMessenger(rootMessenger);

    preferencesController.init({ state: undefined, messenger, options: {} });

    expect(rootMessenger.call('PreferencesController:getState')).toStrictEqual(
      getDefaultPreferencesState(),
    );
  });

  it('registers its method actions on the root messenger', () => {
    const rootMessenger = getRootMessenger();
    const messenger = preferencesController.getMessenger(rootMessenger);

    const instance = preferencesController.init({
      state: undefined,
      messenger,
      options: {},
    });

    rootMessenger.call(
      'PreferencesController:setIpfsGateway',
      'https://x/ipfs/',
    );

    expect(instance.state.ipfsGateway).toBe('https://x/ipfs/');
  });
});
