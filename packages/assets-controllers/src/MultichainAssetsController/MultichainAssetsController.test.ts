import { ControllerMessenger } from '@metamask/base-controller';
import type {
  AccountAssetListUpdatedEvent,
  AccountAssetListUpdatedEventPayload,
  CaipAssetTypeOrId,
} from '@metamask/keyring-api';
import { EthAccountType, EthMethod, EthScope } from '@metamask/keyring-api';
import { KeyringTypes } from '@metamask/keyring-controller';
import type { InternalAccount } from '@metamask/keyring-internal-api';
import type { PermissionConstraint } from '@metamask/permission-controller';
import type { SubjectPermissions } from '@metamask/permission-controller';
import type { Snap } from '@metamask/snaps-utils';
import { useFakeTimers } from 'sinon';
import { v4 as uuidv4 } from 'uuid';

import type {
  AssetMetadataResponse,
  MultichainAssetsControllerMessenger,
  MultichainAssetsControllerState,
} from './MultichainAssetsController';
import {
  getDefaultMultichainAssetsControllerState,
  MultichainAssetsController,
} from './MultichainAssetsController';
import { advanceTime } from '../../../../tests/helpers';
import type {
  ExtractAvailableAction,
  ExtractAvailableEvent,
} from '../../../base-controller/tests/helpers';

