import { deriveStateFromMetadata } from '@metamask/base-controller';
import type {
  AccountAssetListUpdatedEventPayload,
  CaipAssetType,
  CaipAssetTypeOrId,
} from '@metamask/keyring-api';
import {
  EthAccountType,
  EthMethod,
  EthScope,
  SolScope,
} from '@metamask/keyring-api';
import { KeyringTypes } from '@metamask/keyring-controller';
import type { InternalAccount } from '@metamask/keyring-internal-api';
import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MessengerActions,
  MessengerEvents,
  MockAnyNamespace,
} from '@metamask/messenger';
import type { PermissionConstraint } from '@metamask/permission-controller';
import type { SubjectPermissions } from '@metamask/permission-controller';
import type { BulkTokenScanResponse } from '@metamask/phishing-controller';
import { TokenScanResultType } from '@metamask/phishing-controller';
import type { Snap } from '@metamask/snaps-utils';
import { v4 as uuidv4 } from 'uuid';

import {
  getDefaultMultichainAssetsControllerState,
  MultichainAssetsController,
} from '.';
import type {
  AssetMetadataResponse,
  MultichainAssetsControllerMessenger,
  MultichainAssetsControllerState,
} from './MultichainAssetsController';
import { jestAdvanceTime } from '../../../../tests/helpers';

const mockSolanaAccount: InternalAccount = {
  type: 'solana:data-account',
  id: 'a3fc6831-d229-4cd1-87c1-13b1756213d4',
  address: 'EBBYfhQzVzurZiweJ2keeBWpgGLs1cbWYcz28gjGgi5x',
  scopes: [SolScope.Devnet],
  options: {
    scope: SolScope.Devnet,
  },
  methods: ['sendAndConfirmTransaction'],
  metadata: {
    name: 'Snap Account 1',
    importTime: 1737022568097,
    keyring: {
      type: 'Snap Keyring',
    },
    snap: {
      id: 'local:http://localhost:8080',
      name: 'Solana',
      enabled: true,
    },
    lastSelected: 0,
  },
};

const mockEthAccount: InternalAccount = {
  address: '0x807dE1cf8f39E83258904b2f7b473E5C506E4aC1',
  id: uuidv4(),
  metadata: {
    name: 'Ethereum Account 1',
    importTime: Date.now(),
    keyring: {
      type: KeyringTypes.snap,
    },
    snap: {
      id: 'mock-eth-snap',
      name: 'mock-eth-snap',
      enabled: true,
    },
    lastSelected: 0,
  },
  scopes: [EthScope.Eoa],
  options: {},
  methods: [EthMethod.SignTypedDataV4, EthMethod.SignTransaction],
  type: EthAccountType.Eoa,
};

const mockHandleRequestOnAssetsLookupReturnValue = [
  'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1/slip44:501',
  'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1/token:Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr',
];

const mockGetAllSnapsReturnValue = [
  {
    blocked: false,
    enabled: true,
    id: 'local:http://localhost:8080',
    version: '1.0.4',
  },
  {
    blocked: false,
    enabled: true,
    id: 'npm:@metamask/account-watcher',
    version: '4.1.0',
  },
  {
    blocked: false,
    enabled: true,
    id: 'npm:@metamask/bitcoin-wallet-snap',
    version: '0.8.2',
  },
  {
    blocked: false,
    enabled: true,
    id: 'npm:@metamask/ens-resolver-snap',
    version: '0.1.2',
  },
  {
    blocked: false,
    enabled: true,
    id: 'npm:@metamask/message-signing-snap',
    version: '0.6.0',
  },
  {
    blocked: false,
    enabled: true,
    id: 'npm:@metamask/preinstalled-example-snap',
    version: '0.2.0',
  },
  {
    blocked: false,
    enabled: true,
    id: 'npm:@metamask/solana-wallet-snap',
    version: '1.0.3',
  },
];

const mockGetPermissionsReturnValue = [
  {
    'endowment:assets': {
      caveats: [
        {
          type: 'chainIds',
          value: ['solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1'],
        },
      ],
    },
  },
  {
    'endowment:ethereum-provider': {
      caveats: null,
      date: 1736868793768,
      id: 'CTUx_19iltoLo-xnIjGMc',
      invoker: 'npm:@metamask/account-watcher',
      parentCapability: 'endowment:ethereum-provider',
    },
  },
  {
    'endowment:network-access': {
      caveats: null,
      date: 1736868793769,
      id: '9NST-8ZIQO7_BVVJP6JyD',
      invoker: 'npm:@metamask/bitcoin-wallet-snap',
      parentCapability: 'endowment:network-access',
    },
  },
  {
    'endowment:ethereum-provider': {
      caveats: null,
      date: 1736868793767,
      id: '8cUIGf_BjDke2xJSn_kBL',
      invoker: 'npm:@metamask/ens-resolver-snap',
      parentCapability: 'endowment:ethereum-provider',
    },
  },
  {
    'endowment:rpc': {
      date: 1736868793765,
      id: 'j8XfK-fPq13COl7xFQxXn',
      invoker: 'npm:@metamask/message-signing-snap',
      parentCapability: 'endowment:rpc',
    },
  },
  {
    'endowment:rpc': {
      date: 1736868793771,
      id: 'Yd155j5BoXh3BIndgMkAM',
      invoker: 'npm:@metamask/preinstalled-example-snap',
      parentCapability: 'endowment:rpc',
    },
  },
  {
    'endowment:network-access': {
      caveats: null,
      date: 1736868793773,
      id: 'HbXb8MLHbRrQMexyVpQQ7',
      invoker: 'npm:@metamask/solana-wallet-snap',
      parentCapability: 'endowment:network-access',
    },
  },
];

const mockGetMetadataReturnValue: AssetMetadataResponse | undefined = {
  assets: {
    'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1/slip44:501': {
      name: 'Solana',
      symbol: 'SOL',
      fungible: true,
      iconUrl: 'url1',
      units: [{ name: 'Solana', symbol: 'SOL', decimals: 9 }],
    },
    'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1/token:Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr':
      {
        name: 'USDC',
        symbol: 'USDC',
        fungible: true,
        iconUrl: 'url2',
        units: [{ name: 'USDC', symbol: 'SUSDCOL', decimals: 18 }],
      },
  },
};

/**
 * The union of actions that the root messenger allows.
 */
type RootAction = MessengerActions<MultichainAssetsControllerMessenger>;

/**
 * The union of events that the root messenger allows.
 */
type RootEvent = MessengerEvents<MultichainAssetsControllerMessenger>;

/**
 * The root messenger type.
 */
type RootMessenger = Messenger<MockAnyNamespace, RootAction, RootEvent>;

/**
 * Constructs the root messenger. This can be used to call actions and
 * publish events within the tests for this controller.
 *
 * @returns The root messenger suited for MultichainAssetsController.
 */
function getRootMessenger(): RootMessenger {
  return new Messenger({ namespace: MOCK_ANY_NAMESPACE });
}

