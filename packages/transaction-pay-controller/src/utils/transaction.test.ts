import { Interface } from '@ethersproject/abi';
import { abiERC20 } from '@metamask/metamask-eth-abis';
import { NetworkClientType } from '@metamask/network-controller';
import {
  TransactionStatus,
  TransactionType,
} from '@metamask/transaction-controller';
import type { TransactionMeta } from '@metamask/transaction-controller';
import type { TransactionControllerState } from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';
import { noop } from 'lodash';

import { NATIVE_TOKEN_ADDRESS } from '../constants.js';
import { getMessengerMock } from '../tests/messenger-mock.js';
import type {
  TransactionData,
  TransactionPayControllerState,
  TransactionPayRequiredToken,
} from '../types.js';
import { parseRequiredTokens } from './required-tokens.js';
import {
  FINALIZED_STATUSES,
  collectTransactionIds,
  getTransaction,
  getTransferredAmountFromTxHash,
  subscribeAssetChanges,
  subscribeTransactionChanges,
  updateTransaction,
  waitForTransactionConfirmed,
} from './transaction.js';

jest.mock('./required-tokens');

const TRANSACTION_ID_MOCK = '123-456';
const ERROR_MESSAGE_MOCK = 'Test error';
const CHAIN_ID_MOCK = '0x1234' as Hex;
const FROM_MOCK = '0x123';

const TRANSACTION_META_MOCK = {
  id: TRANSACTION_ID_MOCK,
  txParams: {
    from: FROM_MOCK,
  },
} as TransactionMeta;

const TRANSCTION_TOKEN_REQUIRED_MOCK = {
  address: '0x456' as Hex,
  amountFiat: '2',
  amountUsd: '3',
  balanceFiat: '4',
  balanceUsd: '5',
} as TransactionPayRequiredToken;

