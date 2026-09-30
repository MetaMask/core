import { LIGHTER_TX_TYPE_CHANGE_PUB_KEY } from '../../../src/constants/lighterConfig.js';
import { PERPS_CONSTANTS } from '../../../src/constants/perpsConfig.js';
import { PERPS_ERROR_CODES } from '../../../src/perpsErrorCodes.js';
import { LighterProvider } from '../../../src/providers/LighterProvider.js';
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
import {
  MAIN_SIGNATURE,
  OTHER_MAIN_ADDRESS,
} from '../../helpers/agentFixtures.js';
import {
  createKeyringlessMessenger,
  createKeyringMessenger,
  createMockEvmAccount,
  createMockInfrastructure,
  keyringCalls,
  NOW,
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
// EIP-1193 `userRejectedRequest`, pinned here independently of the provider.
const EIP1193_USER_REJECTED_CODE = 4001;
// The registration transaction the mocked signer submits.
const CHANGE_PUB_KEY_TX = [
  LIGHTER_TX_TYPE_CHANGE_PUB_KEY,
  JSON.stringify({
    changePubKey: true,
    Nonce: NEXT_NONCE,
    ExpiredAt: NOW + TX_EXPIRY_MS,
  }),
];

/**
 * Pin the clock the mocked signer stamps its transaction with.
 */
function pinClock(): void {
  jest.spyOn(Date, 'now').mockReturnValue(NOW);
}

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
  bridge: LighterSignerBridge;
  address: string;
  client: {
    sendTx: jest.Mock;
    getAccountsByL1Address: jest.Mock;
    getApiKeys: jest.Mock;
    getNextNonce: jest.Mock;
  };
  accountSigner: { signPersonalMessage: jest.Mock };
  call: jest.SpyInstance;
  selectAccount: (address: `0x${string}`) => void;
  deselectAccount: () => void;
  calls: LighterWasmCall[];
  deps: ReturnType<typeof createMockInfrastructure>;
};

type BuildOptions = {
  isReady?: () => boolean;
  // Sign through a KeyringController instead of accountSigner.
  keyring?: boolean;
  // Whether that KeyringController is unlocked.
  keyringUnlocked?: boolean;
  // Find the account by L1 address instead of a configured index.
  findAccountByAddress?: boolean;
  withoutBridge?: boolean;
  storedKeyIndices?: number[];
};

function buildProvider({
  isReady,
  keyring = false,
  keyringUnlocked = true,
  findAccountByAddress = false,
  withoutBridge = false,
  storedKeyIndices,
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
  const { messenger, call, selectAccount, deselectAccount } = keyring
    ? createKeyringMessenger(MAIN_SIGNATURE, keyringUnlocked)
    : createKeyringlessMessenger();
  const { bridge, calls } = createBridge();
  if (storedKeyIndices) {
    Object.assign(bridge, {
      getStoredKeyIndices: jest.fn().mockResolvedValue(storedKeyIndices),
    });
    client.sendTx.mockImplementation(async () => {
      const existing = (await client.getApiKeys()) as Awaited<
        ReturnType<LighterClientService['getApiKeys']>
      >;
      const created = calls
        .filter((signerCall) => signerCall.function === '_createClient')
        .at(-1);
      client.getApiKeys.mockResolvedValue({
        code: 200,
        apiKeys: [
          ...existing.apiKeys,
          { apiKeyIndex: created?.params[3], publicKey: '9c'.repeat(40) },
        ],
      });
      return { code: 200, txHash: '0xsent' };
    });
  }
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
    bridge,
    address,
    client,
    accountSigner,
    call,
    selectAccount,
    deselectAccount,
    calls,
    deps,
  };
}

