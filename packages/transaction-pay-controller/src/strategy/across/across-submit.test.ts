import { toHex } from '@metamask/controller-utils';
import {
  TransactionStatus,
  TransactionType,
} from '@metamask/transaction-controller';
import type {
  TransactionControllerState,
  TransactionMeta,
} from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';

import {
  getAcrossOriginalQuote,
  isAcrossQuote,
  submitAcrossQuotes,
} from './across-submit';
import type { AcrossQuote } from './types';
import { getDefaultRemoteFeatureFlagControllerState } from '../../../../remote-feature-flag-controller/src/remote-feature-flag-controller';
import { TransactionPayStrategy } from '../../constants';
import { getMessengerMock } from '../../tests/messenger-mock';
import type { TransactionPayQuote } from '../../types';
import { getGasBuffer } from '../../utils/feature-flags';

jest.mock('../../utils/feature-flags', () => ({
  ...jest.requireActual('../../utils/feature-flags'),
  getGasBuffer: jest.fn(),
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
  const getGasBufferMock = jest.mocked(getGasBuffer);

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

    getGasBufferMock.mockReturnValue(1.0);
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
  });

  describe('submitAcrossQuotes', () => {
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

    it('defaults to perps across deposit when transaction type is not perps or predict', async () => {
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
          type: TransactionType.perpsAcrossDeposit,
        }),
      );
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

    it('uses fallback gas value when estimation fails', async () => {
      estimateGasMock.mockRejectedValue(new Error('Gas estimation failed'));

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

      const params = addTransactionMock.mock.calls[0][0] as { gas: Hex };
      expect(params.gas).toBe(toHex(900000));
    });

    it('applies gas buffer to estimated gas', async () => {
      getGasBufferMock.mockReturnValue(1.5);

      estimateGasMock.mockResolvedValue({
        gas: '0x10000',
        simulationFails: undefined,
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

      const params = addTransactionMock.mock.calls[0][0] as { gas: Hex };
      const gasValue = parseInt(params.gas, 16);
      const expectedGas = Math.ceil(0x10000 * 1.5);
      expect(gasValue).toBe(expectedGas);
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
  });

  describe('isAcrossQuote', () => {
    it('returns true when quote has original.quote', () => {
      expect(isAcrossQuote(QUOTE_MOCK)).toBe(true);
    });

    it('returns false when original.quote is missing', () => {
      const missingQuote = {
        original: {},
      } as TransactionPayQuote<AcrossQuote>;

      expect(isAcrossQuote(missingQuote)).toBe(false);
    });

    it('returns false when original is undefined', () => {
      const noOriginal = {
        original: undefined,
      } as unknown as TransactionPayQuote<AcrossQuote>;

      expect(isAcrossQuote(noOriginal)).toBe(false);
    });
  });

  describe('getAcrossOriginalQuote', () => {
    it('returns the original quote object', () => {
      const result = getAcrossOriginalQuote(QUOTE_MOCK);
      expect(result).toBe(QUOTE_MOCK.original.quote);
    });
  });
});
