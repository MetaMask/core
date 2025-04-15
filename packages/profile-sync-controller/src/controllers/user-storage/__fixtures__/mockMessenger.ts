import type { NotNamespacedBy } from '@metamask/base-controller';
import { Messenger } from '@metamask/base-controller';
import { decrypt as ERC1024Decrypt, type EthEncryptedData } from '@metamask/eth-sig-util';
import type { EthKeyring } from '@metamask/keyring-internal-api';

import type {
  AllowedActions,
  AllowedEvents,
  UserStorageControllerMessenger,
} from '..';
import { MOCK_LOGIN_RESPONSE } from '../../authentication/mocks';
import {
  MOCK_ENCRYPTION_PRIVATE_KEY,
  MOCK_ENCRYPTION_PUBLIC_KEY,
  MOCK_STORAGE_KEY_SIGNATURE,
} from '../mocks';

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
 *
 * @param props - overrides
 * @param props.overrideEvents - override events
 * @returns base messenger, and messenger. You can pass this into the mocks below to mock messenger calls
 */
export function createCustomUserStorageMessenger(props?: {
  overrideEvents?: ExternalEvents[];
}) {
  const baseMessenger = new Messenger<AllowedActions, AllowedEvents>();
  const messenger = baseMessenger.getRestricted({
    name: 'UserStorageController',
    allowedActions: [
      'KeyringController:getState',
      'KeyringController:withKeyring',
      'SnapController:handleRequest',
      'AuthenticationController:getBearerToken',
      'AuthenticationController:getSessionProfile',
      'AuthenticationController:isSignedIn',
      'AuthenticationController:performSignIn',
      'AccountsController:listAccounts',
      'AccountsController:updateAccountMetadata',
      'NetworkController:getState',
      'NetworkController:addNetwork',
      'NetworkController:updateNetwork',
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
  baseMessenger: Messenger<AllowedActions, AllowedEvents>;
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

  const mockSnapGetEncryptionPublicKey = jest.fn(() =>
    Promise.resolve(MOCK_ENCRYPTION_PUBLIC_KEY),
  );
  const mockDecryptMessage = jest.fn((data: EthEncryptedData) => {
    return ERC1024Decrypt({
      encryptedData: data,
      privateKey: MOCK_ENCRYPTION_PRIVATE_KEY,
    });
  });

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
  ).mockResolvedValue('New Access Token');

  const mockAuthIsSignedIn = typedMockFn(
    'AuthenticationController:isSignedIn',
  ).mockReturnValue(true);

  const mockKeyringWithKeyring = typedMockFn('KeyringController:withKeyring');
  const mockKeyringGetAccounts = jest.fn();
  const mockKeyringAddAccounts = jest.fn();

  const mockKeyringGetState = typedMockFn(
    'KeyringController:getState',
  ).mockReturnValue({
    isUnlocked: true,
    keyrings: [],
    keyringsMetadata: [],
  });

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

  const mockNetworkControllerUpdateNetwork = typedMockFn(
    'NetworkController:updateNetwork',
  );

  jest.spyOn(messenger, 'call').mockImplementation((...args) => {
    const typedArgs = args as unknown as CallParams;
    const [actionType] = typedArgs;

    if (actionType === 'SnapController:handleRequest') {
      const [, params] = typedArgs;
      switch (params.request.method) {
        case 'getPublicKey':
          return mockSnapGetPublicKey();
        case 'signMessage':
          return mockSnapSignMessage();
        case 'getEncryptionPublicKey':
          return mockSnapGetEncryptionPublicKey();
        case 'decryptMessage':
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return mockDecryptMessage((params.request.params as any).data);
        default:
          throw new Error(
            `MOCK_FAIL - unsupported SnapController:handleRequest call: ${
              params.request.method as string
            }`,
          );
      }
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

    if (actionType === 'KeyringController:withKeyring') {
      const [, ...params] = typedArgs;
      const [, operation] = params;

      const keyring = {
        getAccounts: mockKeyringGetAccounts,
        addAccounts: mockKeyringAddAccounts,
      } as unknown as EthKeyring;

      const metadata = { id: 'mock-id', name: '' };

      return operation({ keyring, metadata });
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

    if (actionType === 'NetworkController:updateNetwork') {
      const [, ...params] = typedArgs;
      return mockNetworkControllerUpdateNetwork(...params);
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
    mockKeyringWithKeyring,
    mockKeyringGetState,
    mockAccountsUpdateAccountMetadata,
    mockAccountsListAccounts,
    mockNetworkControllerGetState,
    mockNetworkControllerAddNetwork,
    mockNetworkControllerRemoveNetwork,
    mockNetworkControllerUpdateNetwork,
  };
}
