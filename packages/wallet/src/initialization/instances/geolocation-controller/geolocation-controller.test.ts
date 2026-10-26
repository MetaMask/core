import {
  GeolocationController,
  getDefaultGeolocationControllerState,
} from '@metamask/geolocation-controller';
import { Messenger } from '@metamask/messenger';
import { describe, expect, it, vi } from 'vitest';

import { defaultConfigurations } from '../../defaults.js';
import type {
  DefaultActions,
  DefaultEvents,
  RootMessenger,
} from '../../defaults.js';
import { geolocationApiService } from '../geolocation-api-service/geolocation-api-service.js';
import { geolocationController } from './geolocation-controller.js';

function getRootMessenger(): RootMessenger<DefaultActions, DefaultEvents> {
  return new Messenger({ namespace: 'Root' });
}

describe('geolocationController', () => {
  it('is registered as a default initialization configuration', () => {
    expect(Object.values(defaultConfigurations)).toContain(
      geolocationController,
    );
  });

  it('initializes a GeolocationController with default state', () => {
    const messenger = geolocationController.getMessenger(getRootMessenger());

    const instance = geolocationController.init({
      state: undefined,
      messenger,
      options: {},
    });

    expect(instance).toBeInstanceOf(GeolocationController);
    expect(instance.state).toStrictEqual(
      getDefaultGeolocationControllerState(),
    );
  });

  it('delegates GeolocationApiService:fetchGeolocationData', () => {
    const parent = getRootMessenger();
    const delegateSpy = vi.spyOn(parent, 'delegate');

    const messenger = geolocationController.getMessenger(parent);

    expect(delegateSpy).toHaveBeenCalledWith({
      messenger,
      actions: ['GeolocationApiService:fetchGeolocationData'],
    });
  });

  it('resolves geolocation through the wallet-owned API service', async () => {
    const rootMessenger = getRootMessenger();
    const fetchMock = vi.fn().mockResolvedValue(
      new globalThis.Response(
        JSON.stringify({
          country: 'US',
          region: 'NY',
          timezone: 'America/New_York',
        }),
        { status: 200 },
      ),
    );

    geolocationApiService.init({
      state: undefined,
      messenger: geolocationApiService.getMessenger(rootMessenger),
      options: { fetch: fetchMock },
    });

    geolocationController.init({
      state: undefined,
      messenger: geolocationController.getMessenger(rootMessenger),
      options: {},
    });

    await expect(
      rootMessenger.call('GeolocationController:getGeolocationData'),
    ).resolves.toStrictEqual({
      country: 'US',
      region: 'NY',
      timezone: 'America/New_York',
    });
  });
});
