/* eslint-disable jsdoc/require-jsdoc */

import { Messenger } from '@metamask/base-controller';

import { EntropySourceWallet } from './EntropySourceRule';
import type {
  AccountTreeControllerActions,
  AccountTreeControllerEvents,
  AccountTreeControllerMessenger,
  AllowedActions,
  AllowedEvents,
} from '../AccountTreeController';

function getRootMessenger() {
  return new Messenger<
    AccountTreeControllerActions | AllowedActions,
    AccountTreeControllerEvents | AllowedEvents
  >();
}

function getAccountTreeControllerMessenger(
  messenger = getRootMessenger(),
): AccountTreeControllerMessenger {
  return messenger.getRestricted({
    name: 'AccountTreeController',
    allowedEvents: [],
    allowedActions: ['KeyringController:getState'],
  });
}

describe('EntropySourceWallet', () => {
  it('throws if keyring index cannot be found', () => {
    const rootMessenger = getRootMessenger();

    rootMessenger.registerActionHandler('KeyringController:getState', () => ({
      isUnlocked: true,
      keyrings: [], // For test purpose, we do add any keyrings.
    }));

    const messenger = getAccountTreeControllerMessenger(rootMessenger);
    const wallet = new EntropySourceWallet(messenger, 'unknown-entropy-source');
    expect(() => wallet.getDefaultName()).toThrow(
      'Unable to get index for entropy source',
    );
  });
});
