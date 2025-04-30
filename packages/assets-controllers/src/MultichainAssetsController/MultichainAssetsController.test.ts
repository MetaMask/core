import { Messenger } from '@metamask/base-controller';
import type {
  AccountAssetListUpdatedEventPayload,
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
import type { PermissionConstraint } from '@metamask/permission-controller';
import type { SubjectPermissions } from '@metamask/permission-controller';
import type { Snap } from '@metamask/snaps-utils';
import { useFakeTimers } from 'sinon';
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
import { advanceTime } from '../../../../tests/helpers';
import type {
  ExtractAvailableAction,
  ExtractAvailableEvent,
} from '../../../base-controller/tests/helpers';

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
type RootAction = ExtractAvailableAction<MultichainAssetsControllerMessenger>;

/**
 * The union of events that the root messenger allows.
 */
type RootEvent = ExtractAvailableEvent<MultichainAssetsControllerMessenger>;

/**
 * Constructs the unrestricted messenger. This can be used to call actions and
 * publish events within the tests for this controller.
 *
 * @returns The unrestricted messenger suited for MultichainAssetsController.
 */
function getRootMessenger(): Messenger<RootAction, RootEvent> {
  return new Messenger<RootAction, RootEvent>();
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
    messenger.getRestricted({
      name: 'MultichainAssetsController',
      allowedActions: [
        'AccountsController:listMultichainAccounts',
        'SnapController:handleRequest',
        'SnapController:getAll',
        'PermissionController:getPermissions',
      ],
      allowedEvents: [
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
  };
};

describe('MultichainAssetsController', () => {
  let clock: sinon.SinonFakeTimers;

  beforeEach(() => {
    clock = useFakeTimers();
  });

  afterEach(() => {
    clock.restore();
  });
  it('initialize with default state', () => {
    const { controller } = setupController({});
    expect(controller.state).toStrictEqual({
      accountsAssets: {},
      assetsMetadata: {},
    });
  });

  it('does not update state when new account added is EVM', async () => {
    const { controller, messenger } = setupController();

    messenger.publish(
      'AccountsController:accountAdded',
      mockEthAccount as unknown as InternalAccount,
    );

    await advanceTime({ clock, duration: 1 });

    expect(controller.state).toStrictEqual({
      accountsAssets: {},
      assetsMetadata: {},
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

    await advanceTime({ clock, duration: 1 });

    expect(controller.state).toStrictEqual({
      accountsAssets: {
        [mockSolanaAccount.id]: mockHandleRequestOnAssetsLookupReturnValue,
      },
      assetsMetadata: mockGetMetadataReturnValue.assets,
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

    await advanceTime({ clock, duration: 1 });

    expect(mockSnapHandleRequest).toHaveBeenCalledTimes(3);

    expect(controller.state).toStrictEqual({
      accountsAssets: {
        [mockSolanaAccount.id]: mockHandleRequestOnAssetsLookupResponse,
      },
      assetsMetadata: {
        ...mockGetMetadataResponse.assets,
        ...mockGetMetadataReturnValue.assets,
      },
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

    await advanceTime({ clock, duration: 1 });

    expect(mockSnapHandleRequest).toHaveBeenCalledTimes(3);

    expect(controller.state).toStrictEqual({
      accountsAssets: {
        [mockSolanaAccount.id]: mockHandleRequestOnAssetsLookupResponse,
      },
      assetsMetadata: {
        ...mockGetMetadataReturnValue.assets,
      },
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

    await advanceTime({ clock, duration: 1 });

    expect(controller.state).toStrictEqual({
      accountsAssets: {
        [mockSolanaAccount.id]: mockHandleRequestOnAssetsLookupReturnValue,
      },

      assetsMetadata: mockGetMetadataReturnValue.assets,
    });
    // Remove an EVM account
    messenger.publish('AccountsController:accountRemoved', mockEthAccount.id);

    await advanceTime({ clock, duration: 1 });

    expect(controller.state).toStrictEqual({
      accountsAssets: {
        [mockSolanaAccount.id]: mockHandleRequestOnAssetsLookupReturnValue,
      },

      assetsMetadata: mockGetMetadataReturnValue.assets,
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

    await advanceTime({ clock, duration: 1 });

    expect(controller.state).toStrictEqual({
      accountsAssets: {
        [mockSolanaAccount.id]: mockHandleRequestOnAssetsLookupReturnValue,
      },

      assetsMetadata: mockGetMetadataReturnValue.assets,
    });
    // Remove the added solana account
    messenger.publish(
      'AccountsController:accountRemoved',
      mockSolanaAccount.id,
    );

    await advanceTime({ clock, duration: 1 });

    expect(controller.state).toStrictEqual({
      accountsAssets: {},

      assetsMetadata: mockGetMetadataReturnValue.assets,
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

      await advanceTime({ clock, duration: 1 });

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
      await advanceTime({ clock, duration: 1 });

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
      await advanceTime({ clock, duration: 1 });

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
});
