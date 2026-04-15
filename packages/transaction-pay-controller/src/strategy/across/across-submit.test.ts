import { successfulFetch, toHex } from '@metamask/controller-utils';
import {
  TransactionStatus,
  TransactionType,
} from '@metamask/transaction-controller';
import type {
  TransactionControllerState,
  TransactionMeta,
} from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';

import { getDefaultRemoteFeatureFlagControllerState } from '../../../../remote-feature-flag-controller/src/remote-feature-flag-controller';
import { TransactionPayStrategy } from '../../constants';
import { getMessengerMock } from '../../tests/messenger-mock';
import type { TransactionPayQuote } from '../../types';
import { submitAcrossQuotes } from './across-submit';
import * as acrossTransactions from './transactions';
import type { AcrossQuote } from './types';

jest.mock('@metamask/controller-utils', () => ({
  ...jest.requireActual('@metamask/controller-utils'),
  successfulFetch: jest.fn(),
}));

const FROM_MOCK = '0x1234567890123456789012345678901234567891' as Hex;

const TRANSACTION_META_MOCK = {
  id: 'tx-1',
  type: TransactionType.perpsDeposit,
  txParams: {
    from: FROM_MOCK,
  },
} as TransactionMeta;

const QUOTE_MOCK: TransactionPayQuote<AcrossQuote> = {
  dust: { usd: '0', fiat: '0' },
  estimatedDuration: 0,
  fees: {
    provider: { usd: '0', fiat: '0' },
    sourceNetwork: {
      estimate: { usd: '0', fiat: '0', human: '0', raw: '0' },
      max: { usd: '0', fiat: '0', human: '0', raw: '0' },
    },
    targetNetwork: { usd: '0', fiat: '0' },
  },
  original: {
    metamask: {
      gasLimits: [
        { estimate: 21000, max: 21000 },
        { estimate: 22000, max: 22000 },
      ],
      is7702: false,
    },
    quote: {
      approvalTxns: [
        {
          chainId: 1,
          to: '0xapprove' as Hex,
          data: '0xdeadbeef' as Hex,
        },
      ],
      inputToken: {
        address: '0xabc' as Hex,
        chainId: 1,
        decimals: 18,
      },
      outputToken: {
        address: '0xdef' as Hex,
        chainId: 2,
        decimals: 6,
      },
      swapTx: {
        chainId: 1,
        to: '0xswap' as Hex,
        data: '0xfeed' as Hex,
        maxFeePerGas: '0x100',
        maxPriorityFeePerGas: '0x10',
      },
    },
    request: {
      amount: '100',
      tradeType: 'exactOutput',
    },
  },
  request: {
    from: FROM_MOCK,
    sourceBalanceRaw: '100',
    sourceChainId: '0x1',
    sourceTokenAddress: '0xabc' as Hex,
    sourceTokenAmount: '100',
    targetAmountMinimum: '100',
    targetChainId: '0x2',
    targetTokenAddress: '0xdef' as Hex,
  },
  sourceAmount: { usd: '0', fiat: '0', human: '0', raw: '0' },
  targetAmount: { usd: '0', fiat: '0', human: '0', raw: '0' },
  strategy: TransactionPayStrategy.Across,
};

