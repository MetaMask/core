import { Messenger } from '@metamask/messenger';

import type {
  DefaultActions,
  DefaultEvents,
  RootMessenger,
} from '../../defaults';
import { rampsController } from './ramps-controller';

describe('rampsController', () => {
  it('constructs a RampsController with default state', () => {
    const parent: RootMessenger<DefaultActions, DefaultEvents> = new Messenger({
      namespace: 'Root',
    });
    const messenger = rampsController.getMessenger(parent);

    const controller = rampsController.init({
      messenger,
      state: undefined,
      options: {},
    });

    expect(controller.name).toBe('RampsController');
    expect(controller.state.userRegion).toBeNull();
  });
});
