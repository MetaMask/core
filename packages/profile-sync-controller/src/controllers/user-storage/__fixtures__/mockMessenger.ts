import {
  Messenger,
  MOCK_ANY_NAMESPACE,
  type MockAnyNamespace,
  type MessengerActions,
  type MessengerEvents,
  type NotNamespacedBy,
} from '@metamask/messenger';

import type {
  AllowedActions,
  AllowedEvents,
  UserStorageControllerMessenger,
} from '..';
import { MOCK_LOGIN_RESPONSE } from '../../authentication/mocks';
import { MOCK_STORAGE_KEY_SIGNATURE } from '../mocks';

const controllerName = 'UserStorageController';

type GetHandler<ActionType extends AllowedActions['type']> = Extract<
  AllowedActions,
  { type: ActionType }
>['handler'];

type CallParams = {
  [K in AllowedActions['type']]: [
    K,
    ...Parameters<Extract<AllowedActions, { type: K }>['handler']>,
  ];
}[AllowedActions['type']];

const typedMockFn = <
  ActionType extends AllowedActions['type'],
  Handler = GetHandler<ActionType>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Func extends (...args: any) => any = Handler extends (...args: any[]) => any
    ? Handler
    : never,
>(
  _type: ActionType,
) => jest.fn<ReturnType<Func>, Parameters<Func>>();

type ExternalEvents = NotNamespacedBy<
  typeof controllerName,
  AllowedEvents['type']
>;

type AllUserStorageControllerActions =
  MessengerActions<UserStorageControllerMessenger>;

type AllUserStorageControllerEvents =
  MessengerEvents<UserStorageControllerMessenger>;

type RootMessenger = Messenger<
  MockAnyNamespace,
  AllUserStorageControllerActions,
  AllUserStorageControllerEvents
>;

/**
 * creates a custom user storage messenger, in case tests need different permissions
 *
 * @param props - overrides
 * @param props.overrideEvents - override events
 * @returns base messenger, and messenger. You can pass this into the mocks below to mock messenger calls
 */
export function createCustomUserStorageMessenger(props?: {
  overrideEvents?: ExternalEvents[];
}) {
  const rootMessenger: RootMessenger = new Messenger({
    namespace: MOCK_ANY_NAMESPACE,
  });
  const messenger = new Messenger<
    typeof controllerName,
    AllUserStorageControllerActions,
    AllUserStorageControllerEvents,
    RootMessenger
  >({
    namespace: controllerName,
    parent: rootMessenger,
  });
  rootMessenger.delegate({
    messenger,
    actions: [
      'KeyringController:getState',
      'SnapController:handleRequest',
      'AuthenticationController:getBearerToken',
      'AuthenticationController:getSessionProfile',
      'AuthenticationController:isSignedIn',
      'AuthenticationController:performSignIn',
    ],
    events: props?.overrideEvents ?? [
      'KeyringController:lock',
      'KeyringController:unlock',
      'AddressBookController:contactUpdated',
      'AddressBookController:contactDeleted',
    ],
  });

  return {
    baseMessenger: rootMessenger,
    messenger,
  };
}

type OverrideMessengers = {
  baseMessenger: RootMessenger;
  messenger: UserStorageControllerMessenger;
};

/**
 * Jest Mock Utility to generate a mock User Storage Messenger
 *
 * @param overrideMessengers - override messengers if need to modify the underlying permissions
 * @returns series of mocks to actions that can be called
 */
export function mockUserStorageMessenger(
  overrideMessengers?: OverrideMessengers,
) {
  const { baseMessenger, messenger } =
    overrideMessengers ?? createCustomUserStorageMessenger();

  const mockSnapGetPublicKey = jest.fn().mockResolvedValue('MOCK_PUBLIC_KEY');
  const mockSnapSignMessage = jest
    .fn()
    .mockResolvedValue(MOCK_STORAGE_KEY_SIGNATURE);

  const mockAuthGetBearerToken = typedMockFn(
    'AuthenticationController:getBearerToken',
  ).mockResolvedValue('MOCK_BEARER_TOKEN');

  const mockAuthGetSessionProfile = typedMockFn(
    'AuthenticationController:getSessionProfile',
  ).mockResolvedValue({
    identifierId: MOCK_LOGIN_RESPONSE.profile.identifier_id,
    profileId: MOCK_LOGIN_RESPONSE.profile.profile_id,
    metaMetricsId: MOCK_LOGIN_RESPONSE.profile.metametrics_id,
  });

  const mockAuthPerformSignIn = typedMockFn(
    'AuthenticationController:performSignIn',
  ).mockResolvedValue(['New Access Token']);

  const mockAuthIsSignedIn = typedMockFn(
    'AuthenticationController:isSignedIn',
  ).mockReturnValue(true);

  const mockKeyringGetAccounts = jest.fn();
  const mockKeyringAddAccounts = jest.fn();
  const mockWithKeyringSelector = jest.fn();

  const mockKeyringGetState = typedMockFn(
    'KeyringController:getState',
  ).mockReturnValue({
    isUnlocked: true,
    keyrings: [],
  });

  const mockAccountsListAccounts = jest.fn();

  jest.spyOn(messenger, 'call').mockImplementation((...args) => {
    const typedArgs = args as unknown as CallParams;
    const [actionType] = typedArgs;

    if (actionType === 'SnapController:handleRequest') {
      const [, params] = typedArgs;
      if (params.request.method === 'getPublicKey') {
        return mockSnapGetPublicKey();
      }

      if (params.request.method === 'signMessage') {
        return mockSnapSignMessage();
      }

      throw new Error(
        `MOCK_FAIL - unsupported SnapController:handleRequest call: ${
          params.request.method as string
        }`,
      );
    }

    if (actionType === 'AuthenticationController:getBearerToken') {
      return mockAuthGetBearerToken();
    }

    if (actionType === 'AuthenticationController:getSessionProfile') {
      return mockAuthGetSessionProfile();
    }

    if (actionType === 'AuthenticationController:performSignIn') {
      return mockAuthPerformSignIn();
    }

    if (actionType === 'AuthenticationController:isSignedIn') {
      return mockAuthIsSignedIn();
    }

    if (actionType === 'KeyringController:getState') {
      return mockKeyringGetState();
    }

    throw new Error(
      `MOCK_FAIL - unsupported messenger call: ${actionType as string}`,
    );
  });

  return {
    baseMessenger,
    messenger,
    mockSnapGetPublicKey,
    mockSnapSignMessage,
    mockAuthGetBearerToken,
    mockAuthGetSessionProfile,
    mockAuthPerformSignIn,
    mockAuthIsSignedIn,
    mockKeyringGetAccounts,
    mockKeyringAddAccounts,
    mockKeyringGetState,
    mockWithKeyringSelector,
    mockAccountsListAccounts,
  };
}
