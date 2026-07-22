import { ClaimsService } from '@metamask/claims-controller';
import { Env } from '@metamask/claims-controller';
import { Messenger } from '@metamask/messenger';

import { defaultConfigurations } from '../../defaults.js';
import type {
  DefaultActions,
  DefaultEvents,
  RootMessenger,
} from '../../defaults.js';
import { claimsService } from './claims-service.js';
import type { ClaimsServiceInstanceOptions } from './types.js';

const REQUIRED_OPTIONS: ClaimsServiceInstanceOptions = {
  env: Env.DEV,
  fetchFunction: globalThis.fetch,
};

type ActionHandler = (...args: unknown[]) => unknown;

type AnyMessenger = Messenger<string>;

/**
 * Creates a root messenger for use in tests.
 *
 * @returns A root messenger.
 */
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

describe('claimsService', () => {
  it('is registered as a default initialization configuration', () => {
    expect(Object.values(defaultConfigurations)).toContain(claimsService);
  });

  it('initializes a ClaimsService', () => {
    const messenger = claimsService.getMessenger(getRootMessenger());

    const instance = claimsService.init({
      state: undefined,
      messenger,
      options: REQUIRED_OPTIONS,
    });

    expect(instance).toBeInstanceOf(ClaimsService);
  });

  it('forwards env and fetchFunction to the service', async () => {
    const rootMessenger = getRootMessenger();
    const mockGetBearerToken = jest.fn().mockResolvedValue('test-token');
    registerActionHandler(
      rootMessenger,
      'AuthenticationController',
      'AuthenticationController:getBearerToken',
      mockGetBearerToken,
    );

    const messenger = claimsService.getMessenger(rootMessenger);
    claimsService.init({
      state: undefined,
      messenger,
      options: REQUIRED_OPTIONS,
    });

    const headers = await rootMessenger.call('ClaimsService:getRequestHeaders');

    expect(headers).toStrictEqual({ Authorization: 'Bearer test-token' });
    expect(mockGetBearerToken).toHaveBeenCalledTimes(1);
  });

  it('delegates only AuthenticationController:getBearerToken', () => {
    const rootMessenger = getRootMessenger();
    const delegateSpy = jest.spyOn(rootMessenger, 'delegate');

    claimsService.getMessenger(rootMessenger);

    expect(delegateSpy).toHaveBeenCalledWith({
      messenger: expect.any(Messenger),
      actions: ['AuthenticationController:getBearerToken'],
    });
  });

  it('exposes service actions through the root messenger', async () => {
    const rootMessenger = getRootMessenger();
    registerActionHandler(
      rootMessenger,
      'AuthenticationController',
      'AuthenticationController:getBearerToken',
      jest.fn().mockResolvedValue('test-token'),
    );

    const messenger = claimsService.getMessenger(rootMessenger);
    claimsService.init({
      state: undefined,
      messenger,
      options: REQUIRED_OPTIONS,
    });

    expect(rootMessenger.call('ClaimsService:getClaimsApiUrl')).toBe(
      'https://claims.dev-api.cx.metamask.io',
    );
  });
});