describe('Transaction Utils', () => {
  const parseRequiredTokensMock = jest.mocked(parseRequiredTokens);
  const {
    messenger,
    getTransactionControllerStateMock,
    publish,
    updateTransactionMock,
  } = getMessengerMock();

  beforeEach(() => {
    jest.resetAllMocks();

    getTransactionControllerStateMock.mockReturnValue({
      transactions: [] as TransactionMeta[],
    } as TransactionControllerState);
  });

  describe('getTransaction', () => {
    it('returns transaction', () => {
      getTransactionControllerStateMock.mockReturnValue({
        transactions: [TRANSACTION_META_MOCK],
      } as TransactionControllerState);

      const result = getTransaction(TRANSACTION_ID_MOCK, messenger);
      expect(result).toBe(TRANSACTION_META_MOCK);
    });

    it('returns undefined if transaction not found', () => {
      getTransactionControllerStateMock.mockReturnValue({
        transactions: [] as TransactionMeta[],
      } as TransactionControllerState);

      const result = getTransaction(TRANSACTION_ID_MOCK, messenger);
      expect(result).toBeUndefined();
    });
  });

  describe('subscribeTransactionChanges', () => {
    it('updates state for new transactions', () => {
      const updateTransactionDataMock = jest.fn();

      parseRequiredTokensMock.mockReturnValue([TRANSCTION_TOKEN_REQUIRED_MOCK]);

      subscribeTransactionChanges(messenger, updateTransactionDataMock, noop);

      publish(
        'TransactionController:stateChange',
        {
          transactions: [TRANSACTION_META_MOCK],
        } as TransactionControllerState,
        [],
      );

      expect(updateTransactionDataMock).toHaveBeenCalledTimes(1);

      const transactionData = {} as TransactionData;
      updateTransactionDataMock.mock.calls[0][1](transactionData);

      expect(transactionData.tokens).toStrictEqual([
        TRANSCTION_TOKEN_REQUIRED_MOCK,
      ]);
    });

    it('updates state for updated transactions', () => {
      const updateTransactionDataMock = jest.fn();

      parseRequiredTokensMock.mockReturnValue([TRANSCTION_TOKEN_REQUIRED_MOCK]);

      subscribeTransactionChanges(messenger, updateTransactionDataMock, noop);

      publish(
        'TransactionController:stateChange',
        {
          transactions: [TRANSACTION_META_MOCK],
        } as TransactionControllerState,
        [],
      );

      publish(
        'TransactionController:stateChange',
        {
          transactions: [
            { ...TRANSACTION_META_MOCK, txParams: { data: '0x1' } },
          ],
        } as TransactionControllerState,
        [],
      );

      expect(updateTransactionDataMock).toHaveBeenCalledTimes(2);
    });

    it('updates state when txParams.to changes', () => {
      const updateTransactionDataMock = jest.fn();

      parseRequiredTokensMock.mockReturnValue([TRANSCTION_TOKEN_REQUIRED_MOCK]);

      subscribeTransactionChanges(messenger, updateTransactionDataMock, noop);

      publish(
        'TransactionController:stateChange',
        {
          transactions: [TRANSACTION_META_MOCK],
        } as TransactionControllerState,
        [],
      );

      publish(
        'TransactionController:stateChange',
        {
          transactions: [
            {
              ...TRANSACTION_META_MOCK,
              txParams: {
                ...TRANSACTION_META_MOCK.txParams,
                to: '0xnewrecipient' as Hex,
              },
            },
          ],
        } as TransactionControllerState,
        [],
      );

      expect(updateTransactionDataMock).toHaveBeenCalledTimes(2);
    });

    it('updates state when requiredAssets changes', () => {
      const updateTransactionDataMock = jest.fn();

      parseRequiredTokensMock.mockReturnValue([TRANSCTION_TOKEN_REQUIRED_MOCK]);

      subscribeTransactionChanges(messenger, updateTransactionDataMock, noop);

      publish(
        'TransactionController:stateChange',
        {
          transactions: [TRANSACTION_META_MOCK],
        } as TransactionControllerState,
        [],
      );

      publish(
        'TransactionController:stateChange',
        {
          transactions: [
            {
              ...TRANSACTION_META_MOCK,
              requiredAssets: [
                { address: '0xtoken' as Hex, chainId: '0x1' as Hex },
              ],
            },
          ],
        } as TransactionControllerState,
        [],
      );

      expect(updateTransactionDataMock).toHaveBeenCalledTimes(2);
    });

    it('does not update state when txParams.data, txParams.to, and requiredAssets are unchanged', () => {
      const updateTransactionDataMock = jest.fn();

      subscribeTransactionChanges(messenger, updateTransactionDataMock, noop);

      publish(
        'TransactionController:stateChange',
        {
          transactions: [TRANSACTION_META_MOCK],
        } as TransactionControllerState,
        [],
      );

      publish(
        'TransactionController:stateChange',
        {
          transactions: [
            {
              ...TRANSACTION_META_MOCK,
              status: TransactionStatus.submitted,
            },
          ],
        } as TransactionControllerState,
        [],
      );

      // Only the initial new-transaction event triggers the update
      expect(updateTransactionDataMock).toHaveBeenCalledTimes(1);
    });

    it.each(FINALIZED_STATUSES)(
      'removes state if transaction status is %s',
      (status) => {
        const removeTransactionDataMock = jest.fn();

        subscribeTransactionChanges(messenger, noop, removeTransactionDataMock);

        publish(
          'TransactionController:stateChange',
          {
            transactions: [TRANSACTION_META_MOCK],
          } as TransactionControllerState,
          [],
        );

        publish(
          'TransactionController:stateChange',
          {
            transactions: [{ ...TRANSACTION_META_MOCK, status }],
          } as TransactionControllerState,
          [],
        );

        expect(removeTransactionDataMock).toHaveBeenCalledWith(
          TRANSACTION_ID_MOCK,
        );
      },
    );

    it('removes state if transaction is deleted', () => {
      const removeTransactionDataMock = jest.fn();

      subscribeTransactionChanges(messenger, noop, removeTransactionDataMock);

      publish(
        'TransactionController:stateChange',
        {
          transactions: [TRANSACTION_META_MOCK],
        } as TransactionControllerState,
        [],
      );

      publish(
        'TransactionController:stateChange',
        {
          transactions: [] as TransactionMeta[],
        } as TransactionControllerState,
        [],
      );

      expect(removeTransactionDataMock).toHaveBeenCalledWith(
        TRANSACTION_ID_MOCK,
      );
    });
  });

  describe('subscribeAssetChanges', () => {
    function buildState(
      data: Partial<TransactionData> & {
        tokens: TransactionPayRequiredToken[];
      } = { tokens: [] },
    ): TransactionPayControllerState {
      return {
        transactionData: {
          [TRANSACTION_ID_MOCK]: {
            isLoading: false,
            ...data,
          } as TransactionData,
        },
      };
    }

    let isolatedMessenger: ReturnType<typeof getMessengerMock>['messenger'];
    let isolatedPublish: ReturnType<typeof getMessengerMock>['publish'];
    let isolatedGetTransactionControllerStateMock: ReturnType<
      typeof getMessengerMock
    >['getTransactionControllerStateMock'];

    beforeEach(() => {
      const fresh = getMessengerMock();
      isolatedMessenger = fresh.messenger;
      isolatedPublish = fresh.publish;
      isolatedGetTransactionControllerStateMock =
        fresh.getTransactionControllerStateMock;
      isolatedGetTransactionControllerStateMock.mockReturnValue({
        transactions: [] as TransactionMeta[],
      } as TransactionControllerState);
    });

    it('re-parses required tokens for transactions with empty tokens when token rates change', () => {
      const updateTransactionDataMock = jest.fn();

      parseRequiredTokensMock.mockReturnValue([TRANSCTION_TOKEN_REQUIRED_MOCK]);
      isolatedGetTransactionControllerStateMock.mockReturnValue({
        transactions: [TRANSACTION_META_MOCK],
      } as TransactionControllerState);

      subscribeAssetChanges(
        isolatedMessenger,
        () => buildState({ tokens: [] }),
        updateTransactionDataMock,
      );

      isolatedPublish('TokenRatesController:stateChange', {} as never, []);

      expect(updateTransactionDataMock).toHaveBeenCalledTimes(1);
      const transactionData = {} as TransactionData;
      updateTransactionDataMock.mock.calls[0][1](transactionData);
      expect(transactionData.tokens).toStrictEqual([
        TRANSCTION_TOKEN_REQUIRED_MOCK,
      ]);
    });

    it('re-parses required tokens when currency rates change', () => {
      const updateTransactionDataMock = jest.fn();

      parseRequiredTokensMock.mockReturnValue([TRANSCTION_TOKEN_REQUIRED_MOCK]);
      isolatedGetTransactionControllerStateMock.mockReturnValue({
        transactions: [TRANSACTION_META_MOCK],
      } as TransactionControllerState);

      subscribeAssetChanges(
        isolatedMessenger,
        () => buildState({ tokens: [] }),
        updateTransactionDataMock,
      );

      isolatedPublish('CurrencyRateController:stateChange', {} as never, []);

      expect(updateTransactionDataMock).toHaveBeenCalledTimes(1);
    });

    it('re-parses required tokens when token state changes', () => {
      const updateTransactionDataMock = jest.fn();

      parseRequiredTokensMock.mockReturnValue([TRANSCTION_TOKEN_REQUIRED_MOCK]);
      isolatedGetTransactionControllerStateMock.mockReturnValue({
        transactions: [TRANSACTION_META_MOCK],
      } as TransactionControllerState);

      subscribeAssetChanges(
        isolatedMessenger,
        () => buildState({ tokens: [] }),
        updateTransactionDataMock,
      );

      isolatedPublish('TokensController:stateChange', {} as never, []);

      expect(updateTransactionDataMock).toHaveBeenCalledTimes(1);
    });

    it('subscribes to AssetsController state changes', () => {
      const updateTransactionDataMock = jest.fn();

      parseRequiredTokensMock.mockReturnValue([TRANSCTION_TOKEN_REQUIRED_MOCK]);
      isolatedGetTransactionControllerStateMock.mockReturnValue({
        transactions: [TRANSACTION_META_MOCK],
      } as TransactionControllerState);

      subscribeAssetChanges(
        isolatedMessenger,
        () => buildState({ tokens: [] }),
        updateTransactionDataMock,
      );

      isolatedPublish('AssetsController:stateChange', {} as never, []);

      expect(updateTransactionDataMock).toHaveBeenCalledTimes(1);
    });

    it('subscribes to all per-source events in addition to AssetsController', () => {
      const updateTransactionDataMock = jest.fn();

      parseRequiredTokensMock.mockReturnValue([TRANSCTION_TOKEN_REQUIRED_MOCK]);
      isolatedGetTransactionControllerStateMock.mockReturnValue({
        transactions: [TRANSACTION_META_MOCK],
      } as TransactionControllerState);

      subscribeAssetChanges(
        isolatedMessenger,
        () => buildState({ tokens: [] }),
        updateTransactionDataMock,
      );

      isolatedPublish('TokensController:stateChange', {} as never, []);
      isolatedPublish('TokenRatesController:stateChange', {} as never, []);
      isolatedPublish('CurrencyRateController:stateChange', {} as never, []);

      expect(updateTransactionDataMock).toHaveBeenCalledTimes(3);
    });

    it('skips transactions whose tokens are already populated', () => {
      const updateTransactionDataMock = jest.fn();

      isolatedGetTransactionControllerStateMock.mockReturnValue({
        transactions: [TRANSACTION_META_MOCK],
      } as TransactionControllerState);

      subscribeAssetChanges(
        isolatedMessenger,
        () =>
          buildState({
            tokens: [TRANSCTION_TOKEN_REQUIRED_MOCK],
          }),
        updateTransactionDataMock,
      );

      isolatedPublish('TokenRatesController:stateChange', {} as never, []);

      expect(updateTransactionDataMock).not.toHaveBeenCalled();
      expect(parseRequiredTokensMock).not.toHaveBeenCalled();
    });

    it.each(FINALIZED_STATUSES)(
      'skips transactions whose status is %s',
      (status) => {
        const updateTransactionDataMock = jest.fn();

        isolatedGetTransactionControllerStateMock.mockReturnValue({
          transactions: [{ ...TRANSACTION_META_MOCK, status }],
        } as TransactionControllerState);

        subscribeAssetChanges(
          isolatedMessenger,
          () => buildState({ tokens: [] }),
          updateTransactionDataMock,
        );

        isolatedPublish('TokenRatesController:stateChange', {} as never, []);

        expect(updateTransactionDataMock).not.toHaveBeenCalled();
      },
    );

    it('skips transactions that no longer exist in TransactionController state', () => {
      const updateTransactionDataMock = jest.fn();

      isolatedGetTransactionControllerStateMock.mockReturnValue({
        transactions: [] as TransactionMeta[],
      } as TransactionControllerState);

      subscribeAssetChanges(
        isolatedMessenger,
        () => buildState({ tokens: [] }),
        updateTransactionDataMock,
      );

      isolatedPublish('TokenRatesController:stateChange', {} as never, []);

      expect(updateTransactionDataMock).not.toHaveBeenCalled();
    });
  });

  describe('updateTransaction', () => {
    it('updates transaction', () => {
      getTransactionControllerStateMock.mockReturnValue({
        transactions: [TRANSACTION_META_MOCK],
      } as TransactionControllerState);

      updateTransaction(
        {
          transactionId: TRANSACTION_ID_MOCK,
          messenger: messenger as never,
          note: 'Test note',
        },
        (draft) => {
          draft.txParams.from = '0x456';
        },
      );

      expect(updateTransactionMock).toHaveBeenCalledWith(
        expect.objectContaining({
          id: TRANSACTION_ID_MOCK,
          txParams: expect.objectContaining({
            from: '0x456',
          }),
        }),
        'Test note',
      );
    });

    it('throws if transaction not found', () => {
      getTransactionControllerStateMock.mockReturnValue({
        transactions: [] as TransactionMeta[],
      } as TransactionControllerState);

      expect(() =>
        updateTransaction(
          {
            transactionId: TRANSACTION_ID_MOCK,
            messenger: messenger as never,
            note: 'Test note',
          },
          noop,
        ),
      ).toThrow(`Transaction not found: ${TRANSACTION_ID_MOCK}`);
    });
  });

  describe('waitForTransactionConfirmed', () => {
    it('resolves when transaction is confirmed', async () => {
      const promise = waitForTransactionConfirmed(
        TRANSACTION_ID_MOCK,
        messenger as never,
      );

      publish(
        'TransactionController:stateChange',
        {
          transactions: [
            { ...TRANSACTION_META_MOCK, status: TransactionStatus.confirmed },
          ],
        } as TransactionControllerState,
        [],
      );

      expect(await promise).toBeUndefined();
    });

    it('rejects when transaction fails', async () => {
      const promise = waitForTransactionConfirmed(
        TRANSACTION_ID_MOCK,
        messenger as never,
      );

      publish(
        'TransactionController:stateChange',
        {
          transactions: [
            {
              ...TRANSACTION_META_MOCK,
              error: {
                message: ERROR_MESSAGE_MOCK,
              },
              status: TransactionStatus.failed,
              type: TransactionType.bridge,
            },
          ],
        } as TransactionControllerState,
        [],
      );

      await expect(promise).rejects.toThrow(
        `Transaction failed - ${TransactionType.bridge} - ${ERROR_MESSAGE_MOCK}`,
      );
    });

    it('resolves if already confirmed', async () => {
      getTransactionControllerStateMock.mockReturnValue({
        transactions: [
          { ...TRANSACTION_META_MOCK, status: TransactionStatus.confirmed },
        ],
      } as TransactionControllerState);

      const result = await waitForTransactionConfirmed(
        TRANSACTION_ID_MOCK,
        messenger as never,
      );

      expect(result).toBeUndefined();
    });

    it('rejects if already failed', async () => {
      getTransactionControllerStateMock.mockReturnValue({
        transactions: [
          {
            ...TRANSACTION_META_MOCK,
            error: {
              message: ERROR_MESSAGE_MOCK,
            },
            status: TransactionStatus.failed,
            type: TransactionType.bridge,
          },
        ],
      } as TransactionControllerState);

      await expect(
        waitForTransactionConfirmed(TRANSACTION_ID_MOCK, messenger as never),
      ).rejects.toThrow(
        `Transaction failed - ${TransactionType.bridge} - ${ERROR_MESSAGE_MOCK}`,
      );
    });
  });

  describe('collectTransactionIds', () => {
    it('collects transaction IDs from unapproved events matching from and chain ID', () => {
      const mockCallback = jest.fn();

      collectTransactionIds(CHAIN_ID_MOCK, FROM_MOCK, messenger, mockCallback);

      publish('TransactionController:unapprovedTransactionAdded', {
        id: 'tx1',
        chainId: CHAIN_ID_MOCK,
        txParams: { from: FROM_MOCK },
      } as TransactionMeta);

      publish('TransactionController:unapprovedTransactionAdded', {
        id: 'tx2',
        chainId: '0x1' as Hex,
        txParams: { from: FROM_MOCK },
      } as TransactionMeta);

      publish('TransactionController:unapprovedTransactionAdded', {
        id: 'tx3',
        chainId: CHAIN_ID_MOCK,
        txParams: { from: '0xabc' },
      } as TransactionMeta);

      publish('TransactionController:unapprovedTransactionAdded', {
        id: 'tx4',
        chainId: CHAIN_ID_MOCK,
        txParams: { from: FROM_MOCK },
      } as TransactionMeta);

      expect(mockCallback).toHaveBeenCalledTimes(2);
      expect(mockCallback).toHaveBeenNthCalledWith(1, 'tx1');
      expect(mockCallback).toHaveBeenNthCalledWith(2, 'tx4');
    });

    it('stops collecting transaction IDs after end is called', () => {
      const mockCallback = jest.fn();

      const { end } = collectTransactionIds(
        CHAIN_ID_MOCK,
        FROM_MOCK,
        messenger,
        mockCallback,
      );

      publish('TransactionController:unapprovedTransactionAdded', {
        id: 'tx1',
        chainId: CHAIN_ID_MOCK,
        txParams: { from: FROM_MOCK },
      } as TransactionMeta);

      end();

      publish('TransactionController:unapprovedTransactionAdded', {
        id: 'tx2',
        chainId: CHAIN_ID_MOCK,
        txParams: { from: FROM_MOCK },
      } as TransactionMeta);

      expect(mockCallback).toHaveBeenCalledTimes(1);
      expect(mockCallback).toHaveBeenCalledWith('tx1');
    });
  });
});