const setupController = ({
  state = getDefaultMultichainAssetsControllerState(),
  mocks,
}: {
  state?: MultichainAssetsControllerState;
  mocks?: {
    listMultichainAccounts?: InternalAccount[];
    handleRequestReturnValue?: CaipAssetTypeOrId[];
    getAllReturnValue?: Snap[];
    getPermissionsReturnValue?: SubjectPermissions<PermissionConstraint>;
  };
} = {}) => {
  const messenger = getRootMessenger();

  const multichainAssetsControllerMessenger: MultichainAssetsControllerMessenger =
    new Messenger({
      namespace: 'MultichainAssetsController',
      parent: messenger,
    });
  messenger.delegate({
    messenger: multichainAssetsControllerMessenger,
    actions: [
      'AccountsController:listMultichainAccounts',
      'SnapController:handleRequest',
      'SnapController:getAll',
      'PermissionController:getPermissions',
      'PhishingController:bulkScanTokens',
    ],
    events: [
      'AccountsController:accountAdded',
      'AccountsController:accountRemoved',
      'AccountsController:accountAssetListUpdated',
    ],
  });

  const mockSnapHandleRequest = jest.fn();
  messenger.registerActionHandler(
    'SnapController:handleRequest',
    mockSnapHandleRequest.mockReturnValue(
      mocks?.handleRequestReturnValue ??
        mockHandleRequestOnAssetsLookupReturnValue,
    ),
  );

  const mockListMultichainAccounts = jest.fn();
  messenger.registerActionHandler(
    'AccountsController:listMultichainAccounts',
    mockListMultichainAccounts.mockReturnValue(
      mocks?.listMultichainAccounts ?? [mockSolanaAccount, mockEthAccount],
    ),
  );

  const mockGetAllSnaps = jest.fn();
  messenger.registerActionHandler(
    'SnapController:getAll',
    mockGetAllSnaps.mockReturnValue(
      mocks?.getAllReturnValue ?? mockGetAllSnapsReturnValue,
    ),
  );

  const mockGetPermissions = jest.fn();
  messenger.registerActionHandler(
    'PermissionController:getPermissions',
    mockGetPermissions.mockReturnValue(
      mocks?.getPermissionsReturnValue ?? mockGetPermissionsReturnValue[0],
    ),
  );

  const mockBulkScanTokens = jest.fn();
  messenger.registerActionHandler(
    'PhishingController:bulkScanTokens',
    mockBulkScanTokens.mockResolvedValue({}),
  );

  const controller = new MultichainAssetsController({
    messenger: multichainAssetsControllerMessenger,
    state,
  });

  return {
    controller,
    messenger,
    mockSnapHandleRequest,
    mockListMultichainAccounts,
    mockGetAllSnaps,
    mockGetPermissions,
    mockBulkScanTokens,
  };
};

