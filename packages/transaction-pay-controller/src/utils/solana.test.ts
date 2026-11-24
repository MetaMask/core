import type { AccountsControllerGetStateAction } from '@metamask/accounts-controller';
import type {
  ConfigRegistryControllerGetNetworkConfigByCaip2ChainIdAction,
  RegistryNetworkConfig,
} from '@metamask/config-registry-controller';
import type { MessengerActions, MockAnyNamespace } from '@metamask/messenger';
import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type { SnapControllerHandleRequestAction } from '@metamask/snaps-controllers';
import type { SnapId } from '@metamask/snaps-sdk';
import type { CaipAccountId, CaipChainId } from '@metamask/utils';
import { getBase64Encoder } from '@solana/codecs-strings';
import { getCompiledTransactionMessageDecoder } from '@solana/transaction-messages';
import { getTransactionDecoder } from '@solana/transactions';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MockedFunction, MockInstance } from 'vitest';

import type { TransactionPayControllerGetInfuraProjectIdAction } from '../TransactionPayController-method-action-types.js';
import type { TransactionPayControllerMessenger } from '../types.js';
import type { AssetAccount } from './account.js';
import {
  compileSolanaTransaction,
  computeSolanaFeeRaw,
  getSolanaNativeAssetId,
  getSolanaRentReserveRaw,
  getSolanaSource,
  isSolanaNativeRequest,
  isSolanaQuoteRequest,
  signAndSendSolanaTransaction,
  SolanaTransactionTooLargeError,
  waitForSolanaTransactionConfirmed,
} from './solana.js';
import type { SolanaSource, SolanaTransactionInstructions } from './solana.js';

const SCOPE = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp' as CaipChainId;
const PAYER = '7Ec4QeG8wF3RnTjHDrTuYP8hVV7WYuPFyM4hZUodkG6Z';
const RECEIVER = 'HZaWndaNWHFDd9Dhk5PQcJmR4aLQv3Y5nVf2gQmMEz2x';
const LOOKUP_TABLE = '4QwSwNriKPrz8DLW4ju5uxC2TN5cksJx6tPUPj7DGLAW';
const UNRESOLVED_LOOKUP_TABLE = '5n2ADjHPsqB4EVUNEX48xRqtnmuLu5XSHDwkJRR98qpM';
const BLOCKHASH = 'EkSnNWid2cvwEVnVx9aBqawnmiCNiDgp3gUdkDPTKN1N';
const RPC_URL = 'https://solana.rpc.test';
const SNAP_ID = 'npm:@metamask/solana-wallet-snap' as SnapId;
const SIGNATURE = 'signature';

const SOURCE: SolanaSource = {
  accountId: 'wallet-account-uuid',
  address: PAYER,
  scope: SCOPE,
  snapId: SNAP_ID,
};

const TRANSACTION: SolanaTransactionInstructions = {
  addressLookupTableAddresses: [LOOKUP_TABLE, UNRESOLVED_LOOKUP_TABLE],
  instructions: [
    {
      data: '02000000e803000000000000',
      keys: [
        { isSigner: true, isWritable: true, pubkey: PAYER },
        { isSigner: false, isWritable: true, pubkey: RECEIVER },
      ],
      programId: '11111111111111111111111111111111',
    },
  ],
};

/**
 * Build a Solana internal account fixture.
 *
 * @param account - Account fields.
 * @param account.address - Account address.
 * @param account.id - Account ID.
 * @param account.scope - Chain the account supports.
 * @param account.snapId - Snap that owns the account, if any.
 * @returns The internal account.
 */
function buildAccount({
  address,
  id,
  scope = SCOPE,
  snapId = SNAP_ID,
}: {
  address: string;
  id: string;
  scope?: CaipChainId;
  snapId?: SnapId;
}): AssetAccount {
  return {
    address,
    id,
    metadata: {
      importTime: 0,
      keyring: { type: 'Snap Keyring' },
      name: id,
      ...(snapId ? { snap: { id: snapId } } : {}),
    },
    methods: [],
    options: {},
    scopes: [scope],
    type: 'solana:data-account',
  };
}

/**
 * Mock the accounts known to `AccountsController`.
 *
 * @param mock - `AccountsController:getState` mock.
 * @param accounts - Accounts to return.
 */
