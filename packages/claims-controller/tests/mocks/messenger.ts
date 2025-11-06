import {
  Messenger,
  MOCK_ANY_NAMESPACE,
  type MessengerActions,
  type MessengerEvents,
  type MockAnyNamespace,
} from '@metamask/messenger';

import type {
  ClaimsServiceMessenger,
  ClaimsControllerMessenger,
} from '../../src';
import { CONTROLLER_NAME, SERVICE_NAME } from '../../src/constants';

type AllShieldControllerActions = MessengerActions<ClaimsControllerMessenger>;

type AllShieldControllerEvents = MessengerEvents<ClaimsControllerMessenger>;

export type RootControllerMessenger = Messenger<
  MockAnyNamespace,
  AllShieldControllerActions,
  AllShieldControllerEvents
>;

/**
 * Create a mock messenger.
 *
 * @param mockClaimServiceRequestHeaders - A mock function for the claim service request headers.
 * @param mockClaimServiceGetClaimsApiUrl - A mock function for the claim service get claims API URL.
 * @returns A mock messenger.
 */
export function createMockClaimsControllerMessenger(
  mockClaimServiceRequestHeaders: jest.Mock,
  mockClaimServiceGetClaimsApiUrl: jest.Mock,
): {
  rootMessenger: RootControllerMessenger;
  messenger: ClaimsControllerMessenger;
} {
  const rootMessenger = new Messenger<
    MockAnyNamespace,
    AllShieldControllerActions,
    AllShieldControllerEvents
  >({
    namespace: MOCK_ANY_NAMESPACE,
  });

  rootMessenger.registerActionHandler(
    `${SERVICE_NAME}:getRequestHeaders`,
    mockClaimServiceRequestHeaders,
  );
  rootMessenger.registerActionHandler(
    `${SERVICE_NAME}:getClaimsApiUrl`,
    mockClaimServiceGetClaimsApiUrl,
  );

  const messenger = new Messenger<
    typeof CONTROLLER_NAME,
    AllShieldControllerActions,
    AllShieldControllerEvents,
    RootControllerMessenger
  >({
    namespace: CONTROLLER_NAME,
    parent: rootMessenger,
  });
  rootMessenger.delegate({
    messenger,
    events: [],
    actions: [
      `${SERVICE_NAME}:getRequestHeaders`,
      `${SERVICE_NAME}:getClaimsApiUrl`,
    ],
  });

  return {
    rootMessenger,
    messenger,
  };
}

type AllServiceActions = MessengerActions<ClaimsServiceMessenger>;

export type RootServiceMessenger = Messenger<
  MockAnyNamespace,
  AllServiceActions
  // since there's no events for the service, we don't need to specify them
>;

/**
 * Create a mock messenger for the claims service.
 *
 * @param mockAuthenticationControllerGetBearerToken - A mock function for the authentication controller get bearer token.
 * @returns A mock messenger for the claims service.
 */
export function createMockClaimsServiceMessenger(
  mockAuthenticationControllerGetBearerToken: jest.Mock,
): {
  rootMessenger: RootServiceMessenger;
  messenger: ClaimsServiceMessenger;
} {
  const rootMessenger = new Messenger<MockAnyNamespace, AllServiceActions>({
    namespace: MOCK_ANY_NAMESPACE,
  });

  rootMessenger.registerActionHandler(
    'AuthenticationController:getBearerToken',
    mockAuthenticationControllerGetBearerToken,
  );

  const messenger = new Messenger<
    typeof SERVICE_NAME,
    AllServiceActions,
    never, // No events for the service
    RootServiceMessenger
  >({
    namespace: SERVICE_NAME,
    parent: rootMessenger,
  });

  rootMessenger.delegate({
    messenger,
    events: [],
    actions: ['AuthenticationController:getBearerToken'],
  });

  return {
    rootMessenger,
    messenger,
  };
}