describe('MultichainAssetsController', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });
  it('initialize with default state', () => {
    const { controller } = setupController({});
    expect(controller.state).toStrictEqual({
      accountsAssets: {},
      assetsMetadata: {},
      allIgnoredAssets: {},
    });
  });

  it('does not update state when new account added is EVM', async () => {
    const { controller, messenger } = setupController();

    messenger.publish(
      'AccountsController:accountAdded',
      mockEthAccount as unknown as InternalAccount,
    );

    await jestAdvanceTime({ duration: 1 });

    expect(controller.state).toStrictEqual({
      accountsAssets: {},
      assetsMetadata: {},
      allIgnoredAssets: {},
    });
  });

  it('updates accountsAssets when "AccountsController:accountAdded" is fired', async () => {
    const { controller, messenger, mockSnapHandleRequest, mockGetPermissions } =
      setupController();

    mockSnapHandleRequest
      .mockReturnValueOnce(mockHandleRequestOnAssetsLookupReturnValue)
      .mockReturnValueOnce(mockGetMetadataReturnValue);

    mockGetPermissions
      .mockReturnValueOnce(mockGetPermissionsReturnValue[0])
      .mockReturnValueOnce(mockGetPermissionsReturnValue[1])
      .mockReturnValueOnce(mockGetPermissionsReturnValue[2])
      .mockReturnValueOnce(mockGetPermissionsReturnValue[3])
      .mockReturnValueOnce(mockGetPermissionsReturnValue[4])
      .mockReturnValueOnce(mockGetPermissionsReturnValue[5])
      .mockReturnValueOnce(mockGetPermissionsReturnValue[6]);

    messenger.publish(
      'AccountsController:accountAdded',
      mockSolanaAccount as unknown as InternalAccount,
    );

    await jestAdvanceTime({ duration: 1 });

    expect(controller.state).toStrictEqual({
      accountsAssets: {
        [mockSolanaAccount.id]: mockHandleRequestOnAssetsLookupReturnValue,
      },
      assetsMetadata: mockGetMetadataReturnValue.assets,
      allIgnoredAssets: {},
    });
  });

  it('updates metadata in state successfully when all calls succeed to fetch metadata', async () => {
    const { controller, messenger, mockSnapHandleRequest, mockGetPermissions } =
      setupController();

    const mockHandleRequestOnAssetsLookupResponse = [
      'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1/slip44:501',
      'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1/token:Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr',
      'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44:501',
    ];
    const mockSnapPermissionReturnVal = {
      'endowment:assets': {
        caveats: [
          {
            type: 'chainIds',
            value: [
              'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1',
              'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
            ],
          },
        ],
      },
    };
    const mockGetMetadataResponse: AssetMetadataResponse | undefined = {
      assets: {
        'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44:501': {
          name: 'Solana2',
          symbol: 'SOL',
          fungible: true,
          iconUrl: 'url1',
          units: [{ name: 'Solana2', symbol: 'SOL', decimals: 9 }],
        },
      },
    };

    mockSnapHandleRequest
      .mockReturnValueOnce(mockHandleRequestOnAssetsLookupResponse)
      .mockReturnValueOnce(mockGetMetadataReturnValue)
      .mockReturnValueOnce(mockGetMetadataResponse);

    mockGetPermissions
      .mockReturnValueOnce(mockSnapPermissionReturnVal)
      .mockReturnValueOnce(mockGetPermissionsReturnValue[1])
      .mockReturnValueOnce(mockGetPermissionsReturnValue[2])
      .mockReturnValueOnce(mockGetPermissionsReturnValue[3])
      .mockReturnValueOnce(mockGetPermissionsReturnValue[4])
      .mockReturnValueOnce(mockGetPermissionsReturnValue[5])
      .mockReturnValueOnce(mockGetPermissionsReturnValue[6]);

    messenger.publish(
      'AccountsController:accountAdded',
      mockSolanaAccount as unknown as InternalAccount,
    );

    await jestAdvanceTime({ duration: 1 });

    expect(mockSnapHandleRequest).toHaveBeenCalledTimes(3);

    expect(controller.state).toStrictEqual({
      accountsAssets: {
        [mockSolanaAccount.id]: mockHandleRequestOnAssetsLookupResponse,
      },
      assetsMetadata: {
        ...mockGetMetadataResponse.assets,
        ...mockGetMetadataReturnValue.assets,
      },
      allIgnoredAssets: {},
    });
  });

  it('updates metadata in state successfully when one call to fetch metadata fails', async () => {
    const { controller, messenger, mockSnapHandleRequest, mockGetPermissions } =
      setupController();

    const mockHandleRequestOnAssetsLookupResponse = [
      'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1/slip44:501',
      'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1/token:Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr',
      'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44:501',
    ];
    const mockSnapPermissionReturnVal = {
      'endowment:assets': {
        caveats: [
          {
            type: 'chainIds',
            value: [
              'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1',
              'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
            ],
          },
        ],
      },
    };

    mockSnapHandleRequest
      .mockReturnValueOnce(mockHandleRequestOnAssetsLookupResponse)
      .mockReturnValueOnce(mockGetMetadataReturnValue)
      .mockRejectedValueOnce('Error');

    mockGetPermissions
      .mockReturnValueOnce(mockSnapPermissionReturnVal)
      .mockReturnValueOnce(mockGetPermissionsReturnValue[1])
      .mockReturnValueOnce(mockGetPermissionsReturnValue[2])
      .mockReturnValueOnce(mockGetPermissionsReturnValue[3])
      .mockReturnValueOnce(mockGetPermissionsReturnValue[4])
      .mockReturnValueOnce(mockGetPermissionsReturnValue[5])
      .mockReturnValueOnce(mockGetPermissionsReturnValue[6]);

    messenger.publish(
      'AccountsController:accountAdded',
      mockSolanaAccount as unknown as InternalAccount,
    );

    await jestAdvanceTime({ duration: 1 });

    expect(mockSnapHandleRequest).toHaveBeenCalledTimes(3);

    expect(controller.state).toStrictEqual({
      accountsAssets: {
        [mockSolanaAccount.id]: mockHandleRequestOnAssetsLookupResponse,
      },
      assetsMetadata: {
        ...mockGetMetadataReturnValue.assets,
      },
      allIgnoredAssets: {},
    });
  });

  it('does not delete account from accountsAssets when "AccountsController:accountRemoved" is fired with EVM account', async () => {
    const { controller, messenger, mockSnapHandleRequest, mockGetPermissions } =
      setupController();

    mockSnapHandleRequest
      .mockReturnValueOnce(mockHandleRequestOnAssetsLookupReturnValue)
      .mockReturnValueOnce(mockGetMetadataReturnValue);

    mockGetPermissions
      .mockReturnValueOnce(mockGetPermissionsReturnValue[0])
      .mockReturnValueOnce(mockGetPermissionsReturnValue[1])
      .mockReturnValueOnce(mockGetPermissionsReturnValue[2])
      .mockReturnValueOnce(mockGetPermissionsReturnValue[3])
      .mockReturnValueOnce(mockGetPermissionsReturnValue[4])
      .mockReturnValueOnce(mockGetPermissionsReturnValue[5])
      .mockReturnValueOnce(mockGetPermissionsReturnValue[6]);

    // Add a solana account first
    messenger.publish(
      'AccountsController:accountAdded',
      mockSolanaAccount as unknown as InternalAccount,
    );

    await jestAdvanceTime({ duration: 1 });

    expect(controller.state).toStrictEqual({
      accountsAssets: {
        [mockSolanaAccount.id]: mockHandleRequestOnAssetsLookupReturnValue,
      },

      assetsMetadata: mockGetMetadataReturnValue.assets,
      allIgnoredAssets: {},
    });
    // Remove an EVM account
    messenger.publish('AccountsController:accountRemoved', mockEthAccount.id);

    await jestAdvanceTime({ duration: 1 });

    expect(controller.state).toStrictEqual({
      accountsAssets: {
        [mockSolanaAccount.id]: mockHandleRequestOnAssetsLookupReturnValue,
      },

      assetsMetadata: mockGetMetadataReturnValue.assets,
      allIgnoredAssets: {},
    });
  });

  it('updates accountsAssets when "AccountsController:accountRemoved" is fired', async () => {
    const { controller, messenger, mockSnapHandleRequest, mockGetPermissions } =
      setupController();

    mockSnapHandleRequest
      .mockReturnValueOnce(mockHandleRequestOnAssetsLookupReturnValue)
      .mockReturnValueOnce(mockGetMetadataReturnValue);

    mockGetPermissions
      .mockReturnValueOnce(mockGetPermissionsReturnValue[0])
      .mockReturnValueOnce(mockGetPermissionsReturnValue[1])
      .mockReturnValueOnce(mockGetPermissionsReturnValue[2])
      .mockReturnValueOnce(mockGetPermissionsReturnValue[3])
      .mockReturnValueOnce(mockGetPermissionsReturnValue[4])
      .mockReturnValueOnce(mockGetPermissionsReturnValue[5])
      .mockReturnValueOnce(mockGetPermissionsReturnValue[6]);

    // Add a solana account first
    messenger.publish(
      'AccountsController:accountAdded',
      mockSolanaAccount as unknown as InternalAccount,
    );

    await jestAdvanceTime({ duration: 1 });

    expect(controller.state).toStrictEqual({
      accountsAssets: {
        [mockSolanaAccount.id]: mockHandleRequestOnAssetsLookupReturnValue,
      },

      assetsMetadata: mockGetMetadataReturnValue.assets,
      allIgnoredAssets: {},
    });
    // Remove the added solana account
    messenger.publish(
      'AccountsController:accountRemoved',
      mockSolanaAccount.id,
    );

    await jestAdvanceTime({ duration: 1 });

    expect(controller.state).toStrictEqual({
      accountsAssets: {},

      assetsMetadata: mockGetMetadataReturnValue.assets,
      allIgnoredAssets: {},
    });
  });

  describe('handleAccountAssetListUpdated', () => {
    it('updates the assets list for an account when a new asset is added', async () => {
      const mockSolanaAccountId1 = 'account1';
      const mockSolanaAccountId2 = 'account2';
      const {
        messenger,
        controller,
        mockSnapHandleRequest,
        mockGetPermissions,
      } = setupController({
        state: {
          accountsAssets: {
            [mockSolanaAccountId1]: mockHandleRequestOnAssetsLookupReturnValue,
          },
          assetsMetadata: mockGetMetadataReturnValue.assets,
          allIgnoredAssets: {},
        } as MultichainAssetsControllerState,
      });

      const mockGetMetadataReturnValue1 = {
        'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1/token:newToken': {
          name: 'newToken',
          symbol: 'newToken',
          decimals: 18,
        },
      };
      const mockGetMetadataReturnValue2 = {
        'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1/token:newToken3': {
          name: 'newToken3',
          symbol: 'newToken3',
          decimals: 18,
        },
      };
      mockSnapHandleRequest.mockReturnValue({
        assets: {
          ...mockGetMetadataReturnValue1,
          ...mockGetMetadataReturnValue2,
        },
      });

      mockGetPermissions
        .mockReturnValueOnce(mockGetPermissionsReturnValue[0])
        .mockReturnValueOnce(mockGetPermissionsReturnValue[1])
        .mockReturnValueOnce(mockGetPermissionsReturnValue[2])
        .mockReturnValueOnce(mockGetPermissionsReturnValue[3])
        .mockReturnValueOnce(mockGetPermissionsReturnValue[4])
        .mockReturnValueOnce(mockGetPermissionsReturnValue[5])
        .mockReturnValueOnce(mockGetPermissionsReturnValue[6]);
      const updatedAssetsList: AccountAssetListUpdatedEventPayload = {
        assets: {
          [mockSolanaAccountId1]: {
            added: ['solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1/token:newToken'],
            removed: [],
          },
          [mockSolanaAccountId2]: {
            added: ['solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1/token:newToken3'],
            removed: [],
          },
        },
      };

      messenger.publish(
        'AccountsController:accountAssetListUpdated',
        updatedAssetsList,
      );

      await jestAdvanceTime({ duration: 1 });

      expect(controller.state.accountsAssets).toStrictEqual({
        [mockSolanaAccountId1]: [
          'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1/slip44:501',
          'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1/token:Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr',
          'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1/token:newToken',
        ],
        [mockSolanaAccountId2]: [
          'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1/token:newToken3',
        ],
      });

      expect(mockSnapHandleRequest).toHaveBeenCalledTimes(1);

      expect(controller.state.assetsMetadata).toStrictEqual({
        ...mockGetMetadataReturnValue.assets,
        'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1/token:newToken': {
          name: 'newToken',
          symbol: 'newToken',
          decimals: 18,
        },
        'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1/token:newToken3': {
          name: 'newToken3',
          symbol: 'newToken3',
          decimals: 18,
        },
      });
    });

    it('does not add duplicate assets to state', async () => {
      const mockSolanaAccountId1 = 'account1';
      const mockSolanaAccountId2 = 'account2';
      const { controller, messenger } = setupController({
        state: {
          accountsAssets: {
            [mockSolanaAccountId1]: mockHandleRequestOnAssetsLookupReturnValue,
          },
          assetsMetadata: mockGetMetadataReturnValue,
          allIgnoredAssets: {},
        } as MultichainAssetsControllerState,
      });

      const updatedAssetsList: AccountAssetListUpdatedEventPayload = {
        assets: {
          [mockSolanaAccountId1]: {
            added:
              mockHandleRequestOnAssetsLookupReturnValue as `${string}:${string}/${string}:${string}`[],
            removed: [],
          },
          [mockSolanaAccountId2]: {
            added: ['solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1/token:newToken3'],
            removed: [],
          },
        },
      };

      messenger.publish(
        'AccountsController:accountAssetListUpdated',
        updatedAssetsList,
      );
      await jestAdvanceTime({ duration: 1 });

      expect(controller.state.accountsAssets).toStrictEqual({
        [mockSolanaAccountId1]: [
          'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1/slip44:501',
          'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1/token:Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr',
        ],
        [mockSolanaAccountId2]: [
          'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1/token:newToken3',
        ],
      });
    });

    it('updates the assets list for an account when a an asset is removed', async () => {
      const mockSolanaAccountId1 = 'account1';
      const mockSolanaAccountId2 = 'account2';
      const { controller, messenger } = setupController({
        state: {
          accountsAssets: {
            [mockSolanaAccountId1]: mockHandleRequestOnAssetsLookupReturnValue,
            [mockSolanaAccountId2]: [
              'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1/token:newToken3',
            ],
          },
          assetsMetadata: mockGetMetadataReturnValue,
          allIgnoredAssets: {},
        } as MultichainAssetsControllerState,
      });

      const updatedAssetsList: AccountAssetListUpdatedEventPayload = {
        assets: {
          [mockSolanaAccountId2]: {
            added: [],
            removed: [
              'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1/token:newToken3',
            ],
          },
        },
      };

      messenger.publish(
        'AccountsController:accountAssetListUpdated',
        updatedAssetsList,
      );
      await jestAdvanceTime({ duration: 1 });

      expect(controller.state.accountsAssets).toStrictEqual({
        [mockSolanaAccountId1]: [
          'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1/slip44:501',
          'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1/token:Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr',
        ],
        [mockSolanaAccountId2]: [],
      });
    });
  });

  describe('getAssetMetadata', () => {
    it('returns the metadata for a given asset', async () => {
      const { messenger } = setupController({
        state: {
          accountsAssets: {
            [mockSolanaAccount.id]: mockHandleRequestOnAssetsLookupReturnValue,
          },
          assetsMetadata: mockGetMetadataReturnValue.assets,
        } as MultichainAssetsControllerState,
      });

      const assetId = 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1/slip44:501';

      const metadata = messenger.call(
        'MultichainAssetsController:getAssetMetadata',
        assetId,
      );

      expect(metadata).toStrictEqual(
        mockGetMetadataReturnValue.assets[assetId],
      );
    });

    it('returns undefined if the asset metadata is not found', async () => {
      const { messenger } = setupController({
        state: {
          accountsAssets: {
            [mockSolanaAccount.id]: mockHandleRequestOnAssetsLookupReturnValue,
          },
          assetsMetadata: mockGetMetadataReturnValue.assets,
        } as MultichainAssetsControllerState,
      });

      const assetId =
        'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/token:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

      const metadata = messenger.call(
        'MultichainAssetsController:getAssetMetadata',
        assetId,
      );

      expect(metadata).toBeUndefined();
    });
  });

  describe('ignoreAssets', () => {
    it('should ignore assets and remove them from active assets list', () => {
      const { controller } = setupController({
        state: {
          accountsAssets: {
            [mockSolanaAccount.id]: [
              'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1/slip44:501',
              'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1/token:Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr',
            ],
          },
          assetsMetadata: mockGetMetadataReturnValue.assets,
          allIgnoredAssets: {},
        } as MultichainAssetsControllerState,
      });

      const assetToIgnore =
        'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1/slip44:501';

      controller.ignoreAssets([assetToIgnore], mockSolanaAccount.id);

      expect(
        controller.state.accountsAssets[mockSolanaAccount.id],
      ).toStrictEqual([
        'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1/token:Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr',
      ]);
      expect(
        controller.state.allIgnoredAssets[mockSolanaAccount.id],
      ).toStrictEqual([assetToIgnore]);
    });

    it('should not add duplicate assets to ignored list', () => {
      const assetToIgnore =
        'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1/slip44:501';
      const { controller } = setupController({
        state: {
          accountsAssets: {
            [mockSolanaAccount.id]: [assetToIgnore],
          },
          assetsMetadata: mockGetMetadataReturnValue.assets,
          allIgnoredAssets: {
            [mockSolanaAccount.id]: [assetToIgnore],
          },
        } as MultichainAssetsControllerState,
      });

      controller.ignoreAssets([assetToIgnore], mockSolanaAccount.id);

      expect(
        controller.state.allIgnoredAssets[mockSolanaAccount.id],
      ).toStrictEqual([assetToIgnore]);
    });

    it('should handle ignoring assets for accounts with no existing ignored assets', () => {
      const { controller } = setupController({
        state: {
          accountsAssets: {
            [mockSolanaAccount.id]: [
              'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1/slip44:501',
            ],
          },
          assetsMetadata: mockGetMetadataReturnValue.assets,
          allIgnoredAssets: {},
        } as MultichainAssetsControllerState,
      });

      const assetToIgnore =
        'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1/slip44:501';
      controller.ignoreAssets([assetToIgnore], mockSolanaAccount.id);

      expect(
        controller.state.allIgnoredAssets[mockSolanaAccount.id],
      ).toStrictEqual([assetToIgnore]);
      expect(
        controller.state.accountsAssets[mockSolanaAccount.id],
      ).toStrictEqual([]);
    });
  });

  describe('addAssets', () => {
    it('should add a single asset to account assets list', async () => {
      const { controller } = setupController({
        state: {
          accountsAssets: {
            [mockSolanaAccount.id]: [
              'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1/slip44:501',
            ],
          },
          assetsMetadata: mockGetMetadataReturnValue.assets,
          allIgnoredAssets: {},
        } as MultichainAssetsControllerState,
      });

      const assetToAdd =
        'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1/token:Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr';

      const result = await controller.addAssets(
        [assetToAdd],
        mockSolanaAccount.id,
      );

      expect(result).toStrictEqual([
        'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1/slip44:501',
        assetToAdd,
      ]);
      expect(
        controller.state.accountsAssets[mockSolanaAccount.id],
      ).toStrictEqual([
        'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1/slip44:501',
        assetToAdd,
      ]);
    });

    it('should not add duplicate assets', async () => {
      const existingAsset =
        'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1/slip44:501';
      const { controller } = setupController({
        state: {
          accountsAssets: {
            [mockSolanaAccount.id]: [existingAsset],
          },
          assetsMetadata: mockGetMetadataReturnValue.assets,
          allIgnoredAssets: {},
        } as MultichainAssetsControllerState,
      });

      const result = await controller.addAssets(
        [existingAsset],
        mockSolanaAccount.id,
      );

      expect(result).toStrictEqual([existingAsset]);
      expect(
        controller.state.accountsAssets[mockSolanaAccount.id],
      ).toStrictEqual([existingAsset]);
    });

    it('should remove asset from ignored list when added', async () => {
      const assetToAdd = 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1/slip44:501';
      const { controller } = setupController({
        state: {
          accountsAssets: {},
          assetsMetadata: mockGetMetadataReturnValue.assets,
          allIgnoredAssets: {
            [mockSolanaAccount.id]: [assetToAdd],
          },
        } as MultichainAssetsControllerState,
      });

      const result = await controller.addAssets(
        [assetToAdd],
        mockSolanaAccount.id,
      );

      expect(result).toStrictEqual([assetToAdd]);
      expect(
        controller.state.accountsAssets[mockSolanaAccount.id],
      ).toStrictEqual([assetToAdd]);
      expect(
        controller.state.allIgnoredAssets[mockSolanaAccount.id],
      ).toBeUndefined();
    });

    it('should handle adding asset to account with no existing assets', async () => {
      const assetToAdd = 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1/slip44:501';
      const { controller } = setupController({
        state: {
          accountsAssets: {},
          assetsMetadata: mockGetMetadataReturnValue.assets,
          allIgnoredAssets: {},
        } as MultichainAssetsControllerState,
      });

      const result = await controller.addAssets(
        [assetToAdd],
        mockSolanaAccount.id,
      );

      expect(result).toStrictEqual([assetToAdd]);
      expect(
        controller.state.accountsAssets[mockSolanaAccount.id],
      ).toStrictEqual([assetToAdd]);
    });

    it('should publish accountAssetListUpdated event when asset is added', async () => {
      const { controller, messenger } = setupController({
        state: {
          accountsAssets: {},
          assetsMetadata: mockGetMetadataReturnValue.assets,
          allIgnoredAssets: {},
        } as MultichainAssetsControllerState,
      });

      const assetToAdd = 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1/slip44:501';

      // Set up event listener to capture the published event
      const eventListener = jest.fn();
      messenger.subscribe(
        'MultichainAssetsController:accountAssetListUpdated',
        eventListener,
      );

      await controller.addAssets([assetToAdd], mockSolanaAccount.id);

      expect(eventListener).toHaveBeenCalledWith({
        assets: {
          [mockSolanaAccount.id]: {
            added: [assetToAdd],
            removed: [],
          },
        },
      });
    });

    it('should add multiple assets from the same chain', async () => {
      const { controller } = setupController({
        state: {
          accountsAssets: {
            [mockSolanaAccount.id]: [
              'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1/slip44:501',
            ],
          },
          assetsMetadata: mockGetMetadataReturnValue.assets,
          allIgnoredAssets: {},
        } as MultichainAssetsControllerState,
      });

      const assetsToAdd: CaipAssetType[] = [
        'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1/token:Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr',
        'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1/token:AnotherTokenAddress',
      ];

      const result = await controller.addAssets(
        assetsToAdd,
        mockSolanaAccount.id,
      );

      expect(result).toStrictEqual([
        'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1/slip44:501',
        ...assetsToAdd,
      ]);
      expect(
        controller.state.accountsAssets[mockSolanaAccount.id],
      ).toStrictEqual([
        'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1/slip44:501',
        ...assetsToAdd,
      ]);
    });

    it('should throw error when assets are from different chains', async () => {
      const { controller } = setupController({
        state: {
          accountsAssets: {},
          assetsMetadata: mockGetMetadataReturnValue.assets,
          allIgnoredAssets: {},
        } as MultichainAssetsControllerState,
      });

      const assetsFromDifferentChains: CaipAssetType[] = [
        'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1/slip44:501',
        'eip155:1/slip44:60', // Ethereum asset
      ];

      await expect(
        controller.addAssets(assetsFromDifferentChains, mockSolanaAccount.id),
      ).rejects.toThrow(
        'All assets must belong to the same chain. Found assets from chains: solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1, eip155:1',
      );
    });

    it('should return existing assets when empty array is provided', async () => {
      const existingAsset =
        'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1/slip44:501';
      const { controller } = setupController({
        state: {
          accountsAssets: {
            [mockSolanaAccount.id]: [existingAsset],
          },
          assetsMetadata: mockGetMetadataReturnValue.assets,
          allIgnoredAssets: {},
        } as MultichainAssetsControllerState,
      });

      const result = await controller.addAssets([], mockSolanaAccount.id);

      expect(result).toStrictEqual([existingAsset]);
    });

    it('should only publish event for newly added assets', async () => {
      const existingAsset =
        'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1/slip44:501';
      const newAsset = 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1/token:NewToken';

      const { controller, messenger } = setupController({
        state: {
          accountsAssets: {
            [mockSolanaAccount.id]: [existingAsset],
          },
          assetsMetadata: mockGetMetadataReturnValue.assets,
          allIgnoredAssets: {},
        } as MultichainAssetsControllerState,
      });

      const eventListener = jest.fn();
      messenger.subscribe(
        'MultichainAssetsController:accountAssetListUpdated',
        eventListener,
      );

      await controller.addAssets(
        [existingAsset, newAsset],
        mockSolanaAccount.id,
      );

      expect(eventListener).toHaveBeenCalledWith({
        assets: {
          [mockSolanaAccount.id]: {
            added: [newAsset], // Only the new asset should be in the event
            removed: [],
          },
        },
      });
    });

    it('should not publish event when no new assets are added', async () => {
      const existingAsset =
        'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1/slip44:501';

      const { controller, messenger } = setupController({
        state: {
          accountsAssets: {
            [mockSolanaAccount.id]: [existingAsset],
          },
          assetsMetadata: mockGetMetadataReturnValue.assets,
          allIgnoredAssets: {},
        } as MultichainAssetsControllerState,
      });

      const eventListener = jest.fn();
      messenger.subscribe(
        'MultichainAssetsController:accountAssetListUpdated',
        eventListener,
      );

      await controller.addAssets([existingAsset], mockSolanaAccount.id);

      // Event should not be published since no new assets were added
      expect(eventListener).not.toHaveBeenCalled();
    });

    it('should partially remove assets from ignored list when only some are added', async () => {
      const ignoredAsset1 =
        'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1/slip44:501';
      const ignoredAsset2 =
        'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1/token:Token1';
      const ignoredAsset3 =
        'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1/token:Token2';

      const { controller } = setupController({
        state: {
          accountsAssets: {},
          assetsMetadata: mockGetMetadataReturnValue.assets,
          allIgnoredAssets: {
            [mockSolanaAccount.id]: [
              ignoredAsset1,
              ignoredAsset2,
              ignoredAsset3,
            ],
          },
        } as MultichainAssetsControllerState,
      });

      // Only add two of the three ignored assets
      await controller.addAssets(
        [ignoredAsset1, ignoredAsset2],
        mockSolanaAccount.id,
      );

      // Should have added the two assets
      expect(
        controller.state.accountsAssets[mockSolanaAccount.id],
      ).toStrictEqual([ignoredAsset1, ignoredAsset2]);

      // Should have only the third asset remaining in ignored list
      expect(
        controller.state.allIgnoredAssets[mockSolanaAccount.id],
      ).toStrictEqual([ignoredAsset3]);
    });
  });

  describe('asset detection with ignored assets', () => {
    it('should filter out ignored assets when account assets are updated', async () => {
      const ignoredAsset = 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1/slip44:501';
      const activeAsset =
        'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1/token:Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr';

      const { controller, messenger } = setupController({
        state: {
          accountsAssets: {},
          assetsMetadata: mockGetMetadataReturnValue.assets,
          allIgnoredAssets: {
            [mockSolanaAccount.id]: [ignoredAsset],
          },
        } as MultichainAssetsControllerState,
      });

      // Simulate asset list update that includes both ignored and new assets
      messenger.publish('AccountsController:accountAssetListUpdated', {
        assets: {
          [mockSolanaAccount.id]: {
            added: [ignoredAsset, activeAsset],
            removed: [],
          },
        },
      });

      // Wait for async processing
      await jestAdvanceTime({ duration: 0 });

      // Only the non-ignored asset should be added
      expect(
        controller.state.accountsAssets[mockSolanaAccount.id],
      ).toStrictEqual([activeAsset]);

      // Ignored asset should remain in ignored list
      expect(
        controller.state.allIgnoredAssets[mockSolanaAccount.id],
      ).toStrictEqual([ignoredAsset]);
    });

    it('should keep ignored assets filtered out during automatic detection', async () => {
      const ignoredAsset = 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1/slip44:501';

      const { controller, messenger } = setupController({
        state: {
          accountsAssets: {},
          assetsMetadata: mockGetMetadataReturnValue.assets,
          allIgnoredAssets: {
            [mockSolanaAccount.id]: [ignoredAsset],
          },
        } as MultichainAssetsControllerState,
      });

      // Simulate automatic asset detection trying to re-add ignored asset
      messenger.publish('AccountsController:accountAssetListUpdated', {
        assets: {
          [mockSolanaAccount.id]: {
            added: [ignoredAsset],
            removed: [],
          },
        },
      });

      // Wait for async processing
      await jestAdvanceTime({ duration: 0 });

      // Ignored asset should remain filtered out and stay in ignored list
      expect(
        controller.state.accountsAssets[mockSolanaAccount.id],
      ).toBeUndefined();
      expect(
        controller.state.allIgnoredAssets[mockSolanaAccount.id],
      ).toStrictEqual([ignoredAsset]);
    });

    it('should add all assets when new account is added (no pre-existing ignored assets)', async () => {
      const asset1 = 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1/slip44:501';
      const asset2 =
        'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1/token:Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr';

      const { controller, messenger } = setupController({
        state: {
          accountsAssets: {},
          assetsMetadata: mockGetMetadataReturnValue.assets,
          allIgnoredAssets: {},
        } as MultichainAssetsControllerState,
        mocks: {
          handleRequestReturnValue: [asset1, asset2],
        },
      });

      // Simulate account being added
      messenger.publish('AccountsController:accountAdded', mockSolanaAccount);

      // Wait for async processing
      await jestAdvanceTime({ duration: 0 });

      // All assets should be added to active list (no ignored assets for new account)
      expect(
        controller.state.accountsAssets[mockSolanaAccount.id],
      ).toStrictEqual([asset1, asset2]);

      // No ignored assets for new account
      expect(
        controller.state.allIgnoredAssets[mockSolanaAccount.id],
      ).toBeUndefined();
    });
  });

  describe('account removal with ignored assets', () => {
    it('should clean up ignored assets when account is removed', async () => {
      const { controller, messenger } = setupController({
        state: {
          accountsAssets: {
            [mockSolanaAccount.id]: [
              'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1/slip44:501',
            ],
          },
          assetsMetadata: mockGetMetadataReturnValue.assets,
          allIgnoredAssets: {
            [mockSolanaAccount.id]: [
              'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1/token:Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr',
            ],
          },
        } as MultichainAssetsControllerState,
      });

      // Simulate account removal
      messenger.publish(
        'AccountsController:accountRemoved',
        mockSolanaAccount.id,
      );

      // Wait for async processing
      await jestAdvanceTime({ duration: 0 });

      expect(
        controller.state.accountsAssets[mockSolanaAccount.id],
      ).toBeUndefined();
      expect(
        controller.state.allIgnoredAssets[mockSolanaAccount.id],
      ).toBeUndefined();
    });
  });

  describe('Blockaid token filtering', () => {
    it('filters out malicious tokens when account is added', async () => {
      const benignToken =
        'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1/token:Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr';
      const maliciousToken =
        'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1/token:MaliciousTokenAddress';
      const nativeToken = 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1/slip44:501';

      const { controller, messenger, mockBulkScanTokens } = setupController({
        mocks: {
          handleRequestReturnValue: [nativeToken, benignToken, maliciousToken],
        },
      });

      mockBulkScanTokens.mockResolvedValue({
        Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr: {
          result_type: TokenScanResultType.Benign,
          chain: 'solana',
          address: 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr',
        },
        MaliciousTokenAddress: {
          result_type: TokenScanResultType.Malicious,
          chain: 'solana',
          address: 'MaliciousTokenAddress',
        },
      });

      messenger.publish(
        'AccountsController:accountAdded',
        mockSolanaAccount as unknown as InternalAccount,
      );

      await jestAdvanceTime({ duration: 1 });

      // Native token (slip44) should pass through unfiltered
      // Benign token should be kept
      // Malicious token should be filtered out
      expect(
        controller.state.accountsAssets[mockSolanaAccount.id],
      ).toStrictEqual([nativeToken, benignToken]);

      // Verify bulkScanTokens was called with correct parameters
      expect(mockBulkScanTokens).toHaveBeenCalledWith({
        chainId: 'solana',
        tokens: [
          'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr',
          'MaliciousTokenAddress',
        ],
      });
    });

    it('filters out malicious tokens in accountAssetListUpdated', async () => {
      const mockAccountId = 'account1';
      const maliciousToken =
        'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1/token:MaliciousAddr';
      const benignToken =
        'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1/token:BenignAddr';

      const { controller, messenger, mockBulkScanTokens } = setupController({
        state: {
          accountsAssets: {
            [mockAccountId]: [],
          },
          assetsMetadata: {},
          allIgnoredAssets: {},
        } as MultichainAssetsControllerState,
      });

      mockBulkScanTokens.mockResolvedValue({
        MaliciousAddr: {
          result_type: TokenScanResultType.Malicious,
          chain: 'solana',
          address: 'MaliciousAddr',
        },
        BenignAddr: {
          result_type: TokenScanResultType.Benign,
          chain: 'solana',
          address: 'BenignAddr',
        },
      });

      messenger.publish('AccountsController:accountAssetListUpdated', {
        assets: {
          [mockAccountId]: {
            added: [maliciousToken, benignToken],
            removed: [],
          },
        },
      });

      await jestAdvanceTime({ duration: 1 });

      // Malicious token should be filtered out
      expect(controller.state.accountsAssets[mockAccountId]).toStrictEqual([
        benignToken,
      ]);
    });

    it('keeps all tokens when bulkScanTokens throws (fail open)', async () => {
      const mockAccountId = 'account1';
      const token = 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1/token:SomeAddr';

      const { controller, messenger, mockBulkScanTokens } = setupController({
        state: {
          accountsAssets: { [mockAccountId]: [] },
          assetsMetadata: {},
          allIgnoredAssets: {},
        } as MultichainAssetsControllerState,
      });

      mockBulkScanTokens.mockRejectedValue(new Error('Scanning failed'));

      messenger.publish('AccountsController:accountAssetListUpdated', {
        assets: {
          [mockAccountId]: { added: [token], removed: [] },
        },
      });

      await jestAdvanceTime({ duration: 1 });

      // Token should be kept when scan throws
      expect(controller.state.accountsAssets[mockAccountId]).toStrictEqual([
        token,
      ]);
    });

    it('keeps all tokens when bulkScanTokens returns empty (API error handled internally)', async () => {
      const mockAccountId = 'account1';
      const token = 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1/token:SomeAddr';

      const { controller, messenger, mockBulkScanTokens } = setupController({
        state: {
          accountsAssets: { [mockAccountId]: [] },
          assetsMetadata: {},
          allIgnoredAssets: {},
        } as MultichainAssetsControllerState,
      });

      // PhishingController returns {} when the API fails or times out
      mockBulkScanTokens.mockResolvedValue({});

      messenger.publish('AccountsController:accountAssetListUpdated', {
        assets: {
          [mockAccountId]: { added: [token], removed: [] },
        },
      });

      await jestAdvanceTime({ duration: 1 });

      // Token should be kept when scan returns empty (no result = fail open)
      expect(controller.state.accountsAssets[mockAccountId]).toStrictEqual([
        token,
      ]);
    });

    it('does not scan native (slip44) assets', async () => {
      const mockAccountId = 'account1';
      const nativeToken = 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1/slip44:501';

      const { controller, messenger, mockBulkScanTokens } = setupController({
        state: {
          accountsAssets: { [mockAccountId]: [] },
          assetsMetadata: {},
          allIgnoredAssets: {},
        } as MultichainAssetsControllerState,
      });

      messenger.publish('AccountsController:accountAssetListUpdated', {
        assets: {
          [mockAccountId]: { added: [nativeToken], removed: [] },
        },
      });

      await jestAdvanceTime({ duration: 1 });

      // Native token should pass through without scan call
      expect(controller.state.accountsAssets[mockAccountId]).toStrictEqual([
        nativeToken,
      ]);
      expect(mockBulkScanTokens).not.toHaveBeenCalled();
    });

    it('keeps tokens with no result in the scan response (fail open)', async () => {
      const mockAccountId = 'account1';
      const knownToken =
        'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1/token:KnownAddr';
      const unknownToken =
        'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1/token:UnknownAddr';

      const { controller, messenger, mockBulkScanTokens } = setupController({
        state: {
          accountsAssets: { [mockAccountId]: [] },
          assetsMetadata: {},
          allIgnoredAssets: {},
        } as MultichainAssetsControllerState,
      });

      // Only return result for knownToken, not unknownToken
      mockBulkScanTokens.mockResolvedValue({
        KnownAddr: {
          result_type: TokenScanResultType.Benign,
          chain: 'solana',
          address: 'KnownAddr',
        },
      });

      messenger.publish('AccountsController:accountAssetListUpdated', {
        assets: {
          [mockAccountId]: { added: [knownToken, unknownToken], removed: [] },
        },
      });

      await jestAdvanceTime({ duration: 1 });

      // Both tokens should be kept (unknown token has no result, fail open)
      expect(controller.state.accountsAssets[mockAccountId]).toStrictEqual([
        knownToken,
        unknownToken,
      ]);
    });

    it('keeps Warning and Spam tokens (only Malicious is filtered)', async () => {
      const mockAccountId = 'account1';
      const warningToken =
        'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1/token:WarningAddr';
      const spamToken =
        'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1/token:SpamAddr';

      const { controller, messenger, mockBulkScanTokens } = setupController({
        state: {
          accountsAssets: { [mockAccountId]: [] },
          assetsMetadata: {},
          allIgnoredAssets: {},
        } as MultichainAssetsControllerState,
      });

      mockBulkScanTokens.mockResolvedValue({
        WarningAddr: {
          result_type: TokenScanResultType.Warning,
          chain: 'solana',
          address: 'WarningAddr',
        },
        SpamAddr: {
          result_type: TokenScanResultType.Spam,
          chain: 'solana',
          address: 'SpamAddr',
        },
      });

      messenger.publish('AccountsController:accountAssetListUpdated', {
        assets: {
          [mockAccountId]: {
            added: [warningToken, spamToken],
            removed: [],
          },
        },
      });

      await jestAdvanceTime({ duration: 1 });

      expect(controller.state.accountsAssets[mockAccountId]).toStrictEqual([
        warningToken,
        spamToken,
      ]);
    });

    it('does not filter tokens in addAssets (curated list)', async () => {
      const spamToken =
        'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1/token:SpamAddr';

      const { controller, mockBulkScanTokens } = setupController({
        state: {
          accountsAssets: { [mockSolanaAccount.id]: [] },
          assetsMetadata: {},
          allIgnoredAssets: {},
        } as MultichainAssetsControllerState,
      });

      const result = await controller.addAssets(
        [spamToken],
        mockSolanaAccount.id,
      );

      // addAssets comes from extension curated list — no Blockaid filtering
      expect(result).toStrictEqual([spamToken]);
      expect(mockBulkScanTokens).not.toHaveBeenCalled();
    });

    it('batches token scan calls when there are more than 100 tokens', async () => {
      const mockAccountId = 'account1';
      // Generate 150 tokens so we exceed the 100-per-request limit
      const tokens = Array.from(
        { length: 150 },
        (_, i) =>
          `solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1/token:Token${String(i).padStart(3, '0')}`,
      );

      const { controller, messenger, mockBulkScanTokens } = setupController({
        state: {
          accountsAssets: { [mockAccountId]: [] },
          assetsMetadata: {},
          allIgnoredAssets: {},
        } as MultichainAssetsControllerState,
      });

      // Mark the last token in each batch as malicious to verify both batches are processed
      mockBulkScanTokens.mockImplementation((request: { tokens: string[] }) => {
        const results: BulkTokenScanResponse = {};
        for (const addr of request.tokens) {
          // Token099 (last in batch 1) and Token149 (last in batch 2) are malicious
          if (addr === 'Token099' || addr === 'Token149') {
            results[addr] = {
              result_type: TokenScanResultType.Malicious,
              chain: 'solana',
              address: addr,
            };
          } else {
            results[addr] = {
              result_type: TokenScanResultType.Benign,
              chain: 'solana',
              address: addr,
            };
          }
        }
        return Promise.resolve(results);
      });

      messenger.publish('AccountsController:accountAssetListUpdated', {
        assets: {
          [mockAccountId]: { added: tokens, removed: [] },
        },
      });

      await jestAdvanceTime({ duration: 1 });

      // Should have been called twice: once with 100 tokens, once with 50
      expect(mockBulkScanTokens).toHaveBeenCalledTimes(2);
      expect(mockBulkScanTokens.mock.calls[0][0].tokens).toHaveLength(100);
      expect(mockBulkScanTokens.mock.calls[1][0].tokens).toHaveLength(50);

      // Both malicious tokens should be filtered out
      const storedAssets = controller.state.accountsAssets[mockAccountId];
      expect(storedAssets).toHaveLength(148);
      expect(
        storedAssets.find(
          (a: string) =>
            a === 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1/token:Token099',
        ),
      ).toBeUndefined();
      expect(
        storedAssets.find(
          (a: string) =>
            a === 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1/token:Token149',
        ),
      ).toBeUndefined();
    });

    it('keeps results from successful batches when one batch fails (partial fail open)', async () => {
      const mockAccountId = 'account1';
      // 120 tokens = batch 1 (100) + batch 2 (20)
      const tokens = Array.from(
        { length: 120 },
        (_, i) =>
          `solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1/token:Token${String(i).padStart(3, '0')}`,
      );

      const { controller, messenger, mockBulkScanTokens } = setupController({
        state: {
          accountsAssets: { [mockAccountId]: [] },
          assetsMetadata: {},
          allIgnoredAssets: {},
        } as MultichainAssetsControllerState,
      });

      let callCount = 0;
      mockBulkScanTokens.mockImplementation((request: { tokens: string[] }) => {
        callCount += 1;
        // First batch succeeds — marks Token099 as malicious
        if (callCount === 1) {
          const results: BulkTokenScanResponse = {};
          for (const addr of request.tokens) {
            results[addr] = {
              result_type:
                addr === 'Token099'
                  ? TokenScanResultType.Malicious
                  : TokenScanResultType.Benign,
              chain: 'solana',
              address: addr,
            };
          }
          return Promise.resolve(results);
        }
        // Second batch fails
        return Promise.reject(new Error('API timeout'));
      });

      messenger.publish('AccountsController:accountAssetListUpdated', {
        assets: {
          [mockAccountId]: { added: tokens, removed: [] },
        },
      });

      await jestAdvanceTime({ duration: 1 });

      const storedAssets = controller.state.accountsAssets[mockAccountId];

      // Token099 from the successful first batch should still be filtered
      expect(
        storedAssets.find(
          (a: string) =>
            a === 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1/token:Token099',
        ),
      ).toBeUndefined();

      // Tokens from the failed second batch (100–119) should all be kept (fail open)
      for (let i = 100; i < 120; i++) {
        const tokenCaip = `solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1/token:Token${String(i).padStart(3, '0')}`;
        expect(storedAssets).toContain(tokenCaip);
      }

      // Total: 99 benign from batch 1 + 20 kept from failed batch 2 = 119
      expect(storedAssets).toHaveLength(119);
    });
  });

  describe('metadata', () => {
    it('includes expected state in debug snapshots', () => {
      const { controller } = setupController();

      expect(
        deriveStateFromMetadata(
          controller.state,
          controller.metadata,
          'includeInDebugSnapshot',
        ),
      ).toMatchInlineSnapshot(`{}`);
    });

    it('includes expected state in state logs', () => {
      const { controller } = setupController();

      expect(
        deriveStateFromMetadata(
          controller.state,
          controller.metadata,
          'includeInStateLogs',
        ),
      ).toMatchInlineSnapshot(`{}`);
    });

    it('persists expected state', () => {
      const { controller } = setupController();

      expect(
        deriveStateFromMetadata(
          controller.state,
          controller.metadata,
          'persist',
        ),
      ).toMatchInlineSnapshot(`
        {
          "accountsAssets": {},
          "allIgnoredAssets": {},
          "assetsMetadata": {},
        }
      `);
    });

    it('exposes expected state to UI', () => {
      const { controller } = setupController();

      expect(
        deriveStateFromMetadata(
          controller.state,
          controller.metadata,
          'usedInUi',
        ),
      ).toMatchInlineSnapshot(`
        {
          "accountsAssets": {},
          "allIgnoredAssets": {},
          "assetsMetadata": {},
        }
      `);
    });
  });
});
