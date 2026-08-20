import {
  ConfigRegistryApiEnv,
  ConfigRegistryApiService,
} from '@metamask/config-registry-controller';
import { Messenger } from '@metamask/messenger';

import { defaultConfigurations } from '../../defaults.js';
import type {
  DefaultActions,
  DefaultEvents,
  RootMessenger,
} from '../../defaults.js';
import { configRegistryApiService } from './config-registry-api-service.js';

const MOCK_API_RESPONSE = {
  data: { version: '1.0.0', timestamp: 1234567890, chains: [] },
};

function getRootMessenger(): RootMessenger<DefaultActions, DefaultEvents> {
  return new Messenger({ namespace: 'Root' });
}

function makeFetchMock(response = MOCK_API_RESPONSE): jest.Mock {
  return jest
    .fn()
    .mockResolvedValue(
      new globalThis.Response(JSON.stringify(response), { status: 200 }),
    );
}

describe('configRegistryApiService', () => {
  it('is registered as a default initialization configuration', () => {
    expect(Object.values(defaultConfigurations)).toContain(
      configRegistryApiService,
    );
  });

  it('initializes a ConfigRegistryApiService', () => {
    const messenger = configRegistryApiService.getMessenger(getRootMessenger());

    const instance = configRegistryApiService.init({
      state: undefined,
      messenger,
      options: {},
    });

    expect(instance).toBeInstanceOf(ConfigRegistryApiService);
  });

  it('defaults env to production', async () => {
    const fetchMock = makeFetchMock();
    const messenger = configRegistryApiService.getMessenger(getRootMessenger());

    const instance = configRegistryApiService.init({
      state: undefined,
      messenger,
      options: { fetch: fetchMock },
    });

    await instance.fetchConfig();

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    // PRD URL has no env prefix - UAT would contain "uat-"
    expect(url).toContain('client-config.api.cx.metamask.io');
    expect(url).not.toContain(ConfigRegistryApiEnv.UAT);
  });

  it('exposes its actions through the root messenger', async () => {
    const rootMessenger = getRootMessenger();
    const messenger = configRegistryApiService.getMessenger(rootMessenger);

    configRegistryApiService.init({
      state: undefined,
      messenger,
      options: { fetch: makeFetchMock() },
    });

    const result = await rootMessenger.call(
      'ConfigRegistryApiService:fetchConfig',
    );
    expect(result.modified).toBe(true);
  });
});
