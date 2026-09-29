import { LIGHTER_TX_TYPE_CHANGE_PUB_KEY } from '../../../src/constants/lighterConfig.js';
import { PERPS_ERROR_CODES } from '../../../src/perpsErrorCodes.js';
import {
  LIGHTER_SIGNER_UNAVAILABLE_ERROR,
  LighterProvider,
} from '../../../src/providers/LighterProvider.js';
import {
  LighterApiError,
  LighterClientService,
} from '../../../src/services/LighterClientService.js';
import type {
  LighterSignerBridge,
  LighterSignerOperation,
  LighterSignerResult,
  LighterWasmCall,
} from '../../../src/types/lighter-types.js';
import { MAIN_SIGNATURE } from '../../helpers/agentFixtures.js';
import {
  createKeyringMessenger,
  createKeyringlessMessenger,
  createMockEvmAccount,
  createMockInfrastructure,
  keyringCalls,
} from '../../helpers/serviceMocks.js';

// The wallet service stays real. The venue REST client and the WASM signer
// bridge are the mocked I/O boundaries.
jest.mock('../../../src/services/LighterClientService', () => ({
  ...jest.requireActual<
    typeof import('../../../src/services/LighterClientService.js')
  >('../../../src/services/LighterClientService'),
  LighterClientService: jest.fn(),
}));

const MockedClientService = LighterClientService as jest.MockedClass<
  typeof LighterClientService
>;

const ACCOUNT_INDEX = 28;
const API_KEY_INDEX = 7;
const NEXT_NONCE = 42;
// Expiry of the mocked signed transaction; only needs to be in the future.
const TX_EXPIRY_MS = 9 * 60 * 1000;
const CHANGE_PUB_KEY_BODY =
  'Register Lighter Account\n\npubkey: 0x9c...\nOnly sign this message for a trusted client!';
// Lighter's API error code for an L1 address with no account.
const ACCOUNT_NOT_FOUND_CODE = 21100;
// The registration transaction the mocked signer submits.
const CHANGE_PUB_KEY_TX = [
  LIGHTER_TX_TYPE_CHANGE_PUB_KEY,
  expect.stringContaining('"changePubKey":true'),
];

function createBridge(): {
  bridge: LighterSignerBridge;
  calls: LighterWasmCall[];
} {
  const calls: LighterWasmCall[] = [];
  const bridge: LighterSignerBridge = {
    createClient: jest.fn(async (params) =>
      bridge.execute({
        function: '_createClient',
        params: [
          params.chainId,
          params.accountIndex,
          params.nonce,
          params.apiKeyIndex,
        ],
      }),
    ),
    execute: jest.fn(
      async <Operation extends LighterSignerOperation>(
        call: LighterWasmCall<Operation>,
      ): Promise<LighterSignerResult<Operation>> => {
        calls.push(call);
        if (call.function === '_createClient') {
          return {
            success: true,
            pk: '9c'.repeat(40),
            pubKeySuccess: true,
            body: CHANGE_PUB_KEY_BODY,
          } as LighterSignerResult<Operation>;
        }
        return {
          txInfo: JSON.stringify({
            changePubKey: true,
            Nonce: NEXT_NONCE,
            ExpiredAt: Date.now() + TX_EXPIRY_MS,
          }),
          txHash: 'dddd000000000001',
        } as LighterSignerResult<Operation>;
      },
    ),
  };
  return { bridge, calls };
}

type BuiltProvider = {
  provider: LighterProvider;
  address: string;
  client: { sendTx: jest.Mock; getAccountsByL1Address: jest.Mock };
  accountSigner: { signPersonalMessage: jest.Mock };
  call: jest.SpyInstance;
  selectAccount: (address: `0x${string}`) => void;
  calls: LighterWasmCall[];
  deps: ReturnType<typeof createMockInfrastructure>;
};

type BuildOptions = {
  isReady?: () => boolean;
  // Sign through a KeyringController instead of accountSigner.
  keyring?: boolean;
  // Find the account by L1 address instead of a configured index.
  findAccountByAddress?: boolean;
  withoutBridge?: boolean;
};