describe('LighterProvider with accountSigner', () => {
  beforeEach(pinClock);
  afterEach(() => jest.useRealTimers());

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
    expect(accountSigner.signPersonalMessage.mock.calls).toStrictEqual([
      [address, CHANGE_PUB_KEY_BODY],
    ]);
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

  it('prepares nothing while the account signer is locked from the first call', async () => {
    const { provider, client, accountSigner, calls, deps } = buildProvider({
      isReady: () => false,
    });
    const loggerError = jest.spyOn(deps.logger, 'error');

    const result = await provider.prepareTradingWallet();

    expect(result).toStrictEqual({
      ready: false,
      error: PERPS_ERROR_CODES.KEYRING_LOCKED,
    });
    expect(calls).toStrictEqual([]);
    expect(client.getNextNonce).not.toHaveBeenCalled();
    expect(accountSigner.signPersonalMessage).not.toHaveBeenCalled();
    expect(client.sendTx).not.toHaveBeenCalled();
    expect(loggerError).not.toHaveBeenCalled();
  });

  it('reports KEYRING_LOCKED for a read-only provider while the account signer is locked: the lock check comes first', async () => {
    const { provider, deps } = buildProvider({
      isReady: () => false,
      withoutBridge: true,
    });
    const loggerError = jest.spyOn(deps.logger, 'error');

    const result = await provider.prepareTradingWallet();

    expect(result).toStrictEqual({
      ready: false,
      error: PERPS_ERROR_CODES.KEYRING_LOCKED,
    });
    expect(loggerError).not.toHaveBeenCalled();
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
            feature: PERPS_CONSTANTS.FeatureName,
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
      Object.assign(new Error('Rejected'), {
        code: EIP1193_USER_REJECTED_CODE,
      }),
    ],
    ['a "User rejected" message', new Error('User rejected the request.')],
    ['a "User denied" message', new Error('User denied message signature.')],
    ['a "User cancelled" message', new Error('User cancelled the request.')],
    ['a "User canceled" message', new Error('User canceled the request.')],
    [
      'a rejection message wrapped in the cause chain',
      new Error('Signing failed', {
        cause: new Error('User rejected the request.'),
      }),
    ],
    [
      'a rejection code wrapped in the cause chain',
      new Error('Signing failed', {
        cause: Object.assign(new Error('Rejected'), {
          code: EIP1193_USER_REJECTED_CODE,
        }),
      }),
    ],
  ])(
    'reports a decline signalled by %s as a retry without logging, and asks again',
    async (_signal, rejection) => {
      const { provider, address, accountSigner, client, deps } =
        buildProvider();
      accountSigner.signPersonalMessage.mockRejectedValueOnce(rejection);
      const loggerError = jest.spyOn(deps.logger, 'error');

      const declined = await provider.prepareTradingWallet();
      const retried = await provider.prepareTradingWallet();

      expect(declined).toStrictEqual({ ready: false });
      expect(retried).toStrictEqual({ ready: true });
      expect(accountSigner.signPersonalMessage.mock.calls).toStrictEqual([
        [address, CHANGE_PUB_KEY_BODY],
        [address, CHANGE_PUB_KEY_BODY],
      ]);
      expect(client.sendTx.mock.calls).toStrictEqual([CHANGE_PUB_KEY_TX]);
      expect(loggerError).not.toHaveBeenCalled();
    },
  );

  it('reports EXCHANGE_ACCOUNT_NOT_FOUND without logging for a wallet with no Lighter account yet, then registers once it exists', async () => {
    const { provider, client, deps } = buildProvider({
      findAccountByAddress: true,
    });
    client.getAccountsByL1Address.mockRejectedValueOnce(
      new LighterApiError('account not found', ACCOUNT_NOT_FOUND_CODE),
    );
    const loggerError = jest.spyOn(deps.logger, 'error');

    const missing = await provider.prepareTradingWallet();
    // The account now exists (funded through the bridge).
    const retried = await provider.prepareTradingWallet();

    expect(missing).toStrictEqual({
      ready: false,
      error: PERPS_ERROR_CODES.EXCHANGE_ACCOUNT_NOT_FOUND,
    });
    expect(retried).toStrictEqual({ ready: true });
    expect(client.sendTx.mock.calls).toStrictEqual([CHANGE_PUB_KEY_TX]);
    expect(loggerError).not.toHaveBeenCalled();
  });

  it('reports ready without signing when the venue key is already registered', async () => {
    const { provider, accountSigner, client } = buildProvider();
    client.getApiKeys.mockResolvedValue({
      code: 200,
      apiKeys: [{ apiKeyIndex: API_KEY_INDEX, publicKey: '9c'.repeat(40) }],
    });

    const result = await provider.prepareTradingWallet();

    expect(result).toStrictEqual({ ready: true });
    expect(accountSigner.signPersonalMessage).not.toHaveBeenCalled();
    expect(client.sendTx).not.toHaveBeenCalled();
  });

  it('recovers a restored wallet without overwriting its occupied slot', async () => {
    const { provider, client, calls, accountSigner, bridge } = buildProvider({
      storedKeyIndices: [],
    });
    Object.assign(bridge, {
      getRecoverableKeyIndices: jest.fn(
        async (params: { apiKeyIndices: number[] }) => params.apiKeyIndices,
      ),
    });
    client.getApiKeys.mockResolvedValue({
      code: 200,
      apiKeys: [{ apiKeyIndex: 7, publicKey: 'ab'.repeat(40) }],
    });

    const result = await provider.prepareTradingWallet();

    expect(result).toStrictEqual({ ready: true });
    const created = calls
      .filter((call) => call.function === '_createClient')
      .at(-1);
    expect(created?.params[3]).not.toBe(7);
    expect(created?.params[3]).toBeGreaterThanOrEqual(2);
    expect(created?.params[3]).toBeLessThanOrEqual(254);
    expect(accountSigner.signPersonalMessage).toHaveBeenCalledTimes(1);
    expect(client.sendTx).toHaveBeenCalledTimes(1);
  });

  it('reuses a matching device key in another slot without registering again', async () => {
    const { provider, client, calls, accountSigner } = buildProvider({
      storedKeyIndices: [19],
    });
    client.getApiKeys.mockResolvedValue({
      code: 200,
      apiKeys: [
        { apiKeyIndex: 7, publicKey: 'ab'.repeat(40) },
        { apiKeyIndex: 19, publicKey: '9c'.repeat(40) },
      ],
    });

    const result = await provider.prepareTradingWallet();

    expect(result).toStrictEqual({ ready: true });
    expect(
      calls.find((call) => call.function === '_createClient')?.params[3],
    ).toBe(19);
    expect(accountSigner.signPersonalMessage).not.toHaveBeenCalled();
    expect(client.sendTx).not.toHaveBeenCalled();
  });

  it('reuses a wallet-recoverable registration after all local keys are lost', async () => {
    const { provider, client, bridge, accountSigner, calls } = buildProvider({
      storedKeyIndices: [],
    });
    Object.assign(bridge, {
      getRecoverableKeyIndices: jest.fn().mockResolvedValue([7, 19]),
    });
    client.getApiKeys.mockResolvedValue({
      code: 200,
      apiKeys: [
        { apiKeyIndex: 7, publicKey: 'ab'.repeat(40) },
        { apiKeyIndex: 19, publicKey: '9c'.repeat(40) },
      ],
    });

    expect(await provider.prepareTradingWallet()).toStrictEqual({
      ready: true,
    });
    expect(
      calls
        .filter((call) => call.function === '_createClient')
        .map((call) => call.params[3]),
    ).toStrictEqual([7, 19]);
    expect(accountSigner.signPersonalMessage).not.toHaveBeenCalled();
    expect(client.sendTx).not.toHaveBeenCalled();
  });

  it.each(['wallet-recovery', 'storage-only'] as const)(
    'refuses repeated slot allocation with %s discovery after key loss',
    async (discovery) => {
      const { provider, client, bridge, calls } = buildProvider({
        storedKeyIndices: [],
      });
      if (discovery === 'wallet-recovery') {
        Object.assign(bridge, {
          getRecoverableKeyIndices: jest.fn().mockResolvedValue([]),
        });
      }
      client.getApiKeys.mockResolvedValue({
        code: 200,
        apiKeys: [{ apiKeyIndex: 7, publicKey: 'ab'.repeat(40) }],
      });

      const result = await provider.prepareTradingWallet();

      expect(result.ready).toBe(false);
      expect(result.error).toContain('recovery is unavailable');
      expect(client.sendTx).not.toHaveBeenCalled();
      expect(calls).toStrictEqual([]);
    },
  );

  it('reuses an occupied recoverable slot before a free preferred slot', async () => {
    const { provider, client, bridge, calls } = buildProvider({
      storedKeyIndices: [],
    });
    Object.assign(bridge, {
      getRecoverableKeyIndices: jest.fn().mockResolvedValue([7, 19]),
    });
    client.getApiKeys.mockResolvedValue({
      code: 200,
      apiKeys: [{ apiKeyIndex: 19, publicKey: '9c'.repeat(40) }],
    });

    const result = await provider.prepareTradingWallet();

    expect(result).toStrictEqual({ ready: true });
    expect(
      calls
        .filter((call) => call.function === '_createClient')
        .map((call) => call.params[3]),
    ).toStrictEqual([19]);
    expect(client.sendTx).not.toHaveBeenCalled();
  });

  it('binds bridge discovery and client creation to the Core wallet address', async () => {
    const { provider, bridge, address } = buildProvider({
      storedKeyIndices: [],
    });
    const discover = jest.fn().mockResolvedValue([]);
    Object.assign(bridge, { getRecoverableKeyIndices: discover });
    const createClient = jest.spyOn(bridge, 'createClient');

    await provider.prepareTradingWallet();

    expect(discover).toHaveBeenCalledWith(
      expect.objectContaining({ walletAddress: address.toLowerCase() }),
    );
    expect(createClient).toHaveBeenCalledWith(
      expect.objectContaining({ walletAddress: address.toLowerCase() }),
    );
  });

  it('refuses unrequested recoverable slots before creating a client', async () => {
    const { provider, client, bridge, calls } = buildProvider({
      storedKeyIndices: [],
    });
    Object.assign(bridge, {
      getRecoverableKeyIndices: jest.fn().mockResolvedValue([255]),
    });

    const result = await provider.prepareTradingWallet();

    expect(result).toMatchObject({
      ready: false,
      error: 'Lighter signer returned an unrequested key slot',
    });
    expect(calls).toStrictEqual([]);
    expect(client.sendTx).not.toHaveBeenCalled();
  });

  it('waits for the registered public key before reporting trading ready', async () => {
    jest.useFakeTimers();
    const { provider, client } = buildProvider({ storedKeyIndices: [] });
    client.sendTx.mockImplementationOnce(async () => {
      client.getApiKeys
        .mockResolvedValueOnce({ code: 200, apiKeys: [] })
        .mockResolvedValue({
          code: 200,
          apiKeys: [{ apiKeyIndex: 7, publicKey: '9c'.repeat(40) }],
        });
      return { code: 200, txHash: '0xsent' };
    });
    let ready = false;
    const setup = provider.prepareTradingWallet().then((result) => {
      ready = result.ready;
      return result;
    });
    await jest.advanceTimersByTimeAsync(0);

    expect(ready).toBe(false);
    await jest.advanceTimersByTimeAsync(1000);
    expect(await setup).toStrictEqual({ ready: true });
    expect(client.sendTx).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });

  it('skips a replaced local key and registers only in an unused slot', async () => {
    const { provider, client, calls } = buildProvider({
      storedKeyIndices: [7],
    });
    client.getApiKeys.mockResolvedValue({
      code: 200,
      apiKeys: [{ apiKeyIndex: 7, publicKey: 'ab'.repeat(40) }],
    });

    const result = await provider.prepareTradingWallet();

    expect(result).toStrictEqual({ ready: true });
    const creates = calls.filter((call) => call.function === '_createClient');
    expect(creates[0].params[3]).toBe(7);
    expect(creates[1].params[3]).not.toBe(7);
    expect(client.sendTx).toHaveBeenCalledTimes(1);
  });

  it('stops waiting when accepted key registration remains invisible', async () => {
    jest.useFakeTimers();
    const { provider, client } = buildProvider({ storedKeyIndices: [] });
    client.sendTx.mockResolvedValue({ code: 200, txHash: '0xsent' });
    const setup = provider.prepareTradingWallet();

    await jest.advanceTimersByTimeAsync(11000);

    const result = await setup;
    expect(result.ready).toBe(false);
    expect(result.error).toContain('registration is still pending');
    expect(client.sendTx).toHaveBeenCalledTimes(1);
  });

  it('refuses a different key becoming visible during registration', async () => {
    const { provider, client } = buildProvider({ storedKeyIndices: [] });
    client.sendTx.mockImplementation(async () => {
      client.getApiKeys.mockResolvedValue({
        code: 200,
        apiKeys: [{ apiKeyIndex: 7, publicKey: 'ab'.repeat(40) }],
      });
      return { code: 200, txHash: '0xsent' };
    });

    const result = await provider.prepareTradingWallet();

    expect(result).toMatchObject({
      ready: false,
      error: 'Lighter trading key changed during registration',
    });
    expect(client.sendTx).toHaveBeenCalledTimes(1);
  });

  it('bounds a stalled registration-visibility read by the wall deadline', async () => {
    jest.useFakeTimers();
    const { provider, client } = buildProvider({ storedKeyIndices: [] });
    client.sendTx.mockImplementation(async () => {
      client.getApiKeys.mockImplementation(() => new Promise(() => undefined));
      return { code: 200, txHash: '0xsent' };
    });
    const setup = provider.prepareTradingWallet();

    await jest.advanceTimersByTimeAsync(11000);
    const result = await setup;

    expect(result.ready).toBe(false);
    expect(result.error).toContain('registration is still pending');
    expect(client.sendTx).toHaveBeenCalledTimes(1);
    expect(client.getApiKeys).toHaveBeenCalledTimes(3);
  });

  it('abandons registration visibility when the selected wallet changes', async () => {
    const { provider, client, selectAccount } = buildProvider({
      storedKeyIndices: [],
    });
    client.sendTx.mockImplementation(async () => {
      client.getApiKeys.mockImplementation(async () => {
        selectAccount(OTHER_MAIN_ADDRESS);
        return { code: 200, apiKeys: [] };
      });
      return { code: 200, txHash: '0xsent' };
    });

    const result = await provider.prepareTradingWallet();

    expect(result.ready).toBe(false);
    expect(result.error).toBe(PERPS_ERROR_CODES.PROVIDER_LIFECYCLE_STALE);
    expect(client.sendTx).toHaveBeenCalledTimes(1);
  });

  it('fails without signing or replacing any key when every slot is occupied', async () => {
    const { provider, client, accountSigner, calls } = buildProvider({
      storedKeyIndices: [],
    });
    client.getApiKeys.mockResolvedValue({
      code: 200,
      apiKeys: Array.from({ length: 253 }, (_, index) => ({
        apiKeyIndex: index + 2,
        publicKey: 'ab'.repeat(40),
      })),
    });

    const result = await provider.prepareTradingWallet();

    expect(result.ready).toBe(false);
    expect(result.error).toContain('No available Lighter trading key slot');
    expect(calls).toStrictEqual([]);
    expect(accountSigner.signPersonalMessage).not.toHaveBeenCalled();
    expect(client.sendTx).not.toHaveBeenCalled();
  });

  it('reports NO_ACCOUNT_SELECTED without registering or logging when no account is selected', async () => {
    const { provider, accountSigner, client, calls, deps, deselectAccount } =
      buildProvider();
    deselectAccount();
    const loggerError = jest.spyOn(deps.logger, 'error');

    const result = await provider.prepareTradingWallet();

    expect(result).toStrictEqual({
      ready: false,
      error: PERPS_ERROR_CODES.NO_ACCOUNT_SELECTED,
    });
    expect(calls).toStrictEqual([]);
    expect(accountSigner.signPersonalMessage).not.toHaveBeenCalled();
    expect(client.sendTx).not.toHaveBeenCalled();
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
        selectAccount(OTHER_MAIN_ADDRESS);
      },
    ],
    [
      'the wallet deselects its account',
      async ({ deselectAccount }: BuiltProvider): Promise<void> => {
        deselectAccount();
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

  it('reports a read-only provider (no signer bridge) as ready without logging', async () => {
    const { provider, accountSigner, client, deps } = buildProvider({
      withoutBridge: true,
    });
    const loggerError = jest.spyOn(deps.logger, 'error');

    const result = await provider.prepareTradingWallet();

    expect(result).toStrictEqual({ ready: true });
    expect(accountSigner.signPersonalMessage).not.toHaveBeenCalled();
    expect(client.sendTx).not.toHaveBeenCalled();
    expect(loggerError).not.toHaveBeenCalled();
  });

  it('reports NO_ACCOUNT_SELECTED for a read-only provider (no signer bridge) with no account selected', async () => {
    const { provider, deselectAccount, deps } = buildProvider({
      withoutBridge: true,
    });
    deselectAccount();
    const loggerError = jest.spyOn(deps.logger, 'error');

    const result = await provider.prepareTradingWallet();

    expect(result).toStrictEqual({
      ready: false,
      error: PERPS_ERROR_CODES.NO_ACCOUNT_SELECTED,
    });
    expect(loggerError).not.toHaveBeenCalled();
  });

  it('reports KEYRING_LOCKED when the signer locks once the venue key is registered', async () => {
    let signerReady = true;
    const { provider, accountSigner, client, deps } = buildProvider({
      isReady: () => signerReady,
    });
    accountSigner.signPersonalMessage.mockImplementation(async () => {
      signerReady = false;
      return MAIN_SIGNATURE;
    });
    const loggerError = jest.spyOn(deps.logger, 'error');

    const result = await provider.prepareTradingWallet();

    expect(client.sendTx.mock.calls).toStrictEqual([CHANGE_PUB_KEY_TX]);
    expect(result).toStrictEqual({
      ready: false,
      error: PERPS_ERROR_CODES.KEYRING_LOCKED,
    });
    expect(loggerError).not.toHaveBeenCalled();
  });

  it('reports KEYRING_LOCKED without logging when the host rejects as locked while still reporting ready', async () => {
    const { provider, accountSigner, client, deps } = buildProvider();
    accountSigner.signPersonalMessage.mockRejectedValue(
      new Error('Signing failed', {
        cause: new Error(PERPS_ERROR_CODES.KEYRING_LOCKED),
      }),
    );
    const loggerError = jest.spyOn(deps.logger, 'error');

    const result = await provider.prepareTradingWallet();

    expect(result).toStrictEqual({
      ready: false,
      error: PERPS_ERROR_CODES.KEYRING_LOCKED,
    });
    expect(client.sendTx).not.toHaveBeenCalled();
    expect(loggerError).not.toHaveBeenCalled();
  });

  it('reports KEYRING_LOCKED without logging when the signer locked after signing and the submission fails', async () => {
    let signerReady = true;
    const { provider, accountSigner, client, deps } = buildProvider({
      isReady: () => signerReady,
    });
    // The signature succeeds; the lock and the failure come after it.
    accountSigner.signPersonalMessage.mockImplementation(async () => {
      signerReady = false;
      return MAIN_SIGNATURE;
    });
    client.sendTx.mockRejectedValue(new Error('venue unavailable'));
    const loggerError = jest.spyOn(deps.logger, 'error');

    const result = await provider.prepareTradingWallet();

    expect(client.sendTx.mock.calls).toStrictEqual([CHANGE_PUB_KEY_TX]);
    expect(result).toStrictEqual({
      ready: false,
      error: PERPS_ERROR_CODES.KEYRING_LOCKED,
    });
    expect(loggerError).not.toHaveBeenCalled();
  });

  it('registers on the next preparation after the account signer locked during registration', async () => {
    let signerReady = true;
    const { provider, address, accountSigner, client, deps } = buildProvider({
      isReady: () => signerReady,
    });
    // The host's signer locks while signing and throws its own error.
    accountSigner.signPersonalMessage.mockImplementationOnce(async () => {
      signerReady = false;
      throw new Error('Wallet is locked');
    });
    const loggerError = jest.spyOn(deps.logger, 'error');

    const lockedResult = await provider.prepareTradingWallet();
    signerReady = true;
    const retriedResult = await provider.prepareTradingWallet();

    expect(lockedResult).toStrictEqual({
      ready: false,
      error: PERPS_ERROR_CODES.KEYRING_LOCKED,
    });
    expect(retriedResult).toStrictEqual({ ready: true });
    expect(accountSigner.signPersonalMessage.mock.calls).toStrictEqual([
      [address, CHANGE_PUB_KEY_BODY],
      [address, CHANGE_PUB_KEY_BODY],
    ]);
    expect(client.sendTx.mock.calls).toStrictEqual([CHANGE_PUB_KEY_TX]);
    expect(loggerError).not.toHaveBeenCalled();
  });
});

describe('LighterProvider with a KeyringController', () => {
  beforeEach(pinClock);

  it('prepares nothing and reports KEYRING_LOCKED while the keyring is locked', async () => {
    const { provider, client, call, calls, deps } = buildProvider({
      keyring: true,
      keyringUnlocked: false,
    });
    const loggerError = jest.spyOn(deps.logger, 'error');

    const result = await provider.prepareTradingWallet();

    expect(result).toStrictEqual({
      ready: false,
      error: PERPS_ERROR_CODES.KEYRING_LOCKED,
    });
    expect(keyringCalls(call)).toStrictEqual(['KeyringController:getState']);
    expect(calls).toStrictEqual([]);
    expect(client.getNextNonce).not.toHaveBeenCalled();
    expect(client.sendTx).not.toHaveBeenCalled();
    expect(loggerError).not.toHaveBeenCalled();
  });

  it('registers the venue key through prepareTradingWallet with a keyring signature', async () => {
    const { provider, address, client, call, calls } = buildProvider({
      keyring: true,
    });

    const result = await provider.prepareTradingWallet();

    expect(result).toStrictEqual({ ready: true });
    // Readiness before and after registration, around the signature of the
    // registration body's UTF-8 bytes, hex-encoded.
    expect(
      call.mock.calls.filter(([action]: [string]) =>
        action.startsWith('KeyringController:'),
      ),
    ).toStrictEqual([
      ['KeyringController:getState'],
      ['KeyringController:getState'],
      [
        'KeyringController:signPersonalMessage',
        {
          from: address,
          data: `0x${Buffer.from(CHANGE_PUB_KEY_BODY, 'utf8').toString('hex')}`,
        },
      ],
      ['KeyringController:getState'],
    ]);
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
  });
});
