import type { NotNamespacedBy } from '@metamask/base-controller';
import { ControllerMessenger } from '@metamask/base-controller';

import { MOCK_STORAGE_KEY_SIGNATURE } from '.';
import type {
  AllowedActions,
  AllowedEvents,
  UserStorageControllerMessenger,
} from '..';

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
  'UserStorageController',
  AllowedEvents['type']
>;

/**
 * creates a custom user storage messenger, in case tests need different permissions
 * @param props - overrides
 * @param props.overrideEvents - override events
 * @returns base messenger, and messenger. You can pass this into the mocks below to mock messenger calls
 */
export function createCustomUserStorageMessenger(props?: {
  overrideEvents?: ExternalEvents[];
}) {
  const baseMessenger = new ControllerMessenger<
    AllowedActions,
    AllowedEvents
  >();
  const messenger = baseMessenger.getRestricted({
    name: 'UserStorageController',
    allowedActions: [
      'KeyringController:getState',
      'KeyringController:addNewAccount',
      'SnapController:handleRequest',
      'AuthenticationController:getBearerToken',
      'AuthenticationController:getSessionProfile',
      'AuthenticationController:isSignedIn',
      'AuthenticationController:performSignOut',
      'AuthenticationController:performSignIn',
      'NotificationServicesController:disableNotificationServices',
      'NotificationServicesController:selectIsNotificationServicesEnabled',
      'AccountsController:listAccounts',
      'AccountsController:updateAccountMetadata',
      'NetworkController:getState',
      'NetworkController:addNetwork',
      'NetworkController:dangerouslySetNetworkConfiguration',
      'NetworkController:removeNetwork',
    ],
    allowedEvents: props?.overrideEvents ?? [
      'KeyringController:lock',
      'KeyringController:unlock',
      'AccountsController:accountAdded',
      'AccountsController:accountRenamed',
      'NetworkController:networkRemoved',
    ],
  });

  return {
    baseMessenger,
    messenger,
  };
}

type OverrideMessengers = {
  baseMessenger: ControllerMessenger<AllowedActions, AllowedEvents>;
  messenger: UserStorageControllerMessenger;
};

/**
 * Jest Mock Utility to generate a mock User Storage Messenger
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
    identifierId: '',
    profileId: 'MOCK_PROFILE_ID',
  });

  const mockAuthPerformSignIn = typedMockFn(
    'AuthenticationController:performSignIn',
  ).mockResolvedValue('New Access Token');

  const mockAuthIsSignedIn = typedMockFn(
    'AuthenticationController:isSignedIn',
  ).mockReturnValue(true);

  const mockAuthPerformSignOut = typedMockFn(
    'AuthenticationController:performSignOut',
  );

  const mockNotificationServicesIsEnabled = typedMockFn(
    'NotificationServicesController:selectIsNotificationServicesEnabled',
  ).mockReturnValue(true);

  const mockNotificationServicesDisableNotifications = typedMockFn(
    'NotificationServicesController:disableNotificationServices',
  ).mockResolvedValue();

  const mockKeyringAddNewAccount = typedMockFn(
    'KeyringController:addNewAccount',
  );

  // Untyped mock as there is a TS(2742) issue.
  // This will return `InternalAccount[]`
  const mockAccountsListAccounts = jest.fn();

  const mockAccountsUpdateAccountMetadata = typedMockFn(
    'AccountsController:updateAccountMetadata',
  ).mockResolvedValue(true as never);

  const mockNetworkControllerGetState = typedMockFn(
    'NetworkController:getState',
  ).mockReturnValue({
    selectedNetworkClientId: '',
    networksMetadata: {},
    networkConfigurationsByChainId: {},
  });

  const mockNetworkControllerAddNetwork = typedMockFn(
    'NetworkController:addNetwork',
  );

  const mockNetworkControllerRemoveNetwork = typedMockFn(
    'NetworkController:removeNetwork',
  );

  const mockNetworkControllerDangerouslySetNetworkConfiguration = typedMockFn(
    'NetworkController:dangerouslySetNetworkConfiguration',
  );

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

    if (
      actionType ===
      'NotificationServicesController:selectIsNotificationServicesEnabled'
    ) {
      return mockNotificationServicesIsEnabled();
    }

    if (
      actionType ===
      'NotificationServicesController:disableNotificationServices'
    ) {
      return mockNotificationServicesDisableNotifications();
    }

    if (actionType === 'AuthenticationController:performSignOut') {
      return mockAuthPerformSignOut();
    }

    if (actionType === 'KeyringController:getState') {
      return { isUnlocked: true };
    }

    if (actionType === 'KeyringController:addNewAccount') {
      return mockKeyringAddNewAccount();
    }

    if (actionType === 'AccountsController:listAccounts') {
      return mockAccountsListAccounts();
    }

    if (typedArgs[0] === 'AccountsController:updateAccountMetadata') {
      const [, ...params] = typedArgs;
      return mockAccountsUpdateAccountMetadata(...params);
    }

    if (actionType === 'NetworkController:getState') {
      return mockNetworkControllerGetState();
    }

    if (actionType === 'NetworkController:addNetwork') {
      const [, ...params] = typedArgs;
      return mockNetworkControllerAddNetwork(...params);
    }

    if (actionType === 'NetworkController:removeNetwork') {
      const [, ...params] = typedArgs;
      return mockNetworkControllerRemoveNetwork(...params);
    }

    if (actionType === 'NetworkController:dangerouslySetNetworkConfiguration') {
      const [, ...params] = typedArgs;
      return mockNetworkControllerDangerouslySetNetworkConfiguration(...params);
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
    mockNotificationServicesIsEnabled,
    mockNotificationServicesDisableNotifications,
    mockAuthPerformSignOut,
    mockKeyringAddNewAccount,
    mockAccountsUpdateAccountMetadata,
    mockAccountsListAccounts,
    mockNetworkControllerGetState,
    mockNetworkControllerAddNetwork,
    mockNetworkControllerRemoveNetwork,
    mockNetworkControllerDangerouslySetNetworkConfiguration,
  };
}
