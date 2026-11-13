import { Env, GeolocationApiService } from '@metamask/geolocation-controller';
import { Messenger } from '@metamask/messenger';
import type { Mock } from 'vitest';
import { describe, expect, it, vi } from 'vitest';

import { defaultConfigurations } from '../../defaults.js';
import type {
  DefaultActions,
  DefaultEvents,
  RootMessenger,
} from '../../defaults.js';
import { geolocationApiService } from './geolocation-api-service.js';

function getRootMessenger(): RootMessenger<DefaultActions, DefaultEvents> {
  return new Messenger({ namespace: 'Root' });
}

function makeFetchMock(body: unknown): Mock {
  return vi
    .fn()
    .mockResolvedValue(
      new globalThis.Response(JSON.stringify(body), { status: 200 }),
    );
}

describe('geolocationApiService', () => {
  it('is registered as a default initialization configuration', () => {
    expect(Object.values(defaultConfigurations)).toContain(
      geolocationApiService,
    );
  });

  it('initializes a GeolocationApiService', () => {
    const messenger = geolocationApiService.getMessenger(getRootMessenger());

    const instance = geolocationApiService.init({
      state: undefined,
      messenger,
      options: {},
    });

    expect(instance).toBeInstanceOf(GeolocationApiService);
  });

  it('uses the provided env to determine the API URL', async () => {
    const fetchMock = makeFetchMock({
      country: 'US',
      region: 'NY',
      timezone: 'America/New_York',
    });
    const messenger = geolocationApiService.getMessenger(getRootMessenger());

    const instance = geolocationApiService.init({
      state: undefined,
      messenger,
      options: { env: Env.DEV, fetch: fetchMock },
    });

    await instance.fetchGeolocationData();

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain('dev-api.cx.metamask.io');
  });
});