function mockAccounts(
  mock: MockedFunction<AccountsControllerGetStateAction['handler']>,
  accounts: AssetAccount[],
): void {
  mock.mockReturnValue({
    accountIdByAddress: {},
    internalAccounts: {
      accounts: Object.fromEntries(
        accounts.map((account) => [account.id, account]),
      ),
      selectedAccount: '',
    },
  });
}

/**
 * Build a config registry network config with an RPC URL.
 *
 * @param url - RPC URL.
 * @returns The network config.
 */
function buildNetworkConfig(url: string): RegistryNetworkConfig {
  return {
    assets: {
      native: {
        assetId: `${SCOPE}/slip44:501`,
        decimals: 9,
        imageUrl: '',
        name: 'Solana',
        symbol: 'SOL',
      },
    },
    blockExplorerUrls: { default: '', fallbacks: [] },
    chainId: SCOPE,
    coingeckoPlatformId: 'solana',
    config: {
      isActive: true,
      isDefault: false,
      isDeletable: false,
      isDeprecated: false,
      isFeatured: true,
      isTestnet: false,
      priority: 0,
    },
    imageUrl: '',
    name: 'Solana',
    rpcProviders: {
      default: { networkClientId: 'solana-mainnet', type: 'infura', url },
      fallbacks: [],
    },
  };
}

/**
 * Build an RPC signature status, whose wire field `err` is a restricted
 * identifier.
 *
 * @param error - Transaction error, or null if it succeeded.
 * @param confirmationStatus - Commitment the transaction reached.
 * @returns The signature status.
 */
function getSignatureStatus(
  error: unknown,
  confirmationStatus?: string,
): Record<string, unknown> {
  return Object.fromEntries([
    ['err', error],
    ['confirmationStatus', confirmationStatus],
  ]);
}