function buildProvider({
  isReady,
  keyring = false,
  findAccountByAddress = false,
  withoutBridge = false,
}: BuildOptions = {}): BuiltProvider {
  const { address } = createMockEvmAccount();
  const account = {
    code: 0,
    accountType: 0,
    index: ACCOUNT_INDEX,
    l1Address: address,
    status: 1,
    collateral: '0',
    availableBalance: '0',
    positions: [],
  };
  const client = {
    network: 'testnet',
    getAccountsByL1Address: jest.fn().mockResolvedValue({
      code: 200,
      l1Address: address,
      subAccounts: [account],
    }),
    getAccountByIndex: jest
      .fn()
      .mockResolvedValue({ code: 200, accounts: [account] }),
    getApiKeys: jest.fn().mockResolvedValue({ code: 200, apiKeys: [] }),
    getNextNonce: jest.fn().mockResolvedValue({ code: 200, nonce: NEXT_NONCE }),
    getTx: jest.fn().mockResolvedValue(null),
    sendTx: jest.fn().mockResolvedValue({ code: 200, txHash: '0xsent' }),
  };
  MockedClientService.mockImplementation(
    () => client as unknown as LighterClientService,
  );
  const accountSigner = {
    signTypedData: jest.fn(),
    signPersonalMessage: jest.fn().mockResolvedValue(MAIN_SIGNATURE),
    isReady,
  };
  const { messenger, call, selectAccount } = keyring
    ? createKeyringMessenger(MAIN_SIGNATURE)
    : createKeyringlessMessenger();
  const { bridge, calls } = createBridge();
  const deps = keyring
    ? createMockInfrastructure()
    : { ...createMockInfrastructure(), accountSigner };
  const provider = new LighterProvider({
    isTestnet: true,
    platformDependencies: deps,
    messenger,
    lighterAuthConfig: {
      accountIndex: findAccountByAddress ? undefined : ACCOUNT_INDEX,
      apiKeyIndex: API_KEY_INDEX,
    },
    signerBridge: withoutBridge ? undefined : bridge,
    webSocketCtor: null,
  });
  return {
    provider,
    address,
    client,
    accountSigner,
    call,
    selectAccount,
    calls,
    deps,
  };
}

