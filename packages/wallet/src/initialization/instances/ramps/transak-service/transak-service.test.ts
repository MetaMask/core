import { TransakEnvironment } from '@metamask/ramps-controller';
import { Messenger } from '@metamask/messenger';

import type {
  DefaultActions,
  DefaultEvents,
  RootMessenger,
} from '../../defaults';
import { transakService } from './transak-service';

describe('transakService', () => {
  it('constructs a TransakService with injected options', () => {
    const parent: RootMessenger<DefaultActions, DefaultEvents> = new Messenger({
      namespace: 'Root',
    });
    const messenger = transakService.getMessenger(parent);
    const fetchMock = jest.fn();

    const service = transakService.init({
      messenger,
      state: undefined,
      options: {
        environment: TransakEnvironment.Staging,
        context: 'test',
        fetch: fetchMock as unknown as typeof fetch,
      },
    });

    expect(service.name).toBe('TransakService');
  });
});
