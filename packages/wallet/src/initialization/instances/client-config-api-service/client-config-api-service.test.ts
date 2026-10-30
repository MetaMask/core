import { Messenger } from '@metamask/messenger';
import {
  ClientConfigApiService,
  ClientType,
  DistributionType,
  EnvironmentType,
} from '@metamask/remote-feature-flag-controller';
import type { Mock } from 'vitest';
import { describe, expect, it, vi } from 'vitest';

import { defaultConfigurations } from '../../defaults.js';
import type {
  DefaultActions,
  DefaultEvents,
  RootMessenger,
} from '../../defaults.js';
import { clientConfigApiService } from './client-config-api-service.js';

const CONFIG = {
  client: ClientType.Mobile,
  distribution: DistributionType.Flask,
  environment: EnvironmentType.ReleaseCandidate,
};

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

describe('clientConfigApiService', () => {
  it('is registered as a default initialization configuration', () => {
    expect(Object.values(defaultConfigurations)).toContain(
      clientConfigApiService,
    );
  });

  it('initializes a ClientConfigApiService', () => {
    const messenger = clientConfigApiService.getMessenger(getRootMessenger());

    const instance = clientConfigApiService.init({
      state: undefined,
      messenger,
      options: { fetch: makeFetchMock([]), config: CONFIG },
    });

    expect(instance).toBeInstanceOf(ClientConfigApiService);
  });

  it('uses the provided fetch and config', async () => {
    const fetchMock = makeFetchMock([{ testFlag: true }]);
    const messenger = clientConfigApiService.getMessenger(getRootMessenger());

    const instance = clientConfigApiService.init({
      state: undefined,
      messenger,
      options: { fetch: fetchMock, config: CONFIG },
    });

    const result = await instance.fetchRemoteFeatureFlags();

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('client=mobile&distribution=flask&environment=rc');
    expect(result.remoteFeatureFlags).toStrictEqual({ testFlag: true });
  });

  it('forwards policyOptions to the service', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('Network error'));
    const messenger = clientConfigApiService.getMessenger(getRootMessenger());

    const instance = clientConfigApiService.init({
      state: undefined,
      messenger,
      options: {
        fetch: fetchMock,
        config: CONFIG,
        policyOptions: { maxRetries: 1, maxConsecutiveFailures: 100 },
      },
    });

    await expect(instance.fetchRemoteFeatureFlags()).rejects.toThrow(
      'Network error',
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('exposes its actions through the root messenger', async () => {
    const rootMessenger = getRootMessenger();
    const messenger = clientConfigApiService.getMessenger(rootMessenger);

    clientConfigApiService.init({
      state: undefined,
      messenger,
      options: { fetch: makeFetchMock([{ testFlag: true }]), config: CONFIG },
    });

    expect(
      await rootMessenger.call(
        'ClientConfigApiService:fetchRemoteFeatureFlags',
      ),
    ).toStrictEqual({
      remoteFeatureFlags: { testFlag: true },
      cacheTimestamp: expect.any(Number),
    });
  });
});