const TX_HASH_MOCK = '0xabc123';
const WALLET_ADDRESS_RECEIPT_MOCK =
  '0x1111111111111111111111111111111111111111' as Hex;
const ERC20_ADDRESS_RECEIPT_MOCK =
  '0x2222222222222222222222222222222222222222' as Hex;
const CHAIN_ID_RECEIPT_MOCK = '0x1' as Hex;
const NETWORK_CLIENT_ID_RECEIPT_MOCK = 'net-client-1';
const PROVIDER_RECEIPT_MOCK = { request: jest.fn() };

const TRANSFER_EVENT_TOPIC =
  '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

const erc20Interface = new Interface(abiERC20);

function paddedAddress(address: Hex): string {
  return `0x000000000000000000000000${address.slice(2).toLowerCase()}`;
}

function encodeTransferLog(
  to: Hex,
  amount: string,
): {
  address: string;
  topics: string[];
  data: string;
} {
  const encoded = erc20Interface.encodeEventLog(
    erc20Interface.getEvent('Transfer'),
    [WALLET_ADDRESS_RECEIPT_MOCK, to, amount],
  );

  return {
    address: ERC20_ADDRESS_RECEIPT_MOCK,
    topics: encoded.topics,
    data: encoded.data,
  };
}

describe('getTransferredAmountFromTxHash', () => {
  const {
    messenger: receiptMessenger,
    findNetworkClientIdByChainIdMock: receiptFindNetworkMock,
    getNetworkClientByIdMock: receiptGetNetworkMock,
  } = getMessengerMock();

  beforeEach(() => {
    jest.resetAllMocks();

    receiptFindNetworkMock.mockReturnValue(NETWORK_CLIENT_ID_RECEIPT_MOCK);
    receiptGetNetworkMock.mockReturnValue({
      configuration: {
        chainId: CHAIN_ID_RECEIPT_MOCK,
        type: NetworkClientType.Custom,
      },
      provider: PROVIDER_RECEIPT_MOCK,
    } as never);
  });

  describe('native token', () => {
    it('returns amount from debug_traceTransaction for direct transfer', async () => {
      PROVIDER_RECEIPT_MOCK.request.mockResolvedValue({
        to: WALLET_ADDRESS_RECEIPT_MOCK.toLowerCase(),
        value: '0xde0b6b3a7640000',
        calls: [],
      });

      const result = await getTransferredAmountFromTxHash({
        messenger: receiptMessenger,
        txHash: TX_HASH_MOCK,
        chainId: CHAIN_ID_RECEIPT_MOCK,
        tokenAddress: NATIVE_TOKEN_ADDRESS,
        walletAddress: WALLET_ADDRESS_RECEIPT_MOCK,
      });

      expect(result.amountRaw).toBe('1000000000000000000');
      expect(result.blockNumber).toBeUndefined();
      expect(PROVIDER_RECEIPT_MOCK.request).toHaveBeenCalledWith({
        method: 'debug_traceTransaction',
        params: [TX_HASH_MOCK, { tracer: 'callTracer' }],
      });
    });

    it('sums native value from nested internal calls', async () => {
      PROVIDER_RECEIPT_MOCK.request.mockResolvedValue({
        to: '0xcontract',
        value: '0x0',
        calls: [
          {
            to: WALLET_ADDRESS_RECEIPT_MOCK.toLowerCase(),
            value: '0xde0b6b3a7640000',
            calls: [],
          },
          {
            to: '0xother',
            value: '0x1',
            calls: [
              {
                to: WALLET_ADDRESS_RECEIPT_MOCK.toLowerCase(),
                value: '0xde0b6b3a7640000',
              },
            ],
          },
        ],
      });

      const result = await getTransferredAmountFromTxHash({
        messenger: receiptMessenger,
        txHash: TX_HASH_MOCK,
        chainId: CHAIN_ID_RECEIPT_MOCK,
        tokenAddress: NATIVE_TOKEN_ADDRESS,
        walletAddress: WALLET_ADDRESS_RECEIPT_MOCK,
      });

      expect(result.amountRaw).toBe('2000000000000000000');
    });

    it('falls back to tx.value when debug_traceTransaction is unsupported', async () => {
      PROVIDER_RECEIPT_MOCK.request.mockImplementation(
        ({ method }: { method: string }) => {
          if (method === 'debug_traceTransaction') {
            return Promise.reject(new Error('Method not found'));
          }
          return Promise.resolve({
            to: WALLET_ADDRESS_RECEIPT_MOCK.toLowerCase(),
            value: '0x14d1120d7b160000',
          });
        },
      );

      const result = await getTransferredAmountFromTxHash({
        messenger: receiptMessenger,
        txHash: TX_HASH_MOCK,
        chainId: CHAIN_ID_RECEIPT_MOCK,
        tokenAddress: NATIVE_TOKEN_ADDRESS,
        walletAddress: WALLET_ADDRESS_RECEIPT_MOCK,
      });

      expect(result.amountRaw).toBe('1500000000000000000');
    });

    it('returns undefined amountRaw when trace returns zero value and tx.to does not match wallet', async () => {
      PROVIDER_RECEIPT_MOCK.request.mockImplementation(
        ({ method }: { method: string }) => {
          if (method === 'debug_traceTransaction') {
            return Promise.resolve({ to: '0xcontract', value: '0x0' });
          }
          return Promise.resolve({
            to: '0xcontract',
            value: '0xde0b6b3a7640000',
          });
        },
      );

      const result = await getTransferredAmountFromTxHash({
        messenger: receiptMessenger,
        txHash: TX_HASH_MOCK,
        chainId: CHAIN_ID_RECEIPT_MOCK,
        tokenAddress: NATIVE_TOKEN_ADDRESS,
        walletAddress: WALLET_ADDRESS_RECEIPT_MOCK,
      });

      expect(result.amountRaw).toBeUndefined();
    });

    it('returns undefined amountRaw when trace is unsupported and transaction is not found', async () => {
      PROVIDER_RECEIPT_MOCK.request.mockImplementation(
        ({ method }: { method: string }) => {
          if (method === 'debug_traceTransaction') {
            return Promise.reject(new Error('Method not found'));
          }
          return Promise.resolve(null);
        },
      );

      const result = await getTransferredAmountFromTxHash({
        messenger: receiptMessenger,
        txHash: TX_HASH_MOCK,
        chainId: CHAIN_ID_RECEIPT_MOCK,
        tokenAddress: NATIVE_TOKEN_ADDRESS,
        walletAddress: WALLET_ADDRESS_RECEIPT_MOCK,
      });

      expect(result.amountRaw).toBeUndefined();
    });

    it('returns undefined amountRaw when trace is unsupported and native tx.value is zero', async () => {
      PROVIDER_RECEIPT_MOCK.request.mockImplementation(
        ({ method }: { method: string }) => {
          if (method === 'debug_traceTransaction') {
            return Promise.reject(new Error('Method not found'));
          }
          return Promise.resolve({
            to: WALLET_ADDRESS_RECEIPT_MOCK.toLowerCase(),
            value: '0x0',
          });
        },
      );

      const result = await getTransferredAmountFromTxHash({
        messenger: receiptMessenger,
        txHash: TX_HASH_MOCK,
        chainId: CHAIN_ID_RECEIPT_MOCK,
        tokenAddress: NATIVE_TOKEN_ADDRESS,
        walletAddress: WALLET_ADDRESS_RECEIPT_MOCK,
      });

      expect(result.amountRaw).toBeUndefined();
    });

    it('ignores trace value with 0x0', async () => {
      PROVIDER_RECEIPT_MOCK.request.mockImplementation(
        ({ method }: { method: string }) => {
          if (method === 'debug_traceTransaction') {
            return Promise.resolve({
              to: WALLET_ADDRESS_RECEIPT_MOCK.toLowerCase(),
              value: '0x0',
            });
          }
          return Promise.resolve({
            to: WALLET_ADDRESS_RECEIPT_MOCK.toLowerCase(),
            value: '0x1f4',
          });
        },
      );

      const result = await getTransferredAmountFromTxHash({
        messenger: receiptMessenger,
        txHash: TX_HASH_MOCK,
        chainId: CHAIN_ID_RECEIPT_MOCK,
        tokenAddress: NATIVE_TOKEN_ADDRESS,
        walletAddress: WALLET_ADDRESS_RECEIPT_MOCK,
      });

      expect(result.amountRaw).toBe('500');
    });
  });

  describe('ERC-20 token', () => {
    it('decodes transfer amount from receipt logs', async () => {
      PROVIDER_RECEIPT_MOCK.request.mockResolvedValue({
        blockNumber: '0x1a2b3c',
        logs: [encodeTransferLog(WALLET_ADDRESS_RECEIPT_MOCK, '5000000')],
      });

      const result = await getTransferredAmountFromTxHash({
        messenger: receiptMessenger,
        txHash: TX_HASH_MOCK,
        chainId: CHAIN_ID_RECEIPT_MOCK,
        tokenAddress: ERC20_ADDRESS_RECEIPT_MOCK,
        walletAddress: WALLET_ADDRESS_RECEIPT_MOCK,
      });

      expect(result.amountRaw).toBe('5000000');
      expect(result.blockNumber).toBe('0x1a2b3c');
    });

    it('sums multiple Transfer events to the same wallet', async () => {
      PROVIDER_RECEIPT_MOCK.request.mockResolvedValue({
        logs: [
          encodeTransferLog(WALLET_ADDRESS_RECEIPT_MOCK, '3000000'),
          encodeTransferLog(WALLET_ADDRESS_RECEIPT_MOCK, '2000000'),
        ],
      });

      const result = await getTransferredAmountFromTxHash({
        messenger: receiptMessenger,
        txHash: TX_HASH_MOCK,
        chainId: CHAIN_ID_RECEIPT_MOCK,
        tokenAddress: ERC20_ADDRESS_RECEIPT_MOCK,
        walletAddress: WALLET_ADDRESS_RECEIPT_MOCK,
      });

      expect(result.amountRaw).toBe('5000000');
    });

    it('ignores Transfer events to other addresses', async () => {
      const otherAddress = '0x3333333333333333333333333333333333333333' as Hex;
      PROVIDER_RECEIPT_MOCK.request.mockResolvedValue({
        logs: [
          encodeTransferLog(otherAddress, '9000000'),
          encodeTransferLog(WALLET_ADDRESS_RECEIPT_MOCK, '1000000'),
        ],
      });

      const result = await getTransferredAmountFromTxHash({
        messenger: receiptMessenger,
        txHash: TX_HASH_MOCK,
        chainId: CHAIN_ID_RECEIPT_MOCK,
        tokenAddress: ERC20_ADDRESS_RECEIPT_MOCK,
        walletAddress: WALLET_ADDRESS_RECEIPT_MOCK,
      });

      expect(result.amountRaw).toBe('1000000');
    });

    it('ignores logs from other token contracts', async () => {
      const otherToken = '0x4444444444444444444444444444444444444444' as Hex;
      const transferLog = encodeTransferLog(
        WALLET_ADDRESS_RECEIPT_MOCK,
        '5000000',
      );
      PROVIDER_RECEIPT_MOCK.request.mockResolvedValue({
        logs: [
          { ...transferLog, address: otherToken },
          encodeTransferLog(WALLET_ADDRESS_RECEIPT_MOCK, '1000000'),
        ],
      });

      const result = await getTransferredAmountFromTxHash({
        messenger: receiptMessenger,
        txHash: TX_HASH_MOCK,
        chainId: CHAIN_ID_RECEIPT_MOCK,
        tokenAddress: ERC20_ADDRESS_RECEIPT_MOCK,
        walletAddress: WALLET_ADDRESS_RECEIPT_MOCK,
      });

      expect(result.amountRaw).toBe('1000000');
    });

    it('ignores logs with non-Transfer event topics', async () => {
      PROVIDER_RECEIPT_MOCK.request.mockResolvedValue({
        logs: [
          {
            address: ERC20_ADDRESS_RECEIPT_MOCK,
            topics: [
              '0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925',
              paddedAddress(WALLET_ADDRESS_RECEIPT_MOCK),
              paddedAddress(WALLET_ADDRESS_RECEIPT_MOCK),
            ],
            data: '0x00000000000000000000000000000000000000000000000000000000006acfc0',
          },
          encodeTransferLog(WALLET_ADDRESS_RECEIPT_MOCK, '2000000'),
        ],
      });

      const result = await getTransferredAmountFromTxHash({
        messenger: receiptMessenger,
        txHash: TX_HASH_MOCK,
        chainId: CHAIN_ID_RECEIPT_MOCK,
        tokenAddress: ERC20_ADDRESS_RECEIPT_MOCK,
        walletAddress: WALLET_ADDRESS_RECEIPT_MOCK,
      });

      expect(result.amountRaw).toBe('2000000');
    });

    it('returns undefined amountRaw and blockNumber when receipt is not found', async () => {
      PROVIDER_RECEIPT_MOCK.request.mockResolvedValue(null);

      const result = await getTransferredAmountFromTxHash({
        messenger: receiptMessenger,
        txHash: TX_HASH_MOCK,
        chainId: CHAIN_ID_RECEIPT_MOCK,
        tokenAddress: ERC20_ADDRESS_RECEIPT_MOCK,
        walletAddress: WALLET_ADDRESS_RECEIPT_MOCK,
      });

      expect(result.amountRaw).toBeUndefined();
      expect(result.blockNumber).toBeUndefined();
    });

    it('returns undefined amountRaw when no matching Transfer logs exist', async () => {
      PROVIDER_RECEIPT_MOCK.request.mockResolvedValue({ logs: [] });

      const result = await getTransferredAmountFromTxHash({
        messenger: receiptMessenger,
        txHash: TX_HASH_MOCK,
        chainId: CHAIN_ID_RECEIPT_MOCK,
        tokenAddress: ERC20_ADDRESS_RECEIPT_MOCK,
        walletAddress: WALLET_ADDRESS_RECEIPT_MOCK,
      });

      expect(result.amountRaw).toBeUndefined();
    });

    it('skips malformed log entries gracefully', async () => {
      PROVIDER_RECEIPT_MOCK.request.mockResolvedValue({
        logs: [
          {
            address: ERC20_ADDRESS_RECEIPT_MOCK,
            topics: [TRANSFER_EVENT_TOPIC],
            data: '0xBADDATA',
          },
          encodeTransferLog(WALLET_ADDRESS_RECEIPT_MOCK, '4000000'),
        ],
      });

      const result = await getTransferredAmountFromTxHash({
        messenger: receiptMessenger,
        txHash: TX_HASH_MOCK,
        chainId: CHAIN_ID_RECEIPT_MOCK,
        tokenAddress: ERC20_ADDRESS_RECEIPT_MOCK,
        walletAddress: WALLET_ADDRESS_RECEIPT_MOCK,
      });

      expect(result.amountRaw).toBe('4000000');
    });

    it('returns undefined amountRaw when all Transfer amounts are zero', async () => {
      PROVIDER_RECEIPT_MOCK.request.mockResolvedValue({
        logs: [encodeTransferLog(WALLET_ADDRESS_RECEIPT_MOCK, '0')],
      });

      const result = await getTransferredAmountFromTxHash({
        messenger: receiptMessenger,
        txHash: TX_HASH_MOCK,
        chainId: CHAIN_ID_RECEIPT_MOCK,
        tokenAddress: ERC20_ADDRESS_RECEIPT_MOCK,
        walletAddress: WALLET_ADDRESS_RECEIPT_MOCK,
      });

      expect(result.amountRaw).toBeUndefined();
    });
  });

  it('propagates provider errors for ERC-20', async () => {
    PROVIDER_RECEIPT_MOCK.request.mockRejectedValue(new Error('RPC error'));

    await expect(
      getTransferredAmountFromTxHash({
        messenger: receiptMessenger,
        txHash: TX_HASH_MOCK,
        chainId: CHAIN_ID_RECEIPT_MOCK,
        tokenAddress: ERC20_ADDRESS_RECEIPT_MOCK,
        walletAddress: WALLET_ADDRESS_RECEIPT_MOCK,
      }),
    ).rejects.toThrow('RPC 0x1 Custom eth_getTransactionReceipt: RPC error');
  });

  it('propagates provider errors for native when both trace and getTransaction fail', async () => {
    PROVIDER_RECEIPT_MOCK.request
      .mockRejectedValueOnce(new Error('RPC error'))
      .mockRejectedValueOnce(new Error('RPC error'));

    await expect(
      getTransferredAmountFromTxHash({
        messenger: receiptMessenger,
        txHash: TX_HASH_MOCK,
        chainId: CHAIN_ID_RECEIPT_MOCK,
        tokenAddress: NATIVE_TOKEN_ADDRESS,
        walletAddress: WALLET_ADDRESS_RECEIPT_MOCK,
      }),
    ).rejects.toThrow('RPC 0x1 Custom eth_getTransactionByHash: RPC error');
  });
});
