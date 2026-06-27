import { RampsEnvironment } from '@metamask/ramps-controller';
import { Messenger } from '@metamask/messenger';

import type {
  DefaultActions,
  DefaultEvents,
  RootMessenger,
} from '../../defaults';
import { rampsService } from './ramps-service';

describe('rampsService', () => {
  it('constructs a RampsService with injected options', () => {
    const parent: RootMessenger<DefaultActions, DefaultEvents> = new Messenger({
      namespace: 'Root',
    });
    const messenger = rampsService.getMessenger(parent);
    const fetchMock = jest.fn();

    const service = rampsService.init({
      messenger,
      state: undefined,
      options: {
        environment: RampsEnvironment.Staging,
        context: 'test',
        fetch: fetchMock as unknown as typeof fetch,
      },
    });

    expect(service.name).toBe('RampsService');
  });
});