const mockSolanaAccount = {
  type: 'solana:data-account',
  id: 'a3fc6831-d229-4cd1-87c1-13b1756213d4',
  address: 'EBBYfhQzVzurZiweJ2keeBWpgGLs1cbWYcz28gjGgi5x',
  options: {
    scope: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
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

const mockEthAccount = {
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

const mockGetAssetsResult = [
  'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1/slip44:501',
  'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1/token:Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr',
];

const mockGetAllSnapsReturnValue = [
  {
    blocked: false,
    enabled: true,
    id: 'local:http://localhost:8080',
    initialPermissions: {
      'endowment:cronjob': {
        jobs: [
          {
            expression: '* * * * *',
            request: {
              method: 'refreshTokenPrices',
              params: {},
            },
          },
          {
            expression: '* * * * *',
            request: {
              method: 'refreshTransactions',
              params: {},
            },
          },
        ],
      },
      'endowment:keyring': {
        allowedOrigins: [
          'http://localhost:3000',
          'https://portfolio.metamask.io',
          'https://portfolio-builds.metafi-dev.codefi.network',
          'https://dev.portfolio.metamask.io',
          'https://ramps-dev.portfolio.metamask.io',
        ],
      },
      'endowment:network-access': {},
      'endowment:rpc': {
        dapps: true,
        snaps: false,
      },
      snap_dialog: {},
      snap_getBip32Entropy: [
        {
          curve: 'ed25519',
          path: ['m', "44'", "501'"],
        },
      ],
      snap_getPreferences: {},
      snap_manageAccounts: {},
      snap_manageState: {},
    },
    version: '1.0.4',
  },
  {
    blocked: false,
    enabled: true,
    id: 'npm:@metamask/account-watcher',
    initialPermissions: {
      'endowment:ethereum-provider': {},
      'endowment:keyring': {
        allowedOrigins: ['https://snaps.metamask.io'],
      },
      'endowment:page-home': {},
      'endowment:rpc': {
        allowedOrigins: ['https://snaps.metamask.io'],
      },
      snap_dialog: {},
      snap_manageAccounts: {},
      snap_manageState: {},
    },
    version: '4.1.0',
  },
  {
    blocked: false,
    enabled: true,
    id: 'npm:@metamask/bitcoin-wallet-snap',
    initialPermissions: {
      'endowment:keyring': {
        allowedOrigins: [
          'https://portfolio.metamask.io',
          'https://portfolio-builds.metafi-dev.codefi.network',
          'https://dev.portfolio.metamask.io',
          'https://ramps-dev.portfolio.metamask.io',
        ],
      },
      'endowment:network-access': {},
      'endowment:rpc': {
        dapps: true,
        snaps: false,
      },
      snap_dialog: {},
      snap_getBip32Entropy: [
        {
          curve: 'secp256k1',
          path: ['m', "84'", "0'"],
        },
        {
          curve: 'secp256k1',
          path: ['m', "84'", "1'"],
        },
      ],
      snap_manageAccounts: {},
      snap_manageState: {},
    },
    version: '0.8.2',
  },
  {
    blocked: false,
    enabled: true,
    id: 'npm:@metamask/ens-resolver-snap',
    initialPermissions: {
      'endowment:ethereum-provider': {},
      'endowment:name-lookup': {},
      'endowment:network-access': {},
    },
    version: '0.1.2',
  },
  {
    blocked: false,
    enabled: true,
    id: 'npm:@metamask/message-signing-snap',
    initialPermissions: {
      'endowment:rpc': {
        dapps: true,
        snaps: false,
      },
      snap_getEntropy: {},
    },
    version: '0.6.0',
  },
  {
    blocked: false,
    enabled: true,
    id: 'npm:@metamask/preinstalled-example-snap',
    initialPermissions: {
      'endowment:rpc': {
        dapps: true,
      },
      snap_dialog: {},
    },
    version: '0.2.0',
  },
  {
    blocked: false,
    enabled: true,
    id: 'npm:@metamask/solana-wallet-snap',
    initialPermissions: {
      'endowment:cronjob': {
        jobs: [
          {
            expression: '* * * * *',
            request: {
              method: 'refreshTokenPrices',
              params: {},
            },
          },
        ],
      },
      'endowment:keyring': {
        allowedOrigins: [
          'http://localhost:3000',
          'https://portfolio.metamask.io',
          'https://portfolio-builds.metafi-dev.codefi.network',
          'https://dev.portfolio.metamask.io',
          'https://ramps-dev.portfolio.metamask.io',
        ],
      },
      'endowment:network-access': {},
      'endowment:rpc': {
        dapps: true,
        snaps: false,
      },
      snap_dialog: {},
      snap_getBip32Entropy: [
        {
          curve: 'ed25519',
          path: ['m', "44'", "501'"],
        },
      ],
      snap_getPreferences: {},
      snap_manageAccounts: {},
      snap_manageState: {},
    },
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
    'endowment:cronjob': {
      caveats: [
        {
          type: 'snapCronjob',
          value: {
            jobs: [
              {
                expression: '* * * * *',
                request: {
                  method: 'refreshTokenPrices',
                  params: {},
                },
              },
              {
                expression: '* * * * *',
                request: {
                  method: 'refreshTransactions',
                  params: {},
                },
              },
            ],
          },
        },
      ],
      date: 1736869806349,
      id: 'OQ3d1RXEPbcvi3sNzP6GV',
      invoker: 'local:http://localhost:8080',
      parentCapability: 'endowment:cronjob',
    },
    'endowment:keyring': {
      caveats: [
        {
          type: 'keyringOrigin',
          value: {
            allowedOrigins: [
              'http://localhost:3000',
              'https://portfolio.metamask.io',
              'https://portfolio-builds.metafi-dev.codefi.network',
              'https://dev.portfolio.metamask.io',
              'https://ramps-dev.portfolio.metamask.io',
            ],
          },
        },
      ],
      date: 1736869806348,
      id: 'WkNypQHrfAaP8VyDZZmIG',
      invoker: 'local:http://localhost:8080',
      parentCapability: 'endowment:keyring',
    },
    'endowment:network-access': {
      caveats: null,
      date: 1736869806348,
      id: 'wMPlAtMQCzt6TeQe4j3f-',
      invoker: 'local:http://localhost:8080',
      parentCapability: 'endowment:network-access',
    },
    'endowment:rpc': {
      caveats: [
        {
          type: 'rpcOrigin',
          value: {
            dapps: true,
            snaps: false,
          },
        },
      ],
      date: 1736869806348,
      id: '7j1Elw4kcL4KOnlQ6xt7A',
      invoker: 'local:http://localhost:8080',
      parentCapability: 'endowment:rpc',
    },
    snap_dialog: {
      caveats: null,
      date: 1736869806349,
      id: '2OtPNZTdpK1FadSM0s0rv',
      invoker: 'local:http://localhost:8080',
      parentCapability: 'snap_dialog',
    },
    snap_getBip32Entropy: {
      caveats: [
        {
          type: 'permittedDerivationPaths',
          value: [
            {
              curve: 'ed25519',
              path: ['m', "44'", "501'"],
            },
          ],
        },
      ],
      date: 1736869806348,
      id: 'WiOkUgu4Y89p2youlm7ro',
      invoker: 'local:http://localhost:8080',
      parentCapability: 'snap_getBip32Entropy',
    },
    snap_getPreferences: {
      caveats: null,
      date: 1736869806349,
      id: 'LmYGhkzdyDWmhAbM1UJfx',
      invoker: 'local:http://localhost:8080',
      parentCapability: 'snap_getPreferences',
    },
    snap_manageAccounts: {
      caveats: null,
      date: 1736869806349,
      id: 'BaiVanA9U-BIfbCgYpeo6',
      invoker: 'local:http://localhost:8080',
      parentCapability: 'snap_manageAccounts',
    },
    snap_manageState: {
      caveats: null,
      date: 1736869806349,
      id: 'oIJeVj2SsWh6uFam1RMi4',
      invoker: 'local:http://localhost:8080',
      parentCapability: 'snap_manageState',
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
    'endowment:keyring': {
      caveats: [
        {
          type: 'keyringOrigin',
          value: {
            allowedOrigins: ['https://snaps.metamask.io'],
          },
        },
      ],
      date: 1736868793768,
      id: 'Kov-E2ET5_VFdUXjmYYHP',
      invoker: 'npm:@metamask/account-watcher',
      parentCapability: 'endowment:keyring',
    },
    'endowment:page-home': {
      caveats: null,
      date: 1736868793768,
      id: 'c-0RxHEdyaH1ykli6XVBU',
      invoker: 'npm:@metamask/account-watcher',
      parentCapability: 'endowment:page-home',
    },
    'endowment:rpc': {
      caveats: [
        {
          type: 'rpcOrigin',
          value: {
            allowedOrigins: ['https://snaps.metamask.io'],
          },
        },
      ],
      date: 1736868793768,
      id: 'zT7i1dwZutCoah2KhYq0A',
      invoker: 'npm:@metamask/account-watcher',
      parentCapability: 'endowment:rpc',
    },
    snap_dialog: {
      caveats: null,
      date: 1736868793768,
      id: 'y2jAkxa2FLNBxxw8p1GIW',
      invoker: 'npm:@metamask/account-watcher',
      parentCapability: 'snap_dialog',
    },
    snap_manageAccounts: {
      caveats: null,
      date: 1736868793768,
      id: 'Cn3WoTJ-Ute4BIoQncG9H',
      invoker: 'npm:@metamask/account-watcher',
      parentCapability: 'snap_manageAccounts',
    },
    snap_manageState: {
      caveats: null,
      date: 1736868793768,
      id: '3VpjOrbSgm1iiSRdKfSK4',
      invoker: 'npm:@metamask/account-watcher',
      parentCapability: 'snap_manageState',
    },
  },
  {
    'endowment:keyring': {
      caveats: [
        {
          type: 'keyringOrigin',
          value: {
            allowedOrigins: [
              'https://portfolio.metamask.io',
              'https://portfolio-builds.metafi-dev.codefi.network',
              'https://dev.portfolio.metamask.io',
              'https://ramps-dev.portfolio.metamask.io',
            ],
          },
        },
      ],
      date: 1736868793769,
      id: 'qrSg-gbPPoWUT0QC-cX_E',
      invoker: 'npm:@metamask/bitcoin-wallet-snap',
      parentCapability: 'endowment:keyring',
    },
    'endowment:network-access': {
      caveats: null,
      date: 1736868793769,
      id: '9NST-8ZIQO7_BVVJP6JyD',
      invoker: 'npm:@metamask/bitcoin-wallet-snap',
      parentCapability: 'endowment:network-access',
    },
    'endowment:rpc': {
      caveats: [
        {
          type: 'rpcOrigin',
          value: {
            dapps: true,
            snaps: false,
          },
        },
      ],
      date: 1736868793769,
      id: 'pmxVKfS_aa7atONpOswiG',
      invoker: 'npm:@metamask/bitcoin-wallet-snap',
      parentCapability: 'endowment:rpc',
    },
    snap_dialog: {
      caveats: null,
      date: 1736868793769,
      id: '2GVLgDfehEN6_gOxHjF9y',
      invoker: 'npm:@metamask/bitcoin-wallet-snap',
      parentCapability: 'snap_dialog',
    },
    snap_getBip32Entropy: {
      caveats: [
        {
          type: 'permittedDerivationPaths',
          value: [
            {
              curve: 'secp256k1',
              path: ['m', "84'", "0'"],
            },
            {
              curve: 'secp256k1',
              path: ['m', "84'", "1'"],
            },
          ],
        },
      ],
      date: 1736868793769,
      id: 'R6fsWjHr1dv1njukHgVc9',
      invoker: 'npm:@metamask/bitcoin-wallet-snap',
      parentCapability: 'snap_getBip32Entropy',
    },
    snap_manageAccounts: {
      caveats: null,
      date: 1736868793769,
      id: 'CIPKC1JmlTcg1vx5m25_y',
      invoker: 'npm:@metamask/bitcoin-wallet-snap',
      parentCapability: 'snap_manageAccounts',
    },
    snap_manageState: {
      caveats: null,
      date: 1736868793769,
      id: 'Hy75pNHCkG899mB02Rey1',
      invoker: 'npm:@metamask/bitcoin-wallet-snap',
      parentCapability: 'snap_manageState',
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
    'endowment:name-lookup': {
      caveats: null,
      date: 1736868793767,
      id: 'y0K_nuZVDc3LP4-5tu9aP',
      invoker: 'npm:@metamask/ens-resolver-snap',
      parentCapability: 'endowment:name-lookup',
    },
    'endowment:network-access': {
      caveats: null,
      date: 1736868793767,
      id: 'JU4JfpT3aoeo61_KN1pRW',
      invoker: 'npm:@metamask/ens-resolver-snap',
      parentCapability: 'endowment:network-access',
    },
  },
  {
    'endowment:rpc': {
      caveats: [
        {
          type: 'rpcOrigin',
          value: {
            dapps: true,
            snaps: false,
          },
        },
      ],
      date: 1736868793765,
      id: 'j8XfK-fPq13COl7xFQxXn',
      invoker: 'npm:@metamask/message-signing-snap',
      parentCapability: 'endowment:rpc',
    },
    snap_getEntropy: {
      caveats: null,
      date: 1736868793765,
      id: 'igu3INtYezAnQFXtEZfsD',
      invoker: 'npm:@metamask/message-signing-snap',
      parentCapability: 'snap_getEntropy',
    },
  },
  {
    'endowment:rpc': {
      caveats: [
        {
          type: 'rpcOrigin',
          value: {
            dapps: true,
          },
        },
      ],
      date: 1736868793771,
      id: 'Yd155j5BoXh3BIndgMkAM',
      invoker: 'npm:@metamask/preinstalled-example-snap',
      parentCapability: 'endowment:rpc',
    },
    snap_dialog: {
      caveats: null,
      date: 1736868793771,
      id: 'Mg3jlxAPZd-z2ktR_d-s3',
      invoker: 'npm:@metamask/preinstalled-example-snap',
      parentCapability: 'snap_dialog',
    },
  },
  {
    'endowment:cronjob': {
      caveats: [
        {
          type: 'snapCronjob',
          value: {
            jobs: [
              {
                expression: '* * * * *',
                request: {
                  method: 'refreshTokenPrices',
                  params: {},
                },
              },
            ],
          },
        },
      ],
      date: 1736868793773,
      id: 'HvFji18XmC4Z8X6aZRX0U',
      invoker: 'npm:@metamask/solana-wallet-snap',
      parentCapability: 'endowment:cronjob',
    },
    'endowment:keyring': {
      caveats: [
        {
          type: 'keyringOrigin',
          value: {
            allowedOrigins: [
              'http://localhost:3000',
              'https://portfolio.metamask.io',
              'https://portfolio-builds.metafi-dev.codefi.network',
              'https://dev.portfolio.metamask.io',
              'https://ramps-dev.portfolio.metamask.io',
            ],
          },
        },
      ],
      date: 1736868793773,
      id: 'gE03aDEESBJhHPOohNF_D',
      invoker: 'npm:@metamask/solana-wallet-snap',
      parentCapability: 'endowment:keyring',
    },
    'endowment:network-access': {
      caveats: null,
      date: 1736868793773,
      id: 'HbXb8MLHbRrQMexyVpQQ7',
      invoker: 'npm:@metamask/solana-wallet-snap',
      parentCapability: 'endowment:network-access',
    },
    'endowment:rpc': {
      caveats: [
        {
          type: 'rpcOrigin',
          value: {
            dapps: true,
            snaps: false,
          },
        },
      ],
      date: 1736868793773,
      id: 'c673VaxUJ2XiqpxU-NMwk',
      invoker: 'npm:@metamask/solana-wallet-snap',
      parentCapability: 'endowment:rpc',
    },
    snap_dialog: {
      caveats: null,
      date: 1736868793773,
      id: '4_LLZgFa6BMO00xXjxUic',
      invoker: 'npm:@metamask/solana-wallet-snap',
      parentCapability: 'snap_dialog',
    },
    snap_getBip32Entropy: {
      caveats: [
        {
          type: 'permittedDerivationPaths',
          value: [
            {
              curve: 'ed25519',
              path: ['m', "44'", "501'"],
            },
          ],
        },
      ],
      date: 1736868793773,
      id: 'uK-0Ig3Kwoz_hni63t3dl',
      invoker: 'npm:@metamask/solana-wallet-snap',
      parentCapability: 'snap_getBip32Entropy',
    },
    snap_getPreferences: {
      caveats: null,
      date: 1736868793773,
      id: 'yW6iC0gWWEMJ0TWZMIbDb',
      invoker: 'npm:@metamask/solana-wallet-snap',
      parentCapability: 'snap_getPreferences',
    },
    snap_manageAccounts: {
      caveats: null,
      date: 1736868793773,
      id: 'G0kZa4d7GekeMNxA76Yqz',
      invoker: 'npm:@metamask/solana-wallet-snap',
      parentCapability: 'snap_manageAccounts',
    },
    snap_manageState: {
      caveats: null,
      date: 1736868793773,
      id: 'zjugDVmAof_4yztwpZveV',
      invoker: 'npm:@metamask/solana-wallet-snap',
      parentCapability: 'snap_manageState',
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
 * @returns The unrestricted messenger suited for PetNamesController.
 */
function getRootControllerMessenger(): ControllerMessenger<
  RootAction,
  RootEvent
> {
  return new ControllerMessenger<RootAction, RootEvent>();
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
  const controllerMessenger = getRootControllerMessenger();

  const multichainAssetsControllerMessenger: MultichainAssetsControllerMessenger =
    controllerMessenger.getRestricted({
      name: 'MultichainAssetsController',
      allowedActions: [
        'SnapController:handleRequest',
        'AccountsController:listMultichainAccounts',
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
  controllerMessenger.registerActionHandler(
    'SnapController:handleRequest',
    mockSnapHandleRequest.mockReturnValue(
      mocks?.handleRequestReturnValue ?? mockGetAssetsResult,
    ),
  );

  const mockListMultichainAccounts = jest.fn();
  controllerMessenger.registerActionHandler(
    'AccountsController:listMultichainAccounts',
    mockListMultichainAccounts.mockReturnValue(
      mocks?.listMultichainAccounts ?? [mockSolanaAccount, mockEthAccount],
    ),
  );

  const mockGetAllSnaps = jest.fn();
  controllerMessenger.registerActionHandler(
    'SnapController:getAll',
    mockGetAllSnaps.mockReturnValue(
      mocks?.getAllReturnValue ?? mockGetAllSnapsReturnValue,
    ),
  );

  const mockGetPermissions = jest.fn();
  controllerMessenger.registerActionHandler(
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
    messenger: controllerMessenger,
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
      allNonEvmTokens: {},
      metadata: {},
    });
  });

  it('should not update state when new account added is EVM', async () => {
    const { controller, messenger } = setupController();

    messenger.publish(
      'AccountsController:accountAdded',
      mockEthAccount as unknown as InternalAccount,
    );

    await advanceTime({ clock, duration: 1 });

    expect(controller.state).toStrictEqual({
      allNonEvmTokens: {},
      metadata: {},
    });
  });

  it('updates allNonEvmTokens when "AccountsController:accountAdded" is fired', async () => {
    const { controller, messenger, mockSnapHandleRequest, mockGetPermissions } =
      setupController();

    mockSnapHandleRequest
      .mockReturnValueOnce(mockGetAssetsResult)
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
      allNonEvmTokens: {
        [mockSolanaAccount.id]: mockGetAssetsResult,
      },
      metadata: mockGetMetadataReturnValue.assets,
    });
  });

  it('updates metadata in state successfully all calls succeed to fetch metadata', async () => {
    const { controller, messenger, mockSnapHandleRequest, mockGetPermissions } =
      setupController();

    const mockAssetsResponse = [
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
      'endowment:cronjob': {
        caveats: [
          {
            type: 'snapCronjob',
            value: {
              jobs: [
                {
                  expression: '* * * * *',
                  request: {
                    method: 'refreshTokenPrices',
                    params: {},
                  },
                },
                {
                  expression: '* * * * *',
                  request: {
                    method: 'refreshTransactions',
                    params: {},
                  },
                },
              ],
            },
          },
        ],
        date: 1736869806349,
        id: 'OQ3d1RXEPbcvi3sNzP6GV',
        invoker: 'local:http://localhost:8080',
        parentCapability: 'endowment:cronjob',
      },
      'endowment:keyring': {
        caveats: [
          {
            type: 'keyringOrigin',
            value: {
              allowedOrigins: [
                'http://localhost:3000',
                'https://portfolio.metamask.io',
                'https://portfolio-builds.metafi-dev.codefi.network',
                'https://dev.portfolio.metamask.io',
                'https://ramps-dev.portfolio.metamask.io',
              ],
            },
          },
        ],
        date: 1736869806348,
        id: 'WkNypQHrfAaP8VyDZZmIG',
        invoker: 'local:http://localhost:8080',
        parentCapability: 'endowment:keyring',
      },
      'endowment:network-access': {
        caveats: null,
        date: 1736869806348,
        id: 'wMPlAtMQCzt6TeQe4j3f-',
        invoker: 'local:http://localhost:8080',
        parentCapability: 'endowment:network-access',
      },
      'endowment:rpc': {
        caveats: [
          {
            type: 'rpcOrigin',
            value: {
              dapps: true,
              snaps: false,
            },
          },
        ],
        date: 1736869806348,
        id: '7j1Elw4kcL4KOnlQ6xt7A',
        invoker: 'local:http://localhost:8080',
        parentCapability: 'endowment:rpc',
      },
      snap_dialog: {
        caveats: null,
        date: 1736869806349,
        id: '2OtPNZTdpK1FadSM0s0rv',
        invoker: 'local:http://localhost:8080',
        parentCapability: 'snap_dialog',
      },
      snap_getBip32Entropy: {
        caveats: [
          {
            type: 'permittedDerivationPaths',
            value: [
              {
                curve: 'ed25519',
                path: ['m', "44'", "501'"],
              },
            ],
          },
        ],
        date: 1736869806348,
        id: 'WiOkUgu4Y89p2youlm7ro',
        invoker: 'local:http://localhost:8080',
        parentCapability: 'snap_getBip32Entropy',
      },
      snap_getPreferences: {
        caveats: null,
        date: 1736869806349,
        id: 'LmYGhkzdyDWmhAbM1UJfx',
        invoker: 'local:http://localhost:8080',
        parentCapability: 'snap_getPreferences',
      },
      snap_manageAccounts: {
        caveats: null,
        date: 1736869806349,
        id: 'BaiVanA9U-BIfbCgYpeo6',
        invoker: 'local:http://localhost:8080',
        parentCapability: 'snap_manageAccounts',
      },
      snap_manageState: {
        caveats: null,
        date: 1736869806349,
        id: 'oIJeVj2SsWh6uFam1RMi4',
        invoker: 'local:http://localhost:8080',
        parentCapability: 'snap_manageState',
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
      .mockReturnValueOnce(mockAssetsResponse)
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
      allNonEvmTokens: {
        [mockSolanaAccount.id]: mockAssetsResponse,
      },
      metadata: {
        ...mockGetMetadataResponse.assets,
        ...mockGetMetadataReturnValue.assets,
      },
    });
  });

  it('updates metadata in state successfully one call to fetch metadata fails', async () => {
    const { controller, messenger, mockSnapHandleRequest, mockGetPermissions } =
      setupController();

    const mockAssetsResponse = [
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
      'endowment:cronjob': {
        caveats: [
          {
            type: 'snapCronjob',
            value: {
              jobs: [
                {
                  expression: '* * * * *',
                  request: {
                    method: 'refreshTokenPrices',
                    params: {},
                  },
                },
                {
                  expression: '* * * * *',
                  request: {
                    method: 'refreshTransactions',
                    params: {},
                  },
                },
              ],
            },
          },
        ],
        date: 1736869806349,
        id: 'OQ3d1RXEPbcvi3sNzP6GV',
        invoker: 'local:http://localhost:8080',
        parentCapability: 'endowment:cronjob',
      },
      'endowment:keyring': {
        caveats: [
          {
            type: 'keyringOrigin',
            value: {
              allowedOrigins: [
                'http://localhost:3000',
                'https://portfolio.metamask.io',
                'https://portfolio-builds.metafi-dev.codefi.network',
                'https://dev.portfolio.metamask.io',
                'https://ramps-dev.portfolio.metamask.io',
              ],
            },
          },
        ],
        date: 1736869806348,
        id: 'WkNypQHrfAaP8VyDZZmIG',
        invoker: 'local:http://localhost:8080',
        parentCapability: 'endowment:keyring',
      },
      'endowment:network-access': {
        caveats: null,
        date: 1736869806348,
        id: 'wMPlAtMQCzt6TeQe4j3f-',
        invoker: 'local:http://localhost:8080',
        parentCapability: 'endowment:network-access',
      },
      'endowment:rpc': {
        caveats: [
          {
            type: 'rpcOrigin',
            value: {
              dapps: true,
              snaps: false,
            },
          },
        ],
        date: 1736869806348,
        id: '7j1Elw4kcL4KOnlQ6xt7A',
        invoker: 'local:http://localhost:8080',
        parentCapability: 'endowment:rpc',
      },
      snap_dialog: {
        caveats: null,
        date: 1736869806349,
        id: '2OtPNZTdpK1FadSM0s0rv',
        invoker: 'local:http://localhost:8080',
        parentCapability: 'snap_dialog',
      },
      snap_getBip32Entropy: {
        caveats: [
          {
            type: 'permittedDerivationPaths',
            value: [
              {
                curve: 'ed25519',
                path: ['m', "44'", "501'"],
              },
            ],
          },
        ],
        date: 1736869806348,
        id: 'WiOkUgu4Y89p2youlm7ro',
        invoker: 'local:http://localhost:8080',
        parentCapability: 'snap_getBip32Entropy',
      },
      snap_getPreferences: {
        caveats: null,
        date: 1736869806349,
        id: 'LmYGhkzdyDWmhAbM1UJfx',
        invoker: 'local:http://localhost:8080',
        parentCapability: 'snap_getPreferences',
      },
      snap_manageAccounts: {
        caveats: null,
        date: 1736869806349,
        id: 'BaiVanA9U-BIfbCgYpeo6',
        invoker: 'local:http://localhost:8080',
        parentCapability: 'snap_manageAccounts',
      },
      snap_manageState: {
        caveats: null,
        date: 1736869806349,
        id: 'oIJeVj2SsWh6uFam1RMi4',
        invoker: 'local:http://localhost:8080',
        parentCapability: 'snap_manageState',
      },
    };

    mockSnapHandleRequest
      .mockReturnValueOnce(mockAssetsResponse)
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
      allNonEvmTokens: {
        [mockSolanaAccount.id]: mockAssetsResponse,
      },
      metadata: {
        ...mockGetMetadataReturnValue.assets,
      },
    });
  });

  it('should not delete account from allNonEvmTokens when "AccountsController:accountRemoved" is fired with EVM account', async () => {
    const { controller, messenger, mockSnapHandleRequest, mockGetPermissions } =
      setupController();

    mockSnapHandleRequest
      .mockReturnValueOnce(mockGetAssetsResult)
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
      allNonEvmTokens: {
        [mockSolanaAccount.id]: mockGetAssetsResult,
      },

      metadata: mockGetMetadataReturnValue.assets,
    });
    // Remove an EVM account
    messenger.publish('AccountsController:accountRemoved', mockEthAccount.id);

    await advanceTime({ clock, duration: 1 });

    expect(controller.state).toStrictEqual({
      allNonEvmTokens: {
        [mockSolanaAccount.id]: mockGetAssetsResult,
      },

      metadata: mockGetMetadataReturnValue.assets,
    });
  });

  it('updates allNonEvmTokens when "AccountsController:accountRemoved" is fired', async () => {
    const { controller, messenger, mockSnapHandleRequest, mockGetPermissions } =
      setupController();

    mockSnapHandleRequest
      .mockReturnValueOnce(mockGetAssetsResult)
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
      allNonEvmTokens: {
        [mockSolanaAccount.id]: mockGetAssetsResult,
      },

      metadata: mockGetMetadataReturnValue.assets,
    });
    // Remove the added solana account
    messenger.publish(
      'AccountsController:accountRemoved',
      mockSolanaAccount.id,
    );

    await advanceTime({ clock, duration: 1 });

    expect(controller.state).toStrictEqual({
      allNonEvmTokens: {},

      metadata: mockGetMetadataReturnValue.assets,
    });
  });

  describe('updateAccountAssetsList', () => {
    it('should update the assets list for an account when a new asset is added', async () => {
      const mockSolanaAccountId1 = 'account1';
      const mockSolanaAccountId2 = 'account2';
      const {
        messenger,
        controller,
        mockSnapHandleRequest,
        mockGetPermissions,
      } = setupController({
        state: {
          allNonEvmTokens: {
            [mockSolanaAccountId1]: mockGetAssetsResult,
          },
          metadata: mockGetMetadataReturnValue.assets,
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

      expect(controller.state.allNonEvmTokens).toStrictEqual({
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

      expect(controller.state.metadata).toStrictEqual({
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

    it('should not add duplicate assets to state', async () => {
      const mockSolanaAccountId1 = 'account1';
      const mockSolanaAccountId2 = 'account2';
      const { controller, messenger } = setupController({
        state: {
          allNonEvmTokens: {
            [mockSolanaAccountId1]: mockGetAssetsResult,
          },
          metadata: mockGetMetadataReturnValue,
        } as MultichainAssetsControllerState,
      });

      const updatedAssetsList: AccountAssetListUpdatedEventPayload = {
        assets: {
          [mockSolanaAccountId1]: {
            added:
              mockGetAssetsResult as `${string}:${string}/${string}:${string}`[],
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

      expect(controller.state.allNonEvmTokens).toStrictEqual({
        [mockSolanaAccountId1]: [
          'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1/slip44:501',
          'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1/token:Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr',
        ],
        [mockSolanaAccountId2]: [
          'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1/token:newToken3',
        ],
      });
    });

    it('should update the assets list for an account when a an asset is removed', async () => {
      const mockSolanaAccountId1 = 'account1';
      const mockSolanaAccountId2 = 'account2';
      const { controller, messenger } = setupController({
        state: {
          allNonEvmTokens: {
            [mockSolanaAccountId1]: mockGetAssetsResult,
            [mockSolanaAccountId2]: [
              'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1/token:newToken3',
            ],
          },
          metadata: mockGetMetadataReturnValue,
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

      expect(controller.state.allNonEvmTokens).toStrictEqual({
        [mockSolanaAccountId1]: [
          'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1/slip44:501',
          'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1/token:Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr',
        ],
        [mockSolanaAccountId2]: [],
      });
    });
  });
});
