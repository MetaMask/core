import type { CaipChainId } from '@metamask/utils';
import { getBase64Encoder } from '@solana/codecs-strings';
import { getCompiledTransactionMessageDecoder } from '@solana/transaction-messages';
import { getTransactionDecoder } from '@solana/transactions';

import { getMessengerMock } from '../../tests/messenger-mock.js';
import {
  compileRelaySolanaTransaction,
  computeSolanaFeeRaw,
  getAccountSnapId,
  getSolanaRentReserveRaw,
  getSolanaSourceFailure,
  signAndSendSolanaTransaction,
} from './solana-transaction.js';
import type { RelaySolanaTransaction } from './types.js';

const SCOPE = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp' as CaipChainId;
const PAYER = '7Ec4QeG8wF3RnTjHDrTuYP8hVV7WYuPFyM4hZUodkG6Z';
const RECEIVER = 'HZaWndaNWHFDd9Dhk5PQcJmR4aLQv3Y5nVf2gQmMEz2x';
const LOOKUP_TABLE = '4QwSwNriKPrz8DLW4ju5uxC2TN5cksJx6tPUPj7DGLAW';
const UNRESOLVED_LOOKUP_TABLE = '5n2ADjHPsqB4EVUNEX48xRqtnmuLu5XSHDwkJRR98qpM';
const BLOCKHASH = 'EkSnNWid2cvwEVnVx9aBqawnmiCNiDgp3gUdkDPTKN1N';
const RPC_URL = 'https://solana.rpc.test';
const SNAP_ID = 'npm:@metamask/solana-wallet-snap';

