import { Messenger } from '@metamask/messenger';

import type {
  DefaultActions,
  DefaultEvents,
  RootMessenger,
} from '../../defaults.js';
import { networkController } from './network-controller.js';

function getRootMessenger(): RootMessenger<DefaultActions, DefaultEvents> {
  return new Messenger({ namespace: 'Root' });
}

describe('networkController', () => {
  it('delegates AuthenticationController:getBearerToken', () => {
    const parent = getRootMessenger();
    const delegateSpy = jest.spyOn(parent, 'delegate');
    const messenger = networkController.getMessenger(parent);

    expect(delegateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        messenger,
        actions: expect.arrayContaining([
          'AuthenticationController:getBearerToken',
        ]),
      }),
    );
  });
});