describe('Across Submit', () => {
  const successfulFetchMock = jest.mocked(successfulFetch);

  const {
    addTransactionBatchMock,
    addTransactionMock,
    estimateGasMock,
    findNetworkClientIdByChainIdMock,
    getRemoteFeatureFlagControllerStateMock,
    getTransactionControllerStateMock,
    messenger,
    publish,
    updateTransactionMock,
  } = getMessengerMock();

  beforeEach(() => {
    jest.resetAllMocks();

    getRemoteFeatureFlagControllerStateMock.mockReturnValue({
      ...getDefaultRemoteFeatureFlagControllerState(),
      remoteFeatureFlags: {
        confirmations_pay: {
          gasBuffer: {
            default: 1.0,
          },
        },
      },
    });

    estimateGasMock.mockResolvedValue({
      gas: '0x5208',
      simulationFails: undefined,
    });
    findNetworkClientIdByChainIdMock.mockReturnValue('networkClientId');
    getTransactionControllerStateMock.mockReturnValue({
      transactions: [TRANSACTION_META_MOCK],
    } as TransactionControllerState);
    addTransactionMock.mockResolvedValue({
      result: Promise.resolve('0xhash'),
      transactionMeta: TRANSACTION_META_MOCK,
    });
    successfulFetchMock.mockResolvedValue({
      json: async () => ({ status: 'pending' }),
    } as Response);
  });

  describe('submitAcrossQuotes', () => {
    const setupConfirmedSubmission = (): void => {
      const confirmedTransaction = {
        id: 'new-tx',
        chainId: '0x1',
        networkClientId: 'mainnet',
        time: Date.now(),
        status: TransactionStatus.confirmed,
        hash: '0xconfirmed',
        txParams: {
          from: FROM_MOCK,
        },
      } as unknown as TransactionMeta;

      getTransactionControllerStateMock.mockReturnValue({
        transactions: [TRANSACTION_META_MOCK, confirmedTransaction],
      } as TransactionControllerState);

      addTransactionMock.mockImplementation(async () => {
        publish('TransactionController:unapprovedTransactionAdded', {
          id: confirmedTransaction.id,
          chainId: confirmedTransaction.chainId,
          txParams: confirmedTransaction.txParams,
        } as TransactionMeta);

        return {
          result: Promise.resolve('0xhash'),
          transactionMeta: TRANSACTION_META_MOCK,
        };
      });
    };

    const buildDepositQuote = (): TransactionPayQuote<AcrossQuote> =>
      ({
        ...QUOTE_MOCK,
        original: {
          ...QUOTE_MOCK.original,
          quote: {
            ...QUOTE_MOCK.original.quote,
            approvalTxns: [],
            id: 'deposit-id',
          },
        },
      }) as TransactionPayQuote<AcrossQuote>;

    it('submits a batch when approvals exist', async () => {
      await submitAcrossQuotes({
        messenger,
        quotes: [QUOTE_MOCK],
        transaction: TRANSACTION_META_MOCK,
        isSmartTransaction: jest.fn(),
      });

      expect(addTransactionBatchMock).toHaveBeenCalledTimes(1);
      expect(addTransactionBatchMock).toHaveBeenCalledWith(
        expect.objectContaining({
          transactions: [
            expect.objectContaining({
              type: TransactionType.tokenMethodApprove,
            }),
            expect.objectContaining({
              type: TransactionType.perpsAcrossDeposit,
            }),
          ],
        }),
      );
    });

    it('submits a 7702 batch when the quote contains a combined batch gas limit', async () => {
      const batchGasQuote = {
        ...QUOTE_MOCK,
        original: {
          ...QUOTE_MOCK.original,
          metamask: {
            gasLimits: [
              {
                estimate: 43000,
                max: 64000,
              },
            ],
            is7702: true,
          },
        },
      } as unknown as TransactionPayQuote<AcrossQuote>;

      await submitAcrossQuotes({
        messenger,
        quotes: [batchGasQuote],
        transaction: TRANSACTION_META_MOCK,
        isSmartTransaction: jest.fn(),
      });

      expect(addTransactionBatchMock).toHaveBeenCalledWith(
        expect.objectContaining({
          disable7702: false,
          disableHook: true,
          disableSequential: true,
          gasLimit7702: toHex(64000),
          transactions: [
            expect.objectContaining({
              params: expect.not.objectContaining({
                gas: expect.anything(),
              }),
              type: TransactionType.tokenMethodApprove,
            }),
            expect.objectContaining({
              params: expect.not.objectContaining({
                gas: expect.anything(),
              }),
              type: TransactionType.perpsAcrossDeposit,
            }),
          ],
        }),
      );
    });

    it('submits a single transaction when no approvals', async () => {
      const noApprovalQuote = {
        ...QUOTE_MOCK,
        original: {
          ...QUOTE_MOCK.original,
          quote: {
            ...QUOTE_MOCK.original.quote,
            approvalTxns: [],
          },
        },
      } as TransactionPayQuote<AcrossQuote>;

      await submitAcrossQuotes({
        messenger,
        quotes: [noApprovalQuote],
        transaction: TRANSACTION_META_MOCK,
        isSmartTransaction: jest.fn(),
      });

      expect(addTransactionMock).toHaveBeenCalledTimes(1);
      expect(addTransactionMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          type: TransactionType.perpsAcrossDeposit,
        }),
      );
    });

    it('throws when the combined 7702 batch gas limit is missing', async () => {
      const missingBatchGasQuote = {
        ...QUOTE_MOCK,
        original: {
          ...QUOTE_MOCK.original,
          metamask: {
            gasLimits: [],
            is7702: true,
          },
        },
      } as TransactionPayQuote<AcrossQuote>;

      await expect(
        submitAcrossQuotes({
          messenger,
          quotes: [missingBatchGasQuote],
          transaction: TRANSACTION_META_MOCK,
          isSmartTransaction: jest.fn(),
        }),
      ).rejects.toThrow('Missing quote gas limit for Across 7702 batch');

      expect(addTransactionBatchMock).not.toHaveBeenCalled();
    });

    it('uses predict deposit type when transaction is predict deposit', async () => {
      const noApprovalQuote = {
        ...QUOTE_MOCK,
        original: {
          ...QUOTE_MOCK.original,
          quote: {
            ...QUOTE_MOCK.original.quote,
            approvalTxns: [],
          },
        },
      } as TransactionPayQuote<AcrossQuote>;

      await submitAcrossQuotes({
        messenger,
        quotes: [noApprovalQuote],
        transaction: {
          ...TRANSACTION_META_MOCK,
          type: TransactionType.predictDeposit,
        },
        isSmartTransaction: jest.fn(),
      });

      expect(addTransactionMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          type: TransactionType.predictAcrossDeposit,
        }),
      );
    });

    it('preserves transaction type when not perps or predict', async () => {
      const noApprovalQuote = {
        ...QUOTE_MOCK,
        original: {
          ...QUOTE_MOCK.original,
          quote: {
            ...QUOTE_MOCK.original.quote,
            approvalTxns: [],
          },
        },
      } as TransactionPayQuote<AcrossQuote>;

      await submitAcrossQuotes({
        messenger,
        quotes: [noApprovalQuote],
        transaction: {
          ...TRANSACTION_META_MOCK,
          type: TransactionType.swap,
        },
        isSmartTransaction: jest.fn(),
      });

      expect(addTransactionMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          type: TransactionType.swap,
        }),
      );
    });

    it('defaults to perps across deposit when transaction type is undefined', async () => {
      const noApprovalQuote = {
        ...QUOTE_MOCK,
        original: {
          ...QUOTE_MOCK.original,
          quote: {
            ...QUOTE_MOCK.original.quote,
            approvalTxns: [],
          },
        },
      } as TransactionPayQuote<AcrossQuote>;

      await submitAcrossQuotes({
        messenger,
        quotes: [noApprovalQuote],
        transaction: {
          ...TRANSACTION_META_MOCK,
          type: undefined,
        },
        isSmartTransaction: jest.fn(),
      });

      expect(addTransactionMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          type: TransactionType.perpsAcrossDeposit,
        }),
      );
    });

    it('falls back to the Across deposit type when an ordered swap transaction has no explicit type', async () => {
      const orderedTransactionsSpy = jest.spyOn(
        acrossTransactions,
        'getAcrossOrderedTransactions',
      );
      const noApprovalQuote = {
        ...QUOTE_MOCK,
        original: {
          ...QUOTE_MOCK.original,
          quote: {
            ...QUOTE_MOCK.original.quote,
            approvalTxns: [],
          },
        },
      } as TransactionPayQuote<AcrossQuote>;

      orderedTransactionsSpy.mockReturnValueOnce([
        {
          ...QUOTE_MOCK.original.quote.swapTx,
          kind: 'swap',
          type: undefined,
        },
      ]);

      await submitAcrossQuotes({
        messenger,
        quotes: [noApprovalQuote],
        transaction: TRANSACTION_META_MOCK,
        isSmartTransaction: jest.fn(),
      });

      expect(addTransactionMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          type: TransactionType.perpsAcrossDeposit,
        }),
      );

      orderedTransactionsSpy.mockRestore();
    });

    it('removes nonce from skipped transaction', async () => {
      const noApprovalQuote = {
        ...QUOTE_MOCK,
        original: {
          ...QUOTE_MOCK.original,
          quote: {
            ...QUOTE_MOCK.original.quote,
            approvalTxns: [],
          },
        },
      } as TransactionPayQuote<AcrossQuote>;

      await submitAcrossQuotes({
        messenger,
        quotes: [noApprovalQuote],
        transaction: TRANSACTION_META_MOCK,
        isSmartTransaction: jest.fn(),
      });

      expect(updateTransactionMock).toHaveBeenCalledWith(
        expect.anything(),
        'Remove nonce from skipped transaction',
      );
    });

    it('collects transaction IDs and adds to required transactions', async () => {
      const confirmedTransaction = {
        id: 'new-tx',
        chainId: '0x1',
        networkClientId: 'mainnet',
        time: Date.now(),
        status: TransactionStatus.confirmed,
        hash: '0xconfirmed',
        txParams: {
          from: FROM_MOCK,
        },
      } as unknown as TransactionMeta;

      getTransactionControllerStateMock.mockReturnValue({
        transactions: [TRANSACTION_META_MOCK, confirmedTransaction],
      } as TransactionControllerState);

      addTransactionMock.mockImplementation(async () => {
        publish('TransactionController:unapprovedTransactionAdded', {
          id: confirmedTransaction.id,
          chainId: confirmedTransaction.chainId,
          txParams: confirmedTransaction.txParams,
        } as TransactionMeta);

        return {
          result: Promise.resolve('0xhash'),
          transactionMeta: TRANSACTION_META_MOCK,
        };
      });

      const noApprovalQuote = {
        ...QUOTE_MOCK,
        original: {
          ...QUOTE_MOCK.original,
          quote: {
            ...QUOTE_MOCK.original.quote,
            approvalTxns: [],
          },
        },
      } as TransactionPayQuote<AcrossQuote>;

      const result = await submitAcrossQuotes({
        messenger,
        quotes: [noApprovalQuote],
        transaction: TRANSACTION_META_MOCK,
        isSmartTransaction: jest.fn(),
      });

      expect(updateTransactionMock).toHaveBeenCalledWith(
        expect.anything(),
        'Add required transaction ID from Across submission',
      );
      expect(result.transactionHash).toBe('0xconfirmed');
    });

    it('marks intent as complete after submission', async () => {
      const confirmedTransaction = {
        id: 'new-tx',
        chainId: '0x1',
        networkClientId: 'mainnet',
        time: Date.now(),
        status: TransactionStatus.confirmed,
        hash: '0xconfirmed',
        txParams: {
          from: FROM_MOCK,
        },
      } as unknown as TransactionMeta;

      getTransactionControllerStateMock.mockReturnValue({
        transactions: [TRANSACTION_META_MOCK, confirmedTransaction],
      } as TransactionControllerState);

      addTransactionMock.mockImplementation(async () => {
        publish('TransactionController:unapprovedTransactionAdded', {
          id: confirmedTransaction.id,
          chainId: confirmedTransaction.chainId,
          txParams: confirmedTransaction.txParams,
        } as TransactionMeta);

        return {
          result: Promise.resolve('0xhash'),
          transactionMeta: TRANSACTION_META_MOCK,
        };
      });

      const noApprovalQuote = {
        ...QUOTE_MOCK,
        original: {
          ...QUOTE_MOCK.original,
          quote: {
            ...QUOTE_MOCK.original.quote,
            approvalTxns: [],
          },
        },
      } as TransactionPayQuote<AcrossQuote>;

      await submitAcrossQuotes({
        messenger,
        quotes: [noApprovalQuote],
        transaction: TRANSACTION_META_MOCK,
        isSmartTransaction: jest.fn(),
      });

      expect(updateTransactionMock).toHaveBeenCalledWith(
        expect.anything(),
        'Intent complete after Across submission',
      );
    });

    it('polls Across status endpoint when quote includes a deposit id', async () => {
      const confirmedTransaction = {
        id: 'new-tx',
        chainId: '0x1',
        networkClientId: 'mainnet',
        time: Date.now(),
        status: TransactionStatus.confirmed,
        hash: '0xconfirmed',
        txParams: {
          from: FROM_MOCK,
        },
      } as unknown as TransactionMeta;

      getTransactionControllerStateMock.mockReturnValue({
        transactions: [TRANSACTION_META_MOCK, confirmedTransaction],
      } as TransactionControllerState);

      addTransactionMock.mockImplementation(async () => {
        publish('TransactionController:unapprovedTransactionAdded', {
          id: confirmedTransaction.id,
          chainId: confirmedTransaction.chainId,
          txParams: confirmedTransaction.txParams,
        } as TransactionMeta);

        return {
          result: Promise.resolve('0xhash'),
          transactionMeta: TRANSACTION_META_MOCK,
        };
      });

      successfulFetchMock.mockResolvedValueOnce({
        json: async () => ({
          destinationTxHash: '0xtarget',
          status: 'success',
        }),
      } as Response);

      const noApprovalQuote = {
        ...QUOTE_MOCK,
        original: {
          ...QUOTE_MOCK.original,
          quote: {
            ...QUOTE_MOCK.original.quote,
            approvalTxns: [],
            id: 'deposit-id',
          },
        },
      } as TransactionPayQuote<AcrossQuote>;

      const result = await submitAcrossQuotes({
        messenger,
        quotes: [noApprovalQuote],
        transaction: TRANSACTION_META_MOCK,
        isSmartTransaction: jest.fn(),
      });

      expect(successfulFetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/deposit/status?'),
        expect.objectContaining({ method: 'GET' }),
      );
      expect(result.transactionHash).toBe('0xtarget');
    });

    it('throws when Across status endpoint reports failure', async () => {
      const confirmedTransaction = {
        id: 'new-tx',
        chainId: '0x1',
        networkClientId: 'mainnet',
        time: Date.now(),
        status: TransactionStatus.confirmed,
        hash: '0xconfirmed',
        txParams: {
          from: FROM_MOCK,
        },
      } as unknown as TransactionMeta;

      getTransactionControllerStateMock.mockReturnValue({
        transactions: [TRANSACTION_META_MOCK, confirmedTransaction],
      } as TransactionControllerState);

      addTransactionMock.mockImplementation(async () => {
        publish('TransactionController:unapprovedTransactionAdded', {
          id: confirmedTransaction.id,
          chainId: confirmedTransaction.chainId,
          txParams: confirmedTransaction.txParams,
        } as TransactionMeta);

        return {
          result: Promise.resolve('0xhash'),
          transactionMeta: TRANSACTION_META_MOCK,
        };
      });

      successfulFetchMock.mockResolvedValueOnce({
        json: async () => ({
          status: 'failed',
        }),
      } as Response);

      const noApprovalQuote = {
        ...QUOTE_MOCK,
        original: {
          ...QUOTE_MOCK.original,
          quote: {
            ...QUOTE_MOCK.original.quote,
            approvalTxns: [],
            id: 'deposit-id',
          },
        },
      } as TransactionPayQuote<AcrossQuote>;

      await expect(
        submitAcrossQuotes({
          messenger,
          quotes: [noApprovalQuote],
          transaction: TRANSACTION_META_MOCK,
          isSmartTransaction: jest.fn(),
        }),
      ).rejects.toThrow('Across request failed with status: failed');
    });

    it('continues polling when Across status request fails transiently', async () => {
      jest.useFakeTimers();

      try {
        setupConfirmedSubmission();
        successfulFetchMock
          .mockRejectedValueOnce(new Error('Network error'))
          .mockResolvedValueOnce({
            json: async () => ({
              destinationTxHash: '0xtarget',
              status: 'success',
            }),
          } as Response);

        const resultPromise = submitAcrossQuotes({
          messenger,
          quotes: [buildDepositQuote()],
          transaction: TRANSACTION_META_MOCK,
          isSmartTransaction: jest.fn(),
        });

        await jest.runAllTimersAsync();
        const result = await resultPromise;

        expect(result.transactionHash).toBe('0xtarget');
        expect(successfulFetchMock).toHaveBeenCalledTimes(2);
      } finally {
        jest.useRealTimers();
      }
    });

    it('returns fill tx hash when destination hash is missing', async () => {
      setupConfirmedSubmission();
      successfulFetchMock.mockResolvedValueOnce({
        json: async () => ({
          fillTxHash: '0xfill',
          status: 'filled',
        }),
      } as Response);

      const result = await submitAcrossQuotes({
        messenger,
        quotes: [buildDepositQuote()],
        transaction: TRANSACTION_META_MOCK,
        isSmartTransaction: jest.fn(),
      });

      expect(result.transactionHash).toBe('0xfill');
    });

    it('returns tx hash when destination and fill hashes are missing', async () => {
      setupConfirmedSubmission();
      successfulFetchMock.mockResolvedValueOnce({
        json: async () => ({
          status: 'success',
          txHash: '0xbridge',
        }),
      } as Response);

      const result = await submitAcrossQuotes({
        messenger,
        quotes: [buildDepositQuote()],
        transaction: TRANSACTION_META_MOCK,
        isSmartTransaction: jest.fn(),
      });

      expect(result.transactionHash).toBe('0xbridge');
    });

    it('falls back to source transaction hash when success has no destination hash fields', async () => {
      setupConfirmedSubmission();
      successfulFetchMock.mockResolvedValueOnce({
        json: async () => ({
          status: 'completed',
        }),
      } as Response);

      const result = await submitAcrossQuotes({
        messenger,
        quotes: [buildDepositQuote()],
        transaction: TRANSACTION_META_MOCK,
        isSmartTransaction: jest.fn(),
      });

      expect(result.transactionHash).toBe('0xconfirmed');
    });

    it('keeps polling pending status until success is returned', async () => {
      jest.useFakeTimers();

      try {
        setupConfirmedSubmission();
        const pendingAttempts = 25;
        for (let attempt = 0; attempt < pendingAttempts; attempt++) {
          successfulFetchMock.mockResolvedValueOnce({
            json: async () => ({
              status: 'pending',
            }),
          } as Response);
        }

        successfulFetchMock.mockResolvedValueOnce({
          json: async () => ({
            status: 'success',
          }),
        } as Response);

        const resultPromise = submitAcrossQuotes({
          messenger,
          quotes: [buildDepositQuote()],
          transaction: TRANSACTION_META_MOCK,
          isSmartTransaction: jest.fn(),
        });

        await jest.runAllTimersAsync();
        const result = await resultPromise;

        expect(result.transactionHash).toBe('0xconfirmed');
        expect(successfulFetchMock).toHaveBeenCalledTimes(pendingAttempts + 1);
      } finally {
        jest.useRealTimers();
      }
    });

    it('keeps retrying failed status requests until success is returned', async () => {
      jest.useFakeTimers();

      try {
        setupConfirmedSubmission();
        const failureAttempts = 25;
        for (let attempt = 0; attempt < failureAttempts; attempt++) {
          successfulFetchMock.mockRejectedValueOnce(new Error('Network error'));
        }

        successfulFetchMock.mockResolvedValueOnce({
          json: async () => ({
            destinationTxHash: '0xtarget',
            status: 'success',
          }),
        } as Response);

        const resultPromise = submitAcrossQuotes({
          messenger,
          quotes: [buildDepositQuote()],
          transaction: TRANSACTION_META_MOCK,
          isSmartTransaction: jest.fn(),
        });

        await jest.runAllTimersAsync();
        const result = await resultPromise;

        expect(result.transactionHash).toBe('0xtarget');
        expect(successfulFetchMock).toHaveBeenCalledTimes(failureAttempts + 1);
      } finally {
        jest.useRealTimers();
      }
    });

    it('reuses max gas limits from quote when available', async () => {
      const noApprovalQuote = {
        ...QUOTE_MOCK,
        original: {
          ...QUOTE_MOCK.original,
          metamask: {
            gasLimits: [{ estimate: 22000, max: 33000 }],
          },
          quote: {
            ...QUOTE_MOCK.original.quote,
            approvalTxns: [],
          },
        },
      } as TransactionPayQuote<AcrossQuote>;

      await submitAcrossQuotes({
        messenger,
        quotes: [noApprovalQuote],
        transaction: TRANSACTION_META_MOCK,
        isSmartTransaction: jest.fn(),
      });

      const params = addTransactionMock.mock.calls[0][0] as { gas: Hex };

      expect(params.gas).toBe(toHex(33000));
      expect(estimateGasMock).not.toHaveBeenCalled();
    });

    it('throws when swap quote gas limit is missing', async () => {
      const missingSwapGasQuote = {
        ...QUOTE_MOCK,
        original: {
          ...QUOTE_MOCK.original,
          metamask: {
            gasLimits: [],
          },
          quote: {
            ...QUOTE_MOCK.original.quote,
            approvalTxns: [],
          },
        },
      } as unknown as TransactionPayQuote<AcrossQuote>;

      await expect(
        submitAcrossQuotes({
          messenger,
          quotes: [missingSwapGasQuote],
          transaction: TRANSACTION_META_MOCK,
          isSmartTransaction: jest.fn(),
        }),
      ).rejects.toThrow('Missing quote gas limit for Across swap transaction');

      expect(addTransactionMock).not.toHaveBeenCalled();
    });

    it('throws when approval quote gas limit is missing', async () => {
      const missingApprovalGasQuote = {
        ...QUOTE_MOCK,
        original: {
          ...QUOTE_MOCK.original,
          metamask: {
            gasLimits: [],
          },
        },
      } as TransactionPayQuote<AcrossQuote>;

      await expect(
        submitAcrossQuotes({
          messenger,
          quotes: [missingApprovalGasQuote],
          transaction: TRANSACTION_META_MOCK,
          isSmartTransaction: jest.fn(),
        }),
      ).rejects.toThrow(
        'Missing quote gas limit for Across approval transaction at index 0',
      );

      expect(addTransactionMock).not.toHaveBeenCalled();
      expect(addTransactionBatchMock).not.toHaveBeenCalled();
    });

    it('includes maxFeePerGas and maxPriorityFeePerGas in swap transaction', async () => {
      const noApprovalQuote = {
        ...QUOTE_MOCK,
        original: {
          ...QUOTE_MOCK.original,
          quote: {
            ...QUOTE_MOCK.original.quote,
            approvalTxns: [],
          },
        },
      } as TransactionPayQuote<AcrossQuote>;

      await submitAcrossQuotes({
        messenger,
        quotes: [noApprovalQuote],
        transaction: TRANSACTION_META_MOCK,
        isSmartTransaction: jest.fn(),
      });

      const params = addTransactionMock.mock.calls[0][0] as {
        maxFeePerGas: Hex;
        maxPriorityFeePerGas: Hex;
      };

      expect(params.maxFeePerGas).toBe('0x100');
      expect(params.maxPriorityFeePerGas).toBe('0x10');
    });

    it('converts decimal gas price strings to hex for swap transaction', async () => {
      const decimalGasQuote = {
        ...QUOTE_MOCK,
        original: {
          ...QUOTE_MOCK.original,
          quote: {
            ...QUOTE_MOCK.original.quote,
            approvalTxns: [],
            swapTx: {
              ...QUOTE_MOCK.original.quote.swapTx,
              maxFeePerGas: '256',
              maxPriorityFeePerGas: '16',
            },
          },
        },
      } as TransactionPayQuote<AcrossQuote>;

      await submitAcrossQuotes({
        messenger,
        quotes: [decimalGasQuote],
        transaction: TRANSACTION_META_MOCK,
        isSmartTransaction: jest.fn(),
      });

      const params = addTransactionMock.mock.calls[0][0] as {
        maxFeePerGas: Hex;
        maxPriorityFeePerGas: Hex;
      };

      expect(params.maxFeePerGas).toBe(toHex('256'));
      expect(params.maxPriorityFeePerGas).toBe(toHex('16'));
    });

    it('handles approval transactions without value', async () => {
      const quoteWithApproval = {
        ...QUOTE_MOCK,
        original: {
          ...QUOTE_MOCK.original,
          quote: {
            ...QUOTE_MOCK.original.quote,
            approvalTxns: [
              {
                chainId: 1,
                to: '0xapprove' as Hex,
                data: '0xdeadbeef' as Hex,
              },
            ],
          },
        },
      } as TransactionPayQuote<AcrossQuote>;

      await submitAcrossQuotes({
        messenger,
        quotes: [quoteWithApproval],
        transaction: TRANSACTION_META_MOCK,
        isSmartTransaction: jest.fn(),
      });

      expect(addTransactionBatchMock).toHaveBeenCalled();
    });

    it('handles swap transaction without value', async () => {
      const quoteWithoutValue = {
        ...QUOTE_MOCK,
        original: {
          ...QUOTE_MOCK.original,
          quote: {
            ...QUOTE_MOCK.original.quote,
            approvalTxns: [],
            swapTx: {
              chainId: QUOTE_MOCK.original.quote.swapTx.chainId,
              to: QUOTE_MOCK.original.quote.swapTx.to,
              data: QUOTE_MOCK.original.quote.swapTx.data,
              maxFeePerGas: QUOTE_MOCK.original.quote.swapTx.maxFeePerGas,
              maxPriorityFeePerGas:
                QUOTE_MOCK.original.quote.swapTx.maxPriorityFeePerGas,
              // value intentionally omitted to test the ?? '0x0' fallback
            },
          },
        },
      } as TransactionPayQuote<AcrossQuote>;

      await submitAcrossQuotes({
        messenger,
        quotes: [quoteWithoutValue],
        transaction: TRANSACTION_META_MOCK,
        isSmartTransaction: jest.fn(),
      });

      expect(addTransactionMock).toHaveBeenCalled();
      const params = addTransactionMock.mock.calls[0][0] as { value: Hex };
      expect(params.value).toBe('0x0');
    });

    it('processes multiple quotes sequentially', async () => {
      const quote1 = {
        ...QUOTE_MOCK,
        original: {
          ...QUOTE_MOCK.original,
          quote: {
            ...QUOTE_MOCK.original.quote,
            approvalTxns: [],
          },
        },
      } as TransactionPayQuote<AcrossQuote>;

      const quote2 = {
        ...QUOTE_MOCK,
        original: {
          ...QUOTE_MOCK.original,
          quote: {
            ...QUOTE_MOCK.original.quote,
            approvalTxns: [],
            swapTx: {
              ...QUOTE_MOCK.original.quote.swapTx,
              to: '0xswap2' as Hex,
            },
          },
        },
      } as TransactionPayQuote<AcrossQuote>;

      const confirmedTransaction = {
        id: 'new-tx',
        chainId: '0x1',
        networkClientId: 'mainnet',
        time: Date.now(),
        status: TransactionStatus.confirmed,
        hash: '0xconfirmed',
        txParams: {
          from: FROM_MOCK,
        },
      } as unknown as TransactionMeta;

      getTransactionControllerStateMock.mockReturnValue({
        transactions: [TRANSACTION_META_MOCK, confirmedTransaction],
      } as TransactionControllerState);

      addTransactionMock.mockImplementation(async () => {
        publish('TransactionController:unapprovedTransactionAdded', {
          id: confirmedTransaction.id,
          chainId: confirmedTransaction.chainId,
          txParams: confirmedTransaction.txParams,
        } as TransactionMeta);

        return {
          result: Promise.resolve('0xhash'),
          transactionMeta: TRANSACTION_META_MOCK,
        };
      });

      await submitAcrossQuotes({
        messenger,
        quotes: [quote1, quote2],
        transaction: TRANSACTION_META_MOCK,
        isSmartTransaction: jest.fn(),
      });

      expect(addTransactionMock).toHaveBeenCalledTimes(2);
    });

    it('unsubscribes transaction collector if submission throws', async () => {
      const unsubscribeSpy = jest.spyOn(messenger, 'unsubscribe');
      const noApprovalQuote = {
        ...QUOTE_MOCK,
        original: {
          ...QUOTE_MOCK.original,
          quote: {
            ...QUOTE_MOCK.original.quote,
            approvalTxns: [],
          },
        },
      } as TransactionPayQuote<AcrossQuote>;

      addTransactionMock.mockRejectedValue(new Error('submission failed'));

      await expect(
        submitAcrossQuotes({
          messenger,
          quotes: [noApprovalQuote],
          transaction: TRANSACTION_META_MOCK,
          isSmartTransaction: jest.fn(),
        }),
      ).rejects.toThrow('submission failed');

      expect(unsubscribeSpy).toHaveBeenCalledWith(
        'TransactionController:unapprovedTransactionAdded',
        expect.any(Function),
      );
    });
  });
});