const RELAY_TRANSACTION: RelaySolanaTransaction = {
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

describe('solana-transaction', () => {
  const {
    getAccountsControllerStateMock,
    getNetworkConfigByCaip2ChainIdMock,
    messenger,
    snapHandleRequestMock,
  } = getMessengerMock();

  let fetchMock: jest.SpyInstance;

  function mockRpc(results: Record<string, unknown>): void {
    fetchMock.mockImplementation(async (_url: string, init: RequestInit) => {
      const { method } = JSON.parse(init.body as string) as { method: string };
      return {
        ok: true,
        json: async (): Promise<unknown> => results[method],
      };
    });
  }

  beforeEach(() => {
    jest.resetAllMocks();
    fetchMock = jest.spyOn(global, 'fetch');

    getNetworkConfigByCaip2ChainIdMock.mockReturnValue({
      rpcProviders: { default: { url: RPC_URL } },
    });

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

  describe('compileRelaySolanaTransaction', () => {
    it('compiles an unsigned v0 transaction with the user as fee payer', async () => {
      const result = await compileRelaySolanaTransaction({
        messenger,
        payer: PAYER,
        scope: SCOPE,
        transaction: RELAY_TRANSACTION,
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

    it('reads the RPC URL from ConfigRegistryController and resolves lookup tables, skipping unresolved ones', async () => {
      const result = await compileRelaySolanaTransaction({
        messenger,
        payer: PAYER,
        scope: SCOPE,
        transaction: RELAY_TRANSACTION,
      });

      const message = getCompiledTransactionMessageDecoder().decode(
        getTransactionDecoder().decode(
          getBase64Encoder().encode(result.transaction),
        ).messageBytes,
      );

      expect(getNetworkConfigByCaip2ChainIdMock).toHaveBeenCalledWith(SCOPE);
      expect(fetchMock).toHaveBeenCalledWith(
        RPC_URL,
        expect.objectContaining({
          body: expect.stringContaining('"encoding":"jsonParsed"'),
        }),
      );
      expect(message).toHaveProperty('addressTableLookups', [
        {
          lookupTableAddress: LOOKUP_TABLE,
          readonlyIndexes: [],
          writableIndexes: [0],
        },
      ]);
      expect(message.staticAccounts).not.toContain(RECEIVER);
    });

    it('skips the lookup table read when the payload has none', async () => {
      await compileRelaySolanaTransaction({
        messenger,
        payer: PAYER,
        scope: SCOPE,
        transaction: {
          instructions: RELAY_TRANSACTION.instructions,
        },
      });

      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('compiles an instruction with empty data', async () => {
      const result = await compileRelaySolanaTransaction({
        messenger,
        payer: PAYER,
        scope: SCOPE,
        transaction: {
          instructions: [{ ...RELAY_TRANSACTION.instructions[0], data: '' }],
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
        const result = await compileRelaySolanaTransaction({
          messenger,
          payer: PAYER,
          scope: SCOPE,
          transaction: {
            instructions: [
              {
                ...RELAY_TRANSACTION.instructions[0],
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

    it('throws if no RPC URL is configured for the scope', async () => {
      getNetworkConfigByCaip2ChainIdMock.mockReturnValue(undefined);

      await expect(
        compileRelaySolanaTransaction({
          messenger,
          payer: PAYER,
          scope: SCOPE,
          transaction: RELAY_TRANSACTION,
        }),
      ).rejects.toThrow(`Solana RPC URL not found for ${SCOPE}`);
    });

    it('throws on a JSON-RPC error', async () => {
      mockRpc({
        getLatestBlockhash: { error: { message: 'rate limited' } },
        getMultipleAccounts: { result: { value: [] } },
      });

      await expect(
        compileRelaySolanaTransaction({
          messenger,
          payer: PAYER,
          scope: SCOPE,
          transaction: RELAY_TRANSACTION,
        }),
      ).rejects.toThrow('Solana RPC getLatestBlockhash failed: rate limited');
    });

    it('throws on a missing JSON-RPC result', async () => {
      mockRpc({
        getLatestBlockhash: {},
        getMultipleAccounts: { result: { value: [] } },
      });

      await expect(
        compileRelaySolanaTransaction({
          messenger,
          payer: PAYER,
          scope: SCOPE,
          transaction: RELAY_TRANSACTION,
        }),
      ).rejects.toThrow('Solana RPC getLatestBlockhash failed: missing result');
    });

    it('throws on a non-OK HTTP response', async () => {
      fetchMock.mockResolvedValue({ ok: false, status: 503 });

      await expect(
        compileRelaySolanaTransaction({
          messenger,
          payer: PAYER,
          scope: SCOPE,
          transaction: { instructions: RELAY_TRANSACTION.instructions },
        }),
      ).rejects.toThrow('Solana RPC getLatestBlockhash failed: 503');
    });

    it('throws if the compiled transaction exceeds the size limit', async () => {
      await expect(
        compileRelaySolanaTransaction({
          messenger,
          payer: PAYER,
          scope: SCOPE,
          transaction: {
            instructions: [
              {
                ...RELAY_TRANSACTION.instructions[0],
                data: 'ab'.repeat(1300),
              },
            ],
          },
        }),
      ).rejects.toThrow('Solana transaction exceeds the size limit');
    });
  });

  describe('getSolanaSourceFailure', () => {
    const SIGNATURE = 'signature';

    /**
     * Builds an RPC signature status, whose wire field `err` is a restricted
     * identifier.
     *
     * @param error - Transaction error, or null if it succeeded.
     * @returns The signature status.
     */
    function getSignatureStatus(error: unknown): Record<string, unknown> {
      return Object.fromEntries([['err', error]]);
    }

    function mockSourceRpc(
      status: Record<string, unknown> | null,
      blockHeight = 100,
    ): void {
      mockRpc({
        getBlockHeight: { result: blockHeight },
        getSignatureStatuses: { result: { value: [status] } },
      });
    }

    it('returns undefined for a landed source transaction', async () => {
      mockSourceRpc(getSignatureStatus(null));

      expect(
        await getSolanaSourceFailure({
          lastValidBlockHeight: 50,
          messenger,
          scope: SCOPE,
          signature: SIGNATURE,
        }),
      ).toBeUndefined();
      expect(fetchMock).toHaveBeenCalledTimes(1);
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
    });

    it('returns the error of a failed source transaction', async () => {
      mockSourceRpc(getSignatureStatus({ InstructionError: [0, 'Custom'] }));

      expect(
        await getSolanaSourceFailure({
          lastValidBlockHeight: 200,
          messenger,
          scope: SCOPE,
          signature: SIGNATURE,
        }),
      ).toBe(
        'Solana source transaction failed: {"InstructionError":[0,"Custom"]}',
      );
    });

    it('returns expired for an unknown transaction past its last valid block height', async () => {
      mockSourceRpc(null, 101);

      expect(
        await getSolanaSourceFailure({
          lastValidBlockHeight: 100,
          messenger,
          scope: SCOPE,
          signature: SIGNATURE,
        }),
      ).toBe('Solana source transaction expired');
      expect(fetchMock).toHaveBeenLastCalledWith(
        RPC_URL,
        expect.objectContaining({
          body: JSON.stringify({
            id: 1,
            jsonrpc: '2.0',
            method: 'getBlockHeight',
            params: [{ commitment: 'finalized' }],
          }),
        }),
      );
    });

    it('returns undefined for an unknown transaction within its last valid block height', async () => {
      mockSourceRpc(null, 100);

      expect(
        await getSolanaSourceFailure({
          lastValidBlockHeight: 100,
          messenger,
          scope: SCOPE,
          signature: SIGNATURE,
        }),
      ).toBeUndefined();
    });

    it('returns undefined for an unknown transaction without a last valid block height', async () => {
      mockSourceRpc(null);

      expect(
        await getSolanaSourceFailure({
          messenger,
          scope: SCOPE,
          signature: SIGNATURE,
        }),
      ).toBeUndefined();
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('getAccountSnapId', () => {
    it('returns the Snap ID from the account metadata', () => {
      getAccountsControllerStateMock.mockReturnValue({
        internalAccounts: {
          accounts: {
            'wallet-account-uuid': { metadata: { snap: { id: SNAP_ID } } },
          },
        },
      });

      expect(getAccountSnapId(messenger, 'wallet-account-uuid')).toBe(SNAP_ID);
    });

    it('throws if the account has no Snap', () => {
      getAccountsControllerStateMock.mockReturnValue({
        internalAccounts: { accounts: {} },
      });

      expect(() => getAccountSnapId(messenger, 'missing')).toThrow(
        'Solana source account Snap not found',
      );
    });
  });

  describe('computeSolanaFeeRaw', () => {
    it('sums Snap computeFee base and priority fees in lamports', async () => {
      snapHandleRequestMock.mockResolvedValue([
        { type: 'base', asset: { amount: '0.000005' } },
        { type: 'priority', asset: { amount: '0.0000001' } },
      ]);

      const result = await computeSolanaFeeRaw({
        accountId: 'wallet-account-uuid',
        messenger,
        scope: SCOPE,
        snapId: SNAP_ID,
        transaction: 'base64-transaction',
      });

      expect(result).toBe('5100');
      expect(snapHandleRequestMock).toHaveBeenCalledWith({
        handler: 'onClientRequest',
        origin: 'metamask',
        request: {
          id: expect.any(String),
          jsonrpc: '2.0',
          method: 'computeFee',
          params: {
            accountId: 'wallet-account-uuid',
            scope: SCOPE,
            transaction: 'base64-transaction',
          },
        },
        snapId: SNAP_ID,
      });
    });
  });

  describe('getSolanaRentReserveRaw', () => {
    it('reads the rent-exempt minimum through the Snap protocol handler', async () => {
      snapHandleRequestMock.mockResolvedValue(890880);

      const result = await getSolanaRentReserveRaw({
        messenger,
        scope: SCOPE,
        snapId: SNAP_ID,
      });

      expect(result).toBe('890880');
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
        }),
      );
    });
  });

  describe('signAndSendSolanaTransaction', () => {
    it('sends one signAndSendTransaction client request to the account Snap', async () => {
      snapHandleRequestMock.mockResolvedValue({ transactionId: 'signature' });

      const result = await signAndSendSolanaTransaction({
        accountId: 'wallet-account-uuid',
        messenger,
        scope: SCOPE,
        snapId: SNAP_ID,
        transaction: 'base64-transaction',
      });

      expect(result).toStrictEqual({ transactionId: 'signature' });
      expect(snapHandleRequestMock).toHaveBeenCalledTimes(1);
      expect(snapHandleRequestMock).toHaveBeenCalledWith({
        handler: 'onClientRequest',
        origin: 'metamask',
        request: {
          id: expect.any(String),
          jsonrpc: '2.0',
          method: 'signAndSendTransaction',
          params: {
            accountId: 'wallet-account-uuid',
            scope: SCOPE,
            transaction: 'base64-transaction',
          },
        },
        snapId: SNAP_ID,
      });
    });
  });
});