describe('LighterProvider with accountSigner', () => {
  it('registers the venue key with an L1 signature from accountSigner', async () => {
    const { provider, address, client, accountSigner, call, calls } =
      buildProvider();

    const result = await provider.isReadyToTrade();

    expect(result).toStrictEqual({
      ready: true,
      walletConnected: true,
      networkSupported: true,
      authenticatedAddress: address,
    });
    expect(accountSigner.signPersonalMessage).toHaveBeenCalledWith(
      address,
      CHANGE_PUB_KEY_BODY,
    );
    const changePubKey = calls.find(
      (wasmCall) => wasmCall.function === '_signChangePubKey',
    );
    expect(changePubKey?.params).toStrictEqual([
      ACCOUNT_INDEX,
      MAIN_SIGNATURE,
      NEXT_NONCE,
      API_KEY_INDEX,
    ]);
    expect(client.sendTx.mock.calls).toStrictEqual([CHANGE_PUB_KEY_TX]);
    expect(keyringCalls(call)).toStrictEqual([]);
  });

  it('reports KEYRING_LOCKED and registers nothing when accountSigner is not ready', async () => {
    const { provider, client, accountSigner, call, calls } = buildProvider({
      isReady: () => false,
    });

    const result = await provider.isReadyToTrade();

    expect(result).toStrictEqual({
      ready: false,
      error: PERPS_ERROR_CODES.KEYRING_LOCKED,
      walletConnected: false,
      networkSupported: true,
    });
    expect(accountSigner.signPersonalMessage).not.toHaveBeenCalled();
    expect(
      calls.some((wasmCall) => wasmCall.function === '_signChangePubKey'),
    ).toBe(false);
    expect(client.sendTx).not.toHaveBeenCalled();
    expect(keyringCalls(call)).toStrictEqual([]);
  });

  it('registers the venue key through prepareTradingWallet', async () => {
    const { provider, address, client, accountSigner } = buildProvider();

    const result = await provider.prepareTradingWallet();

    expect(result).toStrictEqual({ ready: true });
    expect(accountSigner.signPersonalMessage.mock.calls).toStrictEqual([
      [address, CHANGE_PUB_KEY_BODY],
    ]);
    expect(client.sendTx.mock.calls).toStrictEqual([CHANGE_PUB_KEY_TX]);
  });

  it('reports KEYRING_LOCKED from prepareTradingWallet once the signer locks, even with a registered venue key', async () => {
    let signerReady = true;
    const { provider } = buildProvider({ isReady: () => signerReady });
    const firstResult = await provider.prepareTradingWallet();

    signerReady = false;
    const lockedResult = await provider.prepareTradingWallet();

    expect(firstResult).toStrictEqual({ ready: true });
    expect(lockedResult).toStrictEqual({
      ready: false,
      error: PERPS_ERROR_CODES.KEYRING_LOCKED,
    });
  });

  it('logs a failed prepareTradingWallet with the original error', async () => {
    const { provider, client, deps } = buildProvider();
    const failure = new Error('venue unavailable');
    client.sendTx.mockRejectedValue(failure);
    const loggerError = jest.spyOn(deps.logger, 'error');

    const result = await provider.prepareTradingWallet();

    expect(result).toStrictEqual({ ready: false, error: 'venue unavailable' });
    expect(loggerError.mock.calls).toStrictEqual([
      [
        failure,
        {
          tags: {
            feature: 'perps',
            provider: 'LighterProvider',
            network: 'testnet',
          },
          context: {
            name: 'LighterProvider.prepareTradingWallet',
            data: { isTestnet: true },
          },
        },
      ],
    ]);
  });

  it.each([
    [
      'an EIP-1193 rejection code',
      Object.assign(new Error('Rejected'), { code: 4001 }),
    ],
    ['a "User rejected" message', new Error('User rejected the request.')],
    ['a "User denied" message', new Error('User denied message signature.')],
    [
      'a rejection code wrapped in the cause chain',
      new Error('Signing failed', {
        cause: Object.assign(new Error('Rejected'), { code: 4001 }),
      }),
    ],
  ])(
    'reports a decline signalled by %s as a retry without logging',
    async (_signal, rejection) => {
      const { provider, accountSigner, deps } = buildProvider();
      accountSigner.signPersonalMessage.mockRejectedValue(rejection);
      const loggerError = jest.spyOn(deps.logger, 'error');

      const result = await provider.prepareTradingWallet();

      expect(result).toStrictEqual({ ready: false });
      expect(loggerError).not.toHaveBeenCalled();
    },
  );

  it('reports a wallet with no Lighter account yet as a retry without logging', async () => {
    const { provider, client, deps } = buildProvider({
      findAccountByAddress: true,
    });
    client.getAccountsByL1Address.mockRejectedValue(
      new LighterApiError('account not found', ACCOUNT_NOT_FOUND_CODE),
    );
    const loggerError = jest.spyOn(deps.logger, 'error');

    const result = await provider.prepareTradingWallet();

    expect(result).toStrictEqual({ ready: false });
    expect(loggerError).not.toHaveBeenCalled();
  });

  it.each([
    [
      'the provider disconnects',
      async ({ provider }: BuiltProvider): Promise<void> => {
        await provider.disconnect();
      },
    ],
    [
      'the wallet switches accounts',
      async ({ selectAccount }: BuiltProvider): Promise<void> => {
        selectAccount('0x00000000000000000000000000000000000c0ffe');
      },
    ],
  ])(
    'reports a registration cancelled because %s as a stale provider without logging',
    async (_cause, cancelSession) => {
      const built = buildProvider();
      const { provider, accountSigner, client, deps } = built;
      accountSigner.signPersonalMessage.mockImplementation(async () => {
        await cancelSession(built);
        return MAIN_SIGNATURE;
      });
      const loggerError = jest.spyOn(deps.logger, 'error');

      const result = await provider.prepareTradingWallet();

      expect(result).toStrictEqual({
        ready: false,
        error: PERPS_ERROR_CODES.PROVIDER_LIFECYCLE_STALE,
      });
      expect(client.sendTx).not.toHaveBeenCalled();
      expect(loggerError).not.toHaveBeenCalled();
    },
  );

  it('reports and logs a missing signer bridge', async () => {
    const { provider, deps } = buildProvider({ withoutBridge: true });
    const loggerError = jest.spyOn(deps.logger, 'error');

    const result = await provider.prepareTradingWallet();

    expect(result).toStrictEqual({
      ready: false,
      error: LIGHTER_SIGNER_UNAVAILABLE_ERROR,
    });
    expect(loggerError).toHaveBeenCalledWith(
      new Error(LIGHTER_SIGNER_UNAVAILABLE_ERROR),
      {
        tags: {
          feature: 'perps',
          provider: 'LighterProvider',
          network: 'testnet',
        },
        context: {
          name: 'LighterProvider.prepareTradingWallet',
          data: { isTestnet: true },
        },
      },
    );
  });

  it('reports KEYRING_LOCKED when the signer locks once the venue key is registered', async () => {
    let signerReady = true;
    const { provider, accountSigner, client } = buildProvider({
      isReady: () => signerReady,
    });
    accountSigner.signPersonalMessage.mockImplementation(async () => {
      signerReady = false;
      return MAIN_SIGNATURE;
    });

    const result = await provider.prepareTradingWallet();

    expect(client.sendTx.mock.calls).toStrictEqual([CHANGE_PUB_KEY_TX]);
    expect(result).toStrictEqual({
      ready: false,
      error: PERPS_ERROR_CODES.KEYRING_LOCKED,
    });
  });

  it('reports KEYRING_LOCKED without logging when the signer locks as registration fails', async () => {
    let signerReady = true;
    const { provider, accountSigner, client, deps } = buildProvider({
      isReady: () => signerReady,
    });
    accountSigner.signPersonalMessage.mockImplementation(async () => {
      signerReady = false;
      throw new Error('wallet disconnected');
    });
    const loggerError = jest.spyOn(deps.logger, 'error');

    const result = await provider.prepareTradingWallet();

    expect(result).toStrictEqual({
      ready: false,
      error: PERPS_ERROR_CODES.KEYRING_LOCKED,
    });
    expect(client.sendTx).not.toHaveBeenCalled();
    expect(loggerError).not.toHaveBeenCalled();
  });

  it('reports KEYRING_LOCKED when the account signer locks during registration', async () => {
    const { provider, accountSigner, deps } = buildProvider();
    accountSigner.signPersonalMessage.mockRejectedValue(
      new Error(PERPS_ERROR_CODES.KEYRING_LOCKED),
    );
    const loggerError = jest.spyOn(deps.logger, 'error');

    const result = await provider.prepareTradingWallet();

    expect(result).toStrictEqual({
      ready: false,
      error: PERPS_ERROR_CODES.KEYRING_LOCKED,
    });
    expect(loggerError).not.toHaveBeenCalled();
  });
});

describe('LighterProvider with a KeyringController', () => {
  it('registers the venue key through prepareTradingWallet with a keyring signature', async () => {
    const { provider, client, call, calls } = buildProvider({ keyring: true });

    const result = await provider.prepareTradingWallet();

    expect(result).toStrictEqual({ ready: true });
    // Readiness before and after registration, around the signature.
    expect(keyringCalls(call)).toStrictEqual([
      'KeyringController:getState',
      'KeyringController:getState',
      'KeyringController:signPersonalMessage',
      'KeyringController:getState',
    ]);
    const changePubKey = calls.find(
      (wasmCall) => wasmCall.function === '_signChangePubKey',
    );
    expect(changePubKey?.params[1]).toBe(MAIN_SIGNATURE);
    expect(client.sendTx.mock.calls).toStrictEqual([CHANGE_PUB_KEY_TX]);
  });
});
