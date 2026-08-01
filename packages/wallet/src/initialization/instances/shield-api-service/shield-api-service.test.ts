import { Messenger } from '@metamask/messenger';
import {
  Env,
  ShieldApiService,
  SHIELD_API_URL_MAP,
} from '@metamask/shield-controller';

import { defaultConfigurations } from '../../defaults.js';
import type {
  DefaultActions,
  DefaultEvents,
  RootMessenger,
} from '../../defaults.js';
import { shieldApiService } from './shield-api-service.js';

type ActionHandler = (...args: unknown[]) => unknown;

type AnyMessenger = Messenger<string>;

function getRootMessenger(): RootMessenger<DefaultActions, DefaultEvents> {
  return new Messenger({ namespace: 'Root' });
}

function registerActionHandler(
  parent: RootMessenger<DefaultActions, DefaultEvents>,
  namespace: string,
  actionType: string,
  handler: ActionHandler,
): void {
  const messenger = new Messenger({
    namespace,
    parent: parent as unknown as AnyMessenger,
  });

  (
    messenger as unknown as {
      registerActionHandler(type: string, handler: ActionHandler): void;
    }
  ).registerActionHandler(actionType, handler);
}

const SHIELD_API_SERVICE_OPTIONS = {
  fetchFunction: globalThis.fetch,
};

describe('shieldApiService', () => {
  it('is registered as a default initialization configuration', () => {
    expect(Object.values(defaultConfigurations)).toContain(shieldApiService);
  });

  it('initializes a ShieldApiService', () => {
    const messenger = shieldApiService.getMessenger(getRootMessenger());

    const instance = shieldApiService.init({
      state: undefined,
      messenger,
      options: SHIELD_API_SERVICE_OPTIONS,
    });

    expect(instance).toBeInstanceOf(ShieldApiService);
  });

  it('defaults env to production', async () => {
    const rootMessenger = getRootMessenger();
    registerActionHandler(
      rootMessenger,
      'AuthenticationController',
      'AuthenticationController:getBearerToken',
      async () => 'test-bearer-token',
    );
    const messenger = shieldApiService.getMessenger(rootMessenger);
    const fetchFunction = jest.fn(async () => {
      const callCount = fetchFunction.mock.calls.length;
      if (callCount === 1) {
        return new globalThis.Response(
          JSON.stringify({ coverageId: 'coverage-id-1' }),
          { status: 200 },
        );
      }

      return new globalThis.Response(
        JSON.stringify({
          status: 'covered',
          metrics: {},
        }),
        { status: 200 },
      );
    });

    const instance = shieldApiService.init({
      state: undefined,
      messenger,
      options: {
        fetchFunction,
      },
    });

    await instance.checkCoverage({
      txMeta: {
        id: 'tx-1',
        chainId: '0x1',
        status: 'unapproved',
        time: Date.now(),
        txParams: {
          from: '0x0000000000000000000000000000000000000000',
        },
      } as never,
    });

    expect(fetchFunction).toHaveBeenCalled();
    const firstCall = fetchFunction.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    const [url, requestInit] = firstCall;
    expect(url).toContain(SHIELD_API_URL_MAP[Env.PRD]);
    const headers = new globalThis.Headers(requestInit.headers);
    expect(headers.get('Authorization')).toBe('Bearer test-bearer-token');
  });

  it('delegates AuthenticationController:getBearerToken', () => {
    const parent = getRootMessenger();
    const delegateSpy = jest.spyOn(parent, 'delegate');
    const messenger = shieldApiService.getMessenger(parent);

    expect(delegateSpy).toHaveBeenCalledWith({
      messenger,
      actions: ['AuthenticationController:getBearerToken'],
      events: [],
    });
  });

  it('exposes its actions through the root messenger', async () => {
    const rootMessenger = getRootMessenger();
    registerActionHandler(
      rootMessenger,
      'AuthenticationController',
      'AuthenticationController:getBearerToken',
      async () => 'token',
    );
    const messenger = shieldApiService.getMessenger(rootMessenger);
    const fetchFunction = jest.fn(async () => {
      const callCount = fetchFunction.mock.calls.length;
      if (callCount === 1) {
        return new globalThis.Response(
          JSON.stringify({ coverageId: 'coverage-id-1' }),
          { status: 200 },
        );
      }

      return new globalThis.Response(
        JSON.stringify({
          status: 'covered',
          metrics: {},
        }),
        { status: 200 },
      );
    });

    shieldApiService.init({
      state: undefined,
      messenger,
      options: {
        env: Env.PRD,
        fetchFunction,
      },
    });

    const result = await rootMessenger.call('ShieldApiService:checkCoverage', {
      txMeta: {
        id: 'tx-1',
        chainId: '0x1',
        status: 'unapproved',
        time: Date.now(),
        txParams: {
          from: '0x0000000000000000000000000000000000000000',
        },
      } as never,
    });

    expect(result.coverageId).toBe('coverage-id-1');
  });
});