describe('Solana Utils', () => {
  const getAccountsControllerStateMock: MockedFunction<
    AccountsControllerGetStateAction['handler']
  > = vi.fn();
  const getInfuraProjectIdMock: MockedFunction<
    TransactionPayControllerGetInfuraProjectIdAction['handler']
  > = vi.fn();
  const getNetworkConfigByCaip2ChainIdMock: MockedFunction<
    ConfigRegistryControllerGetNetworkConfigByCaip2ChainIdAction['handler']
  > = vi.fn();
  const snapHandleRequestMock: MockedFunction<
    SnapControllerHandleRequestAction['handler']
  > = vi.fn();

  const rootMessenger = new Messenger<
    MockAnyNamespace,
    MessengerActions<TransactionPayControllerMessenger>
  >({ namespace: MOCK_ANY_NAMESPACE });

  rootMessenger.registerActionHandler(
    'AccountsController:getState',
    getAccountsControllerStateMock,
  );
  rootMessenger.registerActionHandler(
    'TransactionPayController:getInfuraProjectId',
    getInfuraProjectIdMock,
  );
  rootMessenger.registerActionHandler(
    'ConfigRegistryController:getNetworkConfigByCaip2ChainId',
    getNetworkConfigByCaip2ChainIdMock,
  );
  rootMessenger.registerActionHandler(
    'SnapController:handleRequest',
    snapHandleRequestMock,
  );

  const messenger =
    rootMessenger as unknown as TransactionPayControllerMessenger;

  let fetchMock: MockInstance;

  /**
   * Mock Solana JSON-RPC responses by method. A list of responses is returned
   * in order, one per request.
   *
   * @param results - Responses keyed by RPC method.
   */
  function mockRpc(results: Record<string, unknown>): void {
    const calls: Record<string, number> = {};

    fetchMock.mockImplementation(async (_url: string, init: RequestInit) => {
      const { method } = JSON.parse(init.body as string) as { method: string };
      const result = results[method];
      const index = calls[method] ?? 0;
      calls[method] = index + 1;

      return {
        ok: true,
        json: async (): Promise<unknown> =>
          Array.isArray(result) ? result[index] : result,
      };
    });
  }

  beforeEach(() => {
    vi.resetAllMocks();
    fetchMock = vi.spyOn(global, 'fetch');

    getNetworkConfigByCaip2ChainIdMock.mockReturnValue(
      buildNetworkConfig(RPC_URL),
    );

    mockRpc({
      getLatestBlockhash: {
        result: {
          value: { blockhash: BLOCKHASH, lastValidBlockHeight: 1234 },
        },
      },
      getMultipleAccounts: {
        result: {
          value: [
            { data: { parsed: { info: { addresses: [RECEIVER] } } } },
            null,
          ],
        },
      },
    });
  });

  afterEach(() => {
    fetchMock.mockRestore();
  });

  describe('isSolanaQuoteRequest', () => {
    it('returns true for a Solana source asset', () => {
      expect(
        isSolanaQuoteRequest({ sourceAssetId: getSolanaNativeAssetId(SCOPE) }),
      ).toBe(true);
    });

    it('returns false for an EVM source asset', () => {
      expect(
        isSolanaQuoteRequest({ sourceAssetId: 'eip155:1/slip44:60' }),
      ).toBe(false);
    });
  });

  describe('isSolanaNativeRequest', () => {
    it('returns true for native SOL', () => {
      expect(
        isSolanaNativeRequest({ sourceAssetId: `${SCOPE}/slip44:501` }),
      ).toBe(true);
    });

    it('returns false for an SPL token', () => {
      expect(
        isSolanaNativeRequest({ sourceAssetId: `${SCOPE}/token:${RECEIVER}` }),
      ).toBe(false);
    });
  });

  describe('getSolanaSource', () => {
    it('returns the account matching the CAIP-10 source account and its Snap', () => {
      mockAccounts(getAccountsControllerStateMock, [
        buildAccount({ address: RECEIVER, id: 'other-account-uuid' }),
        buildAccount({
          address: PAYER,
          id: 'other-scope-account-uuid',
          scope: 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1',
        }),
        buildAccount({ address: PAYER, id: 'wallet-account-uuid' }),
      ]);

      expect(
        getSolanaSource(messenger, {
          sourceAccountId: `${SCOPE}:${PAYER}` as CaipAccountId,
          sourceAssetId: getSolanaNativeAssetId(SCOPE),
        }),
      ).toStrictEqual(SOURCE);
    });

    it.each([
      ['no account matches', []],
      [
        'the account has no Snap',
        [
          buildAccount({
            address: PAYER,
            id: 'wallet-account-uuid',
            snapId: '' as SnapId,
          }),
        ],
      ],
    ])('throws if %s', (_label, accounts) => {
      mockAccounts(getAccountsControllerStateMock, accounts);

      expect(() =>
        getSolanaSource(messenger, {
          sourceAccountId: `${SCOPE}:${PAYER}` as CaipAccountId,
          sourceAssetId: getSolanaNativeAssetId(SCOPE),
        }),
      ).toThrow('Solana source account not found');
    });
  });

  describe('compileSolanaTransaction', () => {
    it('compiles an unsigned v0 transaction with the source as fee payer', async () => {
      const result = await compileSolanaTransaction({
        messenger,
        source: SOURCE,
        transaction: TRANSACTION,
      });

      const transaction = getTransactionDecoder().decode(
        getBase64Encoder().encode(result.transaction),
      );
      const message = getCompiledTransactionMessageDecoder().decode(
        transaction.messageBytes,
      );

      expect(result.lastValidBlockHeight).toBe(1234);
      expect(message.version).toBe(0);
      expect(message.lifetimeToken).toBe(BLOCKHASH);
      expect(message.staticAccounts[0]).toBe(PAYER);
      expect(Object.values(transaction.signatures)).toStrictEqual([null]);
    });

    it('resolves lookup tables from the RPC, skipping unresolved ones', async () => {
      const result = await compileSolanaTransaction({
        messenger,
        source: SOURCE,
        transaction: TRANSACTION,
      });

      const message = getCompiledTransactionMessageDecoder().decode(
        getTransactionDecoder().decode(
          getBase64Encoder().encode(result.transaction),
        ).messageBytes,
      );

      expect(getNetworkConfigByCaip2ChainIdMock).toHaveBeenCalledWith(SCOPE);
      expect(message).toHaveProperty('addressTableLookups', [
        {
          lookupTableAddress: LOOKUP_TABLE,
          readonlyIndexes: [],
          writableIndexes: [0],
        },
      ]);
      expect(message.staticAccounts).not.toContain(RECEIVER);
    });

    it('skips the lookup table read when there are none', async () => {
      await compileSolanaTransaction({
        messenger,
        source: SOURCE,
        transaction: { ...TRANSACTION, addressLookupTableAddresses: [] },
      });

      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('compiles an instruction with empty data', async () => {
      const result = await compileSolanaTransaction({
        messenger,
        source: SOURCE,
        transaction: {
          addressLookupTableAddresses: [],
          instructions: [{ ...TRANSACTION.instructions[0], data: '' }],
        },
      });

      const message = getCompiledTransactionMessageDecoder().decode(
        getTransactionDecoder().decode(
          getBase64Encoder().encode(result.transaction),
        ).messageBytes,
      );

      expect(message.instructions[0].data).toBeUndefined();
    });

    it.each([
      [true, false],
      [false, false],
    ])(
      'maps signer %s and writable %s account roles',
      async (isSigner, isWritable) => {
        const result = await compileSolanaTransaction({
          messenger,
          source: SOURCE,
          transaction: {
            addressLookupTableAddresses: [],
            instructions: [
              {
                ...TRANSACTION.instructions[0],
                keys: [
                  { isSigner: true, isWritable: true, pubkey: PAYER },
                  { isSigner, isWritable, pubkey: RECEIVER },
                ],
              },
            ],
          },
        });

        expect(result.transaction).toStrictEqual(expect.any(String));
      },
    );

    it('substitutes the Infura project ID into an Infura RPC URL', async () => {
      getNetworkConfigByCaip2ChainIdMock.mockReturnValue(
        buildNetworkConfig(
          'https://solana-mainnet.infura.io/v3/{infuraProjectId}',
        ),
      );
      getInfuraProjectIdMock.mockReturnValue('test-project-id');

      await compileSolanaTransaction({
        messenger,
        source: SOURCE,
        transaction: { ...TRANSACTION, addressLookupTableAddresses: [] },
      });

      expect(fetchMock).toHaveBeenCalledWith(
        'https://solana-mainnet.infura.io/v3/test-project-id',
        expect.anything(),
      );
    });

    it('throws if an Infura RPC URL needs a project ID and none is configured', async () => {
      getNetworkConfigByCaip2ChainIdMock.mockReturnValue(
        buildNetworkConfig(
          'https://solana-mainnet.infura.io/v3/{infuraProjectId}',
        ),
      );

      await expect(
        compileSolanaTransaction({
          messenger,
          source: SOURCE,
          transaction: TRANSACTION,
        }),
      ).rejects.toThrow(
        `Solana RPC URL for ${SCOPE} requires an Infura project ID`,
      );
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('throws if no RPC URL is configured for the scope', async () => {
      getNetworkConfigByCaip2ChainIdMock.mockReturnValue(undefined);

      await expect(
        compileSolanaTransaction({
          messenger,
          source: SOURCE,
          transaction: TRANSACTION,
        }),
      ).rejects.toThrow(`Solana RPC URL not found for ${SCOPE}`);
    });

    it.each([
      [{ error: { message: 'rate limited' } }, 'rate limited'],
      [{}, 'missing result'],
    ])('throws on a JSON-RPC failure %o', async (response, message) => {
      mockRpc({ getLatestBlockhash: response });

      await expect(
        compileSolanaTransaction({
          messenger,
          source: SOURCE,
          transaction: { ...TRANSACTION, addressLookupTableAddresses: [] },
        }),
      ).rejects.toThrow(`Solana RPC getLatestBlockhash failed: ${message}`);
    });

    it('throws on a non-OK HTTP response', async () => {
      fetchMock.mockResolvedValue({ ok: false, status: 503 });

      await expect(
        compileSolanaTransaction({
          messenger,
          source: SOURCE,
          transaction: { ...TRANSACTION, addressLookupTableAddresses: [] },
        }),
      ).rejects.toThrow('Solana RPC getLatestBlockhash failed: 503');
    });

    it('throws if the compiled transaction exceeds the size limit', async () => {
      await expect(
        compileSolanaTransaction({
          messenger,
          source: SOURCE,
          transaction: {
            addressLookupTableAddresses: [],
            instructions: [
              { ...TRANSACTION.instructions[0], data: 'ab'.repeat(1300) },
            ],
          },
        }),
      ).rejects.toThrow(SolanaTransactionTooLargeError);
    });
  });

  describe('computeSolanaFeeRaw', () => {
    it('sums the Snap base and priority fees in lamports', async () => {
      snapHandleRequestMock.mockResolvedValue([
        { asset: { amount: '0.000005' }, type: 'base' },
        { asset: { amount: '0.0000001' }, type: 'priority' },
      ]);

      expect(await computeSolanaFeeRaw(messenger, SOURCE, 'base64')).toBe(
        '5100',
      );
      expect(snapHandleRequestMock).toHaveBeenCalledWith({
        handler: 'onClientRequest',
        origin: 'metamask',
        request: {
          id: expect.any(String),
          jsonrpc: '2.0',
          method: 'computeFee',
          params: {
            accountId: SOURCE.accountId,
            scope: SCOPE,
            transaction: 'base64',
          },
        },
        snapId: SNAP_ID,
      });
    });
  });

  describe('getSolanaRentReserveRaw', () => {
    it('reads the rent-exempt minimum through the Snap protocol handler', async () => {
      snapHandleRequestMock.mockResolvedValue(890880);

      expect(await getSolanaRentReserveRaw(messenger, SOURCE)).toBe('890880');
      expect(snapHandleRequestMock).toHaveBeenCalledWith(
        expect.objectContaining({
          handler: 'onProtocolRequest',
          request: expect.objectContaining({
            params: {
              request: expect.objectContaining({
                method: 'getMinimumBalanceForRentExemption',
              }),
              scope: SCOPE,
            },
          }),
          snapId: SNAP_ID,
        }),
      );
    });
  });

  describe('signAndSendSolanaTransaction', () => {
    it('sends one signAndSendTransaction request and returns the signature', async () => {
      snapHandleRequestMock.mockResolvedValue({ transactionId: SIGNATURE });

      expect(
        await signAndSendSolanaTransaction(messenger, SOURCE, 'base64'),
      ).toBe(SIGNATURE);
      expect(snapHandleRequestMock).toHaveBeenCalledTimes(1);
      expect(snapHandleRequestMock).toHaveBeenCalledWith({
        handler: 'onClientRequest',
        origin: 'metamask',
        request: {
          id: expect.any(String),
          jsonrpc: '2.0',
          method: 'signAndSendTransaction',
          params: {
            accountId: SOURCE.accountId,
            scope: SCOPE,
            transaction: 'base64',
          },
        },
        snapId: SNAP_ID,
      });
    });

    it.each([[undefined], [{}], [{ transactionId: '' }]])(
      'throws if the response %o has no signature',
      async (response) => {
        snapHandleRequestMock.mockResolvedValue(response);

        await expect(
          signAndSendSolanaTransaction(messenger, SOURCE, 'base64'),
        ).rejects.toThrow('Solana transaction signature missing');
      },
    );
  });

  describe('waitForSolanaTransactionConfirmed', () => {
    /**
     * Wait for the test signature with a zero polling interval.
     *
     * @returns The wait promise.
     */
    function wait(): Promise<void> {
      return waitForSolanaTransactionConfirmed({
        lastValidBlockHeight: 100,
        messenger,
        pollingInterval: 0,
        scope: SCOPE,
        signature: SIGNATURE,
      });
    }

    it.each(['confirmed', 'finalized'])(
      'resolves once the transaction is %s',
      async (confirmationStatus) => {
        mockRpc({
          getBlockHeight: { result: 100 },
          getSignatureStatuses: [
            { result: { value: [null] } },
            { result: { value: [getSignatureStatus(null, 'processed')] } },
            {
              result: {
                value: [getSignatureStatus(null, confirmationStatus)],
              },
            },
          ],
        });

        expect(await wait()).toBeUndefined();
        expect(fetchMock).toHaveBeenCalledTimes(4);
        expect(fetchMock).toHaveBeenCalledWith(RPC_URL, {
          body: JSON.stringify({
            id: 1,
            jsonrpc: '2.0',
            method: 'getSignatureStatuses',
            params: [[SIGNATURE], { searchTransactionHistory: true }],
          }),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
        });
      },
    );

    it('throws if the transaction failed', async () => {
      mockRpc({
        getSignatureStatuses: {
          result: {
            value: [getSignatureStatus({ InstructionError: [0, 'Custom'] })],
          },
        },
      });

      await expect(wait()).rejects.toThrow(
        'Solana transaction failed: {"InstructionError":[0,"Custom"]}',
      );
    });

    it('throws if the transaction expired without landing', async () => {
      mockRpc({
        getBlockHeight: { result: 101 },
        getSignatureStatuses: { result: { value: [null] } },
      });

      await expect(wait()).rejects.toThrow('Solana transaction expired');
    });
  });
});
