/* eslint-disable consistent-return */
import { v4 as uuid } from 'uuid';

import { ChainId } from '../../../bridge-controller/src/types';
import { BridgeStatusControllerMessenger } from '../types';
import { createClientTransactionRequest, handleNonEvmTx } from './snaps';

jest.mock('uuid', () => ({
  v4: jest.fn(),
}));

describe('Snaps Utils', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (uuid as jest.Mock).mockReturnValue('test-uuid-1234');
  });

  describe('handleNonEvmTx', () => {
    it.each([
      {
        snapResponse: {
          result: {
            signature: 'solanaSignature123',
          },
        },
        label: 'result.signature',
      },
      {
        snapResponse: {
          result: {
            txid: 'solanaSignature123',
          },
        },
        label: 'result.txid',
      },
      {
        snapResponse: {
          result: {
            hash: 'solanaSignature123',
          },
        },
        label: 'result.hash',
      },
      {
        snapResponse: {
          result: {
            txHash: 'solanaSignature123',
          },
        },
        label: 'result.txHash',
      },
      {
        snapResponse: {
          transactionId: 'solanaSignature123',
        },
        label: 'transactionId',
      },
    ])(
      'should submit a non-EVM transaction ({label})',
      async ({ snapResponse }) => {
        const snapId = 'test-snap-id';
        const transaction = 'base64-encoded-transaction';
        const accountId = 'test-account-id';

        const mockCall = jest.fn((...args: unknown[]) => {
          const [action] = args;
          if (action === 'SnapController:handleRequest') {
            return Promise.resolve(snapResponse);
          }
        });
        const messenger = {
          call: (...args: unknown[]) => mockCall(...args),
        } as unknown as BridgeStatusControllerMessenger;
        const { time, ...result } = await handleNonEvmTx(
          messenger,
          transaction,
          {
            quote: {
              srcChainId: ChainId.SOLANA,
              srcAsset: { symbol: 'SOL' },
              destAsset: { symbol: 'MATIC' },
            },
            sentAmount: {
              amount: '1000000000',
            },
          } as never,
          { id: accountId, metadata: { snap: { id: snapId } } } as never,
        );

        expect(mockCall.mock.calls).toMatchInlineSnapshot(`
                  [
                    [
                      "SnapController:handleRequest",
                      {
                        "handler": "onClientRequest",
                        "origin": "metamask",
                        "request": {
                          "id": "test-uuid-1234",
                          "jsonrpc": "2.0",
                          "method": "signAndSendTransaction",
                          "params": {
                            "accountId": "test-account-id",
                            "scope": "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
                            "transaction": "base64-encoded-transaction",
                          },
                        },
                        "snapId": "test-snap-id",
                      },
                    ],
                  ]
              `);
        expect(result).toMatchInlineSnapshot(`
                  {
                    "approvalTxId": undefined,
                    "chainId": "0x416edef1601be",
                    "destinationChainId": "0x1",
                    "destinationTokenAddress": undefined,
                    "destinationTokenAmount": undefined,
                    "destinationTokenDecimals": undefined,
                    "destinationTokenSymbol": "MATIC",
                    "hash": "solanaSignature123",
                    "id": "solanaSignature123",
                    "isBridgeTx": false,
                    "isSolana": true,
                    "networkClientId": "test-snap-id",
                    "origin": "test-snap-id",
                    "sourceTokenAddress": undefined,
                    "sourceTokenAmount": undefined,
                    "sourceTokenDecimals": undefined,
                    "sourceTokenSymbol": "SOL",
                    "status": "submitted",
                    "swapTokenValue": "1000000000",
                    "txParams": {
                      "data": "base64-encoded-transaction",
                      "from": undefined,
                    },
                    "type": "swap",
                  }
              `);
      },
    );

    it('should submit a non-EVM transaction (no result in response)', async () => {
      const snapId = 'test-snap-id';
      const transaction = 'base64-encoded-transaction';
      const accountId = 'test-account-id';

      const mockCall = jest.fn((...args: unknown[]) => {
        const [action] = args;
        if (action === 'SnapController:handleRequest') {
          return Promise.resolve(undefined);
        }
      });
      const messenger = {
        call: (...args: unknown[]) => mockCall(...args),
      } as unknown as BridgeStatusControllerMessenger;
      const { time, ...result } = await handleNonEvmTx(
        messenger,
        transaction,
        {
          quote: {
            srcChainId: ChainId.SOLANA,
            srcAsset: { symbol: 'SOL' },
            destAsset: { symbol: 'MATIC' },
          },
          sentAmount: {
            amount: '1000000000',
          },
        } as never,
        { id: accountId, metadata: { snap: { id: snapId } } } as never,
      );

      expect(mockCall.mock.calls).toMatchInlineSnapshot(`
        [
          [
            "SnapController:handleRequest",
            {
              "handler": "onClientRequest",
              "origin": "metamask",
              "request": {
                "id": "test-uuid-1234",
                "jsonrpc": "2.0",
                "method": "signAndSendTransaction",
                "params": {
                  "accountId": "test-account-id",
                  "scope": "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
                  "transaction": "base64-encoded-transaction",
                },
              },
              "snapId": "test-snap-id",
            },
          ],
        ]
      `);
      expect(result).toMatchInlineSnapshot(`
        {
          "approvalTxId": undefined,
          "chainId": "0x416edef1601be",
          "destinationChainId": "0x1",
          "destinationTokenAddress": undefined,
          "destinationTokenAmount": undefined,
          "destinationTokenDecimals": undefined,
          "destinationTokenSymbol": "MATIC",
          "hash": undefined,
          "id": "test-uuid-1234",
          "isBridgeTx": false,
          "isSolana": true,
          "networkClientId": "test-snap-id",
          "origin": "test-snap-id",
          "sourceTokenAddress": undefined,
          "sourceTokenAmount": undefined,
          "sourceTokenDecimals": undefined,
          "sourceTokenSymbol": "SOL",
          "status": "submitted",
          "swapTokenValue": "1000000000",
          "txParams": {
            "data": "base64-encoded-transaction",
            "from": undefined,
          },
          "type": "swap",
        }
      `);
    });
  });

  describe('createClientTransactionRequest', () => {
    it('should create a proper request without options', () => {
      const snapId = 'test-snap-id';
      const transaction = 'base64-encoded-transaction';
      const scope = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp' as const;
      const accountId = 'test-account-id';

      const result = createClientTransactionRequest(
        snapId,
        transaction,
        scope,
        accountId,
      );

      expect(result.snapId).toBe(snapId);
      expect(result.origin).toBe('metamask');
      expect(result.handler).toBe('onClientRequest');
      expect(result.request.id).toBe('test-uuid-1234');
      expect(result.request.jsonrpc).toBe('2.0');
      expect(result.request.method).toBe('signAndSendTransaction');
      expect(result.request.params.transaction).toBe(transaction);
      expect(result.request.params.scope).toBe(scope);
      expect(result.request.params.accountId).toBe(accountId);
      expect(result.request.params).not.toHaveProperty('options');
    });

    it('should create a proper request with options', () => {
      const snapId = 'test-snap-id';
      const transaction = 'base64-encoded-transaction';
      const scope = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp' as const;
      const accountId = 'test-account-id';
      const options = {
        skipPreflight: true,
        maxRetries: 3,
      };

      const result = createClientTransactionRequest(
        snapId,
        transaction,
        scope,
        accountId,
        options,
      );

      expect(result.snapId).toBe(snapId);
      expect(result.origin).toBe('metamask');
      expect(result.handler).toBe('onClientRequest');
      expect(result.request.id).toBe('test-uuid-1234');
      expect(result.request.jsonrpc).toBe('2.0');
      expect(result.request.method).toBe('signAndSendTransaction');
      expect(result.request.params.transaction).toBe(transaction);
      expect(result.request.params.scope).toBe(scope);
      expect(result.request.params.accountId).toBe(accountId);
      expect(result.request.params.options).toStrictEqual(options);
    });

    it('should handle different chain scopes', () => {
      const snapId = 'test-snap-id';
      const transaction = 'base64-encoded-transaction';
      const tronScope = 'tron:0x2b6653dc' as const;
      const accountId = 'test-account-id';

      const result = createClientTransactionRequest(
        snapId,
        transaction,
        tronScope,
        accountId,
      );

      expect(result.request.params.scope).toBe(tronScope);
    });

    it('should not include options key when options is undefined', () => {
      const snapId = 'test-snap-id';
      const transaction = 'base64-encoded-transaction';
      const scope = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp' as const;
      const accountId = 'test-account-id';

      const result = createClientTransactionRequest(
        snapId,
        transaction,
        scope,
        accountId,
        undefined,
      );

      expect(result.request.params).not.toHaveProperty('options');
    });

    it('should not include options key when options is null', () => {
      const snapId = 'test-snap-id';
      const transaction = 'base64-encoded-transaction';
      const scope = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp' as const;
      const accountId = 'test-account-id';

      const result = createClientTransactionRequest(
        snapId,
        transaction,
        scope,
        accountId,
        null as unknown as Record<string, unknown>,
      );

      expect(result.request.params).not.toHaveProperty('options');
    });

    it('should include options key when options is empty object', () => {
      const snapId = 'test-snap-id';
      const transaction = 'base64-encoded-transaction';
      const scope = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp' as const;
      const accountId = 'test-account-id';

      const result = createClientTransactionRequest(
        snapId,
        transaction,
        scope,
        accountId,
        {},
      );

      expect(result.request.params).toHaveProperty('options');
      expect(result.request.params.options).toStrictEqual({});
    });
  });
});
