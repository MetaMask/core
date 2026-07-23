import {
  ClaimsController,
  getDefaultClaimsControllerState,
} from '@metamask/claims-controller';
import { Env } from '@metamask/claims-controller';
import { Messenger } from '@metamask/messenger';

import { defaultConfigurations } from '../../defaults.js';
import type {
  DefaultActions,
  DefaultEvents,
  RootMessenger,
} from '../../defaults.js';
import { claimsController } from './claims-controller.js';
import { claimsService } from './claims-service.js';
import type { ClaimsServiceInstanceOptions } from './types.js';

const CLAIMS_SERVICE_OPTIONS: ClaimsServiceInstanceOptions = {
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

describe('claimsController', () => {
  it('is registered as a default initialization configuration', () => {
    expect(Object.values(defaultConfigurations)).toContain(claimsController);
  });

  it('initializes a ClaimsController with default state', () => {
    const messenger = claimsController.getMessenger(getRootMessenger());

    const instance = claimsController.init({
      state: undefined,
      messenger,
      options: {},
    });

    expect(instance).toBeInstanceOf(ClaimsController);
    expect(instance.state).toStrictEqual(getDefaultClaimsControllerState());
  });

  it('merges provided state over the defaults', () => {
    const messenger = claimsController.getMessenger(getRootMessenger());

    const instance = claimsController.init({
      state: { drafts: [{ id: 'draft-1' }] },
      messenger,
      options: {},
    });

    expect(instance.state.drafts).toStrictEqual([{ id: 'draft-1' }]);
  });

  it('delegates only the ClaimsService and Keyring actions it uses', () => {
    const rootMessenger = getRootMessenger();
    const delegateSpy = jest.spyOn(rootMessenger, 'delegate');

    claimsController.getMessenger(rootMessenger);

    expect(delegateSpy).toHaveBeenCalledWith({
      messenger: expect.any(Messenger),
      actions: [
        'ClaimsService:fetchClaimsConfigurations',
        'ClaimsService:getRequestHeaders',
        'ClaimsService:getClaimsApiUrl',
        'ClaimsService:generateMessageForClaimSignature',
        'ClaimsService:getClaims',
        'KeyringController:signPersonalMessage',
      ],
    });
  });

  it('exposes its state through the root messenger', () => {
    const rootMessenger = getRootMessenger();
    const messenger = claimsController.getMessenger(rootMessenger);

    claimsController.init({
      state: undefined,
      messenger,
      options: {},
    });

    expect(rootMessenger.call('ClaimsController:getState')).toStrictEqual(
      getDefaultClaimsControllerState(),
    );
  });

  it('routes ClaimsService actions when both units are initialized', async () => {
    const rootMessenger = getRootMessenger();
    registerActionHandler(
      rootMessenger,
      'AuthenticationController',
      'AuthenticationController:getBearerToken',
      jest.fn().mockResolvedValue('test-token'),
    );

    const serviceMessenger = claimsService.getMessenger(rootMessenger);
    claimsService.init({
      state: undefined,
      messenger: serviceMessenger,
      options: CLAIMS_SERVICE_OPTIONS,
    });

    const controllerMessenger = claimsController.getMessenger(rootMessenger);
    claimsController.init({
      state: undefined,
      messenger: controllerMessenger,
      options: {},
    });

    const config = await rootMessenger.call(
      'ClaimsController:getSubmitClaimConfig',
      {
        chainId: '0x1',
        email: 'test@test.com',
        impactedWalletAddress: '0x123',
        impactedTxHash: '0x123',
        reimbursementWalletAddress: '0x456',
        description: 'test description',
        signature:
          '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef12',
      },
    );

    expect(config).toStrictEqual({
      data: {
        chainId: '0x1',
        email: 'test@test.com',
        impactedWalletAddress: '0x123',
        impactedTxHash: '0x123',
        reimbursementWalletAddress: '0x456',
        description: 'test description',
        signature:
          '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef12',
      },
      headers: { Authorization: 'Bearer test-token' },
      method: 'POST',
      url: 'https://claims.dev-api.cx.metamask.io/claims',
    });
  });
});
