import { ControllerMessenger } from '@metamask/base-controller';
import type {
  AccountAssetListUpdatedEvent,
  CaipAssetTypeOrId,
} from '@metamask/keyring-api';
import { EthAccountType, EthMethod, EthScopes } from '@metamask/keyring-api';
import { KeyringTypes } from '@metamask/keyring-controller';
import type { InternalAccount } from '@metamask/keyring-internal-api';
import type { PermissionConstraint } from '@metamask/permission-controller';
import type { SubjectPermissions } from '@metamask/permission-controller';
import type { Snap } from '@metamask/snaps-utils';
import { useFakeTimers } from 'sinon';
import { v4 as uuidv4 } from 'uuid';

import type {
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
  scopes: [EthScopes.Namespace],
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

const mockGetMetadataReturnValue = {
  'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1/slip44:501': {
    name: 'Solana',
    symbol: 'SOL',
    native: true,
    fungible: true,
    iconBase64:
      'data:image/jpeg;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0idXRmLTgiPz4KPCEtLSBHZW5lcmF0b3I6IEFkb2JlIElsbHVzdHJhdG9yIDI0LjAuMCwgU1ZHIEV4cG9ydCBQbHVnLUluIC4gU1ZHIFZlcnNpb246IDYuMDAgQnVpbGQgMCkgIC0tPgo8c3ZnIHZlcnNpb249IjEuMSIgaWQ9IkxheWVyXzEiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyIgeG1sbnM6eGxpbms9Imh0dHA6Ly93d3cudzMub3JnLzE5OTkveGxpbmsiIHg9IjBweCIgeT0iMHB4IgoJIHZpZXdCb3g9IjAgMCAzOTcuNyAzMTEuNyIgc3R5bGU9ImVuYWJsZS1iYWNrZ3JvdW5kOm5ldyAwIDAgMzk3LjcgMzExLjc7IiB4bWw6c3BhY2U9InByZXNlcnZlIj4KPHN0eWxlIHR5cGU9InRleHQvY3NzIj4KCS5zdDB7ZmlsbDp1cmwoI1NWR0lEXzFfKTt9Cgkuc3Qxe2ZpbGw6dXJsKCNTVkdJRF8yXyk7fQoJLnN0MntmaWxsOnVybCgjU1ZHSURfM18pO30KPC9zdHlsZT4KPGxpbmVhckdyYWRpZW50IGlkPSJTVkdJRF8xXyIgZ3JhZGllbnRVbml0cz0idXNlclNwYWNlT25Vc2UiIHgxPSIzNjAuODc5MSIgeTE9IjM1MS40NTUzIiB4Mj0iMTQxLjIxMyIgeTI9Ii02OS4yOTM2IiBncmFkaWVudFRyYW5zZm9ybT0ibWF0cml4KDEgMCAwIC0xIDAgMzE0KSI+Cgk8c3RvcCAgb2Zmc2V0PSIwIiBzdHlsZT0ic3RvcC1jb2xvcjojMDBGRkEzIi8+Cgk8c3RvcCAgb2Zmc2V0PSIxIiBzdHlsZT0ic3RvcC1jb2xvcjojREMxRkZGIi8+CjwvbGluZWFyR3JhZGllbnQ+CjxwYXRoIGNsYXNzPSJzdDAiIGQ9Ik02NC42LDIzNy45YzIuNC0yLjQsNS43LTMuOCw5LjItMy44aDMxNy40YzUuOCwwLDguNyw3LDQuNiwxMS4xbC02Mi43LDYyLjdjLTIuNCwyLjQtNS43LDMuOC05LjIsMy44SDYuNQoJYy01LjgsMC04LjctNy00LjYtMTEuMUw2NC42LDIzNy45eiIvPgo8bGluZWFyR3JhZGllbnQgaWQ9IlNWR0lEXzJfIiBncmFkaWVudFVuaXRzPSJ1c2VyU3BhY2VPblVzZSIgeDE9IjI2NC44MjkxIiB5MT0iNDAxLjYwMTQiIHgyPSI0NS4xNjMiIHkyPSItMTkuMTQ3NSIgZ3JhZGllbnRUcmFuc2Zvcm09Im1hdHJpeCgxIDAgMCAtMSAwIDMxNCkiPgoJPHN0b3AgIG9mZnNldD0iMCIgc3R5bGU9InN0b3AtY29sb3I6IzAwRkZBMyIvPgoJPHN0b3AgIG9mZnNldD0iMSIgc3R5bGU9InN0b3AtY29sb3I6I0RDMUZGRiIvPgo8L2xpbmVhckdyYWRpZW50Pgo8cGF0aCBjbGFzcz0ic3QxIiBkPSJNNjQuNiwzLjhDNjcuMSwxLjQsNzAuNCwwLDczLjgsMGgzMTcuNGM1LjgsMCw4LjcsNyw0LjYsMTEuMWwtNjIuNyw2Mi43Yy0yLjQsMi40LTUuNywzLjgtOS4yLDMuOEg2LjUKCWMtNS44LDAtOC43LTctNC42LTExLjFMNjQuNiwzLjh6Ii8+CjxsaW5lYXJHcmFkaWVudCBpZD0iU1ZHSURfM18iIGdyYWRpZW50VW5pdHM9InVzZXJTcGFjZU9uVXNlIiB4MT0iMzEyLjU0ODQiIHkxPSIzNzYuNjg4IiB4Mj0iOTIuODgyMiIgeTI9Ii00NC4wNjEiIGdyYWRpZW50VHJhbnNmb3JtPSJtYXRyaXgoMSAwIDAgLTEgMCAzMTQpIj4KCTxzdG9wICBvZmZzZXQ9IjAiIHN0eWxlPSJzdG9wLWNvbG9yOiMwMEZGQTMiLz4KCTxzdG9wICBvZmZzZXQ9IjEiIHN0eWxlPSJzdG9wLWNvbG9yOiNEQzFGRkYiLz4KPC9saW5lYXJHcmFkaWVudD4KPHBhdGggY2xhc3M9InN0MiIgZD0iTTMzMy4xLDEyMC4xYy0yLjQtMi40LTUuNy0zLjgtOS4yLTMuOEg2LjVjLTUuOCwwLTguNyw3LTQuNiwxMS4xbDYyLjcsNjIuN2MyLjQsMi40LDUuNywzLjgsOS4yLDMuOGgzMTcuNAoJYzUuOCwwLDguNy03LDQuNi0xMS4xTDMzMy4xLDEyMC4xeiIvPgo8L3N2Zz4K',
    units: [{ name: 'Solana', symbol: 'SOL', decimals: 9 }],
  },
  'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1/token:Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr':
    {
      name: 'USDC',
      symbol: 'USDC',
      native: true,
      fungible: true,
      iconBase64:
        'data:image/jpeg;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNTAiIGhlaWdodD0iMjUwIj48cGF0aCBmaWxsPSIjMjc3NWNhIiBkPSJNMTI1IDI1MGM2OS4yNyAwIDEyNS01NS43MyAxMjUtMTI1UzE5NC4yNyAwIDEyNSAwIDAgNTUuNzMgMCAxMjVzNTUuNzMgMTI1IDEyNSAxMjV6bTAgMCIvPjxnIGZpbGw9IiNmZmYiPjxwYXRoIGQ9Ik0xNTkuMzc1IDE0NC43OTNjMC0xOC4yMy0xMC45MzgtMjQuNDgtMzIuODEzLTI3LjA4Ni0xNS42MjQtMi4wODItMTguNzUtNi4yNS0xOC43NS0xMy41MzkgMC03LjI5MyA1LjIwOC0xMS45OCAxNS42MjYtMTEuOTggOS4zNzQgMCAxNC41ODIgMy4xMjQgMTcuMTg3IDEwLjkzNy41MiAxLjU2MyAyLjA4MiAyLjYwNSAzLjY0NSAyLjYwNWg4LjMzNWMyLjA4MyAwIDMuNjQ1LTEuNTYyIDMuNjQ1LTMuNjQ4di0uNTJjLTIuMDgyLTExLjQ1Ny0xMS40NTctMjAuMzEyLTIzLjQzOC0yMS4zNTV2LTEyLjVjMC0yLjA4Mi0xLjU2Mi0zLjY0NC00LjE2Ny00LjE2NGgtNy44MTNjLTIuMDgyIDAtMy42NDQgMS41NjItNC4xNjQgNC4xNjR2MTEuOThjLTE1LjYyNSAyLjA4My0yNS41MjMgMTIuNS0yNS41MjMgMjUuNTIgMCAxNy4xODggMTAuNDE4IDIzLjk2MSAzMi4yOTMgMjYuNTYzIDE0LjU4MiAyLjYwNSAxOS4yNjkgNS43MyAxOS4yNjkgMTQuMDYyIDAgOC4zMzYtNy4yODkgMTQuMDYzLTE3LjE4NyAxNC4wNjMtMTMuNTQgMC0xOC4yMjctNS43MjctMTkuNzktMTMuNTQtLjUyMy0yLjA4NS0yLjA4NS0zLjEyNS0zLjY0OC0zLjEyNUg5My4yM2MtMi4wODUgMC0zLjY0OCAxLjU2My0zLjY0OCAzLjY0NXYuNTJjMi4wODYgMTMuMDIzIDEwLjQxOCAyMi4zOTggMjcuNjA2IDI1djEyLjVjMCAyLjA4NSAxLjU2MiAzLjY0OCA0LjE2NyA0LjE2N2g3LjgxM2MyLjA4MiAwIDMuNjQ0LTEuNTYyIDQuMTY0LTQuMTY3di0xMi41YzE1LjYyNS0yLjYwMiAyNi4wNDMtMTMuNTQgMjYuMDQzLTI3LjYwMnptMCAwIi8+PHBhdGggZD0iTTk4LjQzOCAxOTkuNDhjLTQwLjYyNi0xNC41ODUtNjEuNDU4LTU5Ljg5OC00Ni4zNTYtMTAwIDcuODEzLTIxLjg3NSAyNS0zOC41NDMgNDYuMzU1LTQ2LjM1NSAyLjA4My0xLjA0MyAzLjEyNi0yLjYwNSAzLjEyNi01LjIwN3YtNy4yOTNjMC0yLjA4Mi0xLjA0My0zLjY0NS0zLjEyNi00LjE2OC0uNTE5IDAtMS41NjIgMC0yLjA4Mi41MjMtNDkuNDggMTUuNjI1LTc2LjU2MiA2OC4yMjctNjAuOTM3IDExNy43MDggOS4zNzUgMjkuMTY3IDMxLjc3IDUxLjU2MiA2MC45MzcgNjAuOTM3IDIuMDgyIDEuMDQzIDQuMTY1IDAgNC42ODgtMi4wODIuNTItLjUyMy41Mi0xLjA0My41Mi0yLjA4NnYtNy4yODljMC0xLjU2My0xLjU2My0zLjY0OC0zLjEyNi00LjY4OHptNTUuMjA3LTE2Mi41Yy0yLjA4My0xLjA0Mi00LjE2NSAwLTQuNjg4IDIuMDgzLS41Mi41MTktLjUyIDEuMDQyLS41MiAyLjA4MnY3LjI5MmMwIDIuMDgzIDEuNTYzIDQuMTY4IDMuMTI1IDUuMjA4IDQwLjYyNSAxNC41ODUgNjEuNDU4IDU5Ljg5OCA0Ni4zNTYgMTAwLTcuODEzIDIxLjg3NS0yNSAzOC41NDItNDYuMzU2IDQ2LjM1NS0yLjA4MiAxLjA0My0zLjEyNSAyLjYwNS0zLjEyNSA1LjIwN3Y3LjI5M2MwIDIuMDgyIDEuMDQzIDMuNjQ1IDMuMTI1IDQuMTY4LjUyIDAgMS41NjMgMCAyLjA4My0uNTIzIDQ5LjQ4LTE1LjYyNSA3Ni41NjItNjguMjI3IDYwLjkzNy0xMTcuNzA4LTkuMzc1LTI5LjY4Ny0zMi4yODktNTIuMDgyLTYwLjkzNy02MS40NTd6bTAgMCIvPjwvZz48L3N2Zz4=',
      units: [{ name: 'USDC', symbol: 'SUSDCOL', decimals: 18 }],
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
      mocks?.getPermissionsReturnValue ?? mockGetPermissionsReturnValue,
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
    const { controller, messenger, mockSnapHandleRequest } = setupController();

    mockSnapHandleRequest
      .mockReturnValueOnce(mockGetAssetsResult)
      .mockReturnValueOnce(mockGetMetadataReturnValue);

    messenger.publish(
      'AccountsController:accountAdded',
      mockSolanaAccount as unknown as InternalAccount,
    );

    await advanceTime({ clock, duration: 1 });

    expect(controller.state).toStrictEqual({
      allNonEvmTokens: {
        [mockSolanaAccount.id]: mockGetAssetsResult,
      },
      metadata: mockGetMetadataReturnValue,
    });
  });

  it('should not delete account from allNonEvmTokens when "AccountsController:accountRemoved" is fired with EVM account', async () => {
    const { controller, messenger, mockSnapHandleRequest } = setupController();

    mockSnapHandleRequest
      .mockReturnValueOnce(mockGetAssetsResult)
      .mockReturnValueOnce(mockGetMetadataReturnValue);

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

      metadata: mockGetMetadataReturnValue,
    });
    // Remove an EVM account
    messenger.publish('AccountsController:accountRemoved', mockEthAccount.id);

    await advanceTime({ clock, duration: 1 });

    expect(controller.state).toStrictEqual({
      allNonEvmTokens: {
        [mockSolanaAccount.id]: mockGetAssetsResult,
      },

      metadata: mockGetMetadataReturnValue,
    });
  });

  it('updates allNonEvmTokens when "AccountsController:accountRemoved" is fired', async () => {
    const { controller, messenger, mockSnapHandleRequest } = setupController();

    mockSnapHandleRequest
      .mockReturnValueOnce(mockGetAssetsResult)
      .mockReturnValueOnce(mockGetMetadataReturnValue);

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

      metadata: mockGetMetadataReturnValue,
    });
    // Remove the added solana account
    messenger.publish(
      'AccountsController:accountRemoved',
      mockSolanaAccount.id,
    );

    await advanceTime({ clock, duration: 1 });

    expect(controller.state).toStrictEqual({
      allNonEvmTokens: {},

      metadata: mockGetMetadataReturnValue,
    });
  });

  describe('updateAccountAssetsList', () => {
    it('should update the assets list for an account when a new asset is added', () => {
      const mockSolanaAccountId1 = 'account1';
      const mockSolanaAccountId2 = 'account2';
      const { controller } = setupController({
        state: {
          allNonEvmTokens: {
            [mockSolanaAccountId1]: mockGetAssetsResult,
          },
          metadata: mockGetMetadataReturnValue,
        } as MultichainAssetsControllerState,
      });

      const updatedAssetsList: AccountAssetListUpdatedEvent = {
        method: 'notify:accountAssetListUpdated',
        params: {
          assets: {
            [mockSolanaAccountId1]: {
              added: ['solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1/token:newToken'],
              removed: [],
            },
            [mockSolanaAccountId2]: {
              added: [
                'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1/token:newToken3',
              ],
              removed: [],
            },
          },
        },
      };

      // call updateAccountAssetsList
      controller.updateAccountAssetsList(updatedAssetsList);

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
    });

    it('should not add duplicate assets to state', () => {
      const mockSolanaAccountId1 = 'account1';
      const mockSolanaAccountId2 = 'account2';
      const { controller } = setupController({
        state: {
          allNonEvmTokens: {
            [mockSolanaAccountId1]: mockGetAssetsResult,
          },
          metadata: mockGetMetadataReturnValue,
        } as MultichainAssetsControllerState,
      });

      const updatedAssetsList: AccountAssetListUpdatedEvent = {
        method: 'notify:accountAssetListUpdated',
        params: {
          assets: {
            [mockSolanaAccountId1]: {
              added:
                mockGetAssetsResult as `${string}:${string}/${string}:${string}`[],
              removed: [],
            },
            [mockSolanaAccountId2]: {
              added: [
                'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1/token:newToken3',
              ],
              removed: [],
            },
          },
        },
      };

      // call updateAccountAssetsList
      controller.updateAccountAssetsList(updatedAssetsList);

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

    it('should update the assets list for an account when a an asset is removed', () => {
      const mockSolanaAccountId1 = 'account1';
      const mockSolanaAccountId2 = 'account2';
      const { controller } = setupController({
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

      const updatedAssetsList: AccountAssetListUpdatedEvent = {
        method: 'notify:accountAssetListUpdated',
        params: {
          assets: {
            [mockSolanaAccountId2]: {
              added: [],
              removed: [
                'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1/token:newToken3',
              ],
            },
          },
        },
      };

      // call updateAccountAssetsList
      controller.updateAccountAssetsList(updatedAssetsList);

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

