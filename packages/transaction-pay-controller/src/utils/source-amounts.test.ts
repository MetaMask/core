import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getMessengerMock } from '../../tests/messenger-mock.js';
import {
  ARBITRUM_USDC_ADDRESS,
  CHAIN_ID_ARBITRUM,
  PaymentOverride,
} from '../constants.js';
import { TransactionPayStrategy } from '../index.js';
import type { TransactionPaymentToken } from '../index.js';
import type { TransactionData, TransactionPayRequiredToken } from '../types.js';
import { updateSourceAmounts } from './source-amounts.js';
import { getAssetFiatRate } from './token.js';
import { getTransaction } from './transaction.js';

vi.mock(import('./token.js'), async (importOriginal) => ({
  ...(await importOriginal()),
  getAssetFiatRate: vi.fn(),
}));
vi.mock(import('./transaction.js'));

const PAYMENT_TOKEN_ADDRESS_MOCK = '0x123';
const PAYMENT_TOKEN_CHAIN_ID_MOCK = '0x1';

const PAYMENT_TOKEN_MOCK: TransactionPaymentToken = {
  assetId: `eip155:1/erc20:${PAYMENT_TOKEN_ADDRESS_MOCK}`,
  balanceFiat: '2.46',
  balanceHuman: '1.23',
  balanceRaw: '1230000',
  balanceUsd: '3.69',
  decimals: 6,
  symbol: 'TST',
};

const TRANSACTION_TOKEN_MOCK: TransactionPayRequiredToken = {
  address: '0x456',
  allowUnderMinimum: false,
  amountFiat: '1.23',
  amountHuman: '0.5',
  amountRaw: '500000',
  amountUsd: '6.0',
  balanceFiat: '2.46',
  balanceHuman: '1.23',
  balanceRaw: '1230000',
  balanceUsd: '3.69',
  chainId: '0x1',
  decimals: 6,
  skipIfBalance: false,
  symbol: 'TST2',
};

const NON_EVM_PAYMENT_TOKEN_MOCK: TransactionPaymentToken = {
  assetId: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44:501',
  balanceFiat: '170',
  balanceHuman: '2',
  balanceRaw: '2000000000',
  balanceUsd: '200',
  decimals: 9,
  symbol: 'SOL',
};

const TRANSACTION_ID_MOCK = '123-456';
const DESTINATION_TOKEN_ADDRESS_MOCK = '0xdef';

// transfer(HL bridge, 1000000)
const PERPS_DEPOSIT_DATA_MOCK =
  '0xa9059cbb0000000000000000000000002df1c51e09aecf9cacb7bc98cb1742757f163df700000000000000000000000000000000000000000000000000000000000f4240';

describe('Source Amounts Utils', () => {
  const getAssetFiatRateMock = vi.mocked(getAssetFiatRate);
  const getTransactionMock = vi.mocked(getTransaction);
  const { messenger, getStrategyMock } = getMessengerMock();

  beforeEach(() => {
    vi.resetAllMocks();

    getAssetFiatRateMock.mockReturnValue({ fiatRate: '2.0', usdRate: '3.0' });
    getStrategyMock.mockReturnValue(TransactionPayStrategy.Across);
    getTransactionMock.mockReturnValue({
      id: TRANSACTION_ID_MOCK,
    } as never);
  });

  describe('updateSourceAmounts', () => {
    it('updated source amounts', () => {
      const transactionData: TransactionData = {
        isLoading: false,
        paymentToken: PAYMENT_TOKEN_MOCK,
        tokens: [TRANSACTION_TOKEN_MOCK],
      };

      updateSourceAmounts(TRANSACTION_ID_MOCK, transactionData, messenger);

      expect(transactionData.sourceAmounts).toStrictEqual([
        {
          sourceAmountHuman: '2',
          sourceAmountRaw: '2000000',
          targetTokenAddress: TRANSACTION_TOKEN_MOCK.address,
        },
      ]);
    });

    it('returns empty array if payment token matches', () => {
      const transactionData: TransactionData = {
        isLoading: false,
        paymentToken: PAYMENT_TOKEN_MOCK,
        tokens: [
          {
            ...TRANSACTION_TOKEN_MOCK,
            address: PAYMENT_TOKEN_ADDRESS_MOCK,
            chainId: PAYMENT_TOKEN_CHAIN_ID_MOCK,
          },
        ],
      };

      updateSourceAmounts(TRANSACTION_ID_MOCK, transactionData, messenger);

      expect(transactionData.sourceAmounts).toStrictEqual([]);
    });

    it('returns empty array if payment token matches with a different address case', () => {
      const transactionData: TransactionData = {
        isLoading: false,
        paymentToken: {
          ...PAYMENT_TOKEN_MOCK,
          assetId: 'eip155:1/erc20:0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed',
        },
        tokens: [
          {
            ...TRANSACTION_TOKEN_MOCK,
            address: '0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed',
            chainId: PAYMENT_TOKEN_CHAIN_ID_MOCK,
          },
        ],
      };

      updateSourceAmounts(TRANSACTION_ID_MOCK, transactionData, messenger);

      expect(transactionData.sourceAmounts).toStrictEqual([]);
    });

    it('returns empty array if a native payment token matches the native required token', () => {
      const transactionData: TransactionData = {
        isLoading: false,
        paymentToken: { ...PAYMENT_TOKEN_MOCK, assetId: 'eip155:1/slip44:60' },
        tokens: [
          {
            ...TRANSACTION_TOKEN_MOCK,
            address: '0x0000000000000000000000000000000000000000',
            chainId: PAYMENT_TOKEN_CHAIN_ID_MOCK,
          },
        ],
      };

      updateSourceAmounts(TRANSACTION_ID_MOCK, transactionData, messenger);

      expect(transactionData.sourceAmounts).toStrictEqual([]);
    });

    it('does not return empty array if payment token matches but hyperliquid deposit and relay strategy', () => {
      getStrategyMock.mockReturnValue(TransactionPayStrategy.Relay);

      const transactionData: TransactionData = {
        isLoading: false,
        paymentToken: {
          ...PAYMENT_TOKEN_MOCK,
          assetId: `eip155:42161/erc20:${ARBITRUM_USDC_ADDRESS}`,
        },
        tokens: [
          {
            ...TRANSACTION_TOKEN_MOCK,
            address: ARBITRUM_USDC_ADDRESS,
            chainId: CHAIN_ID_ARBITRUM,
          },
        ],
      };

      updateSourceAmounts(TRANSACTION_ID_MOCK, transactionData, messenger);

      expect(transactionData.sourceAmounts).toHaveLength(1);
    });

    it('does not return empty array if payment token matches but perps deposit and across strategy', () => {
      getStrategyMock.mockReturnValue(TransactionPayStrategy.Across);
      getTransactionMock.mockReturnValue({
        id: TRANSACTION_ID_MOCK,
        txParams: {
          to: ARBITRUM_USDC_ADDRESS,
          data: PERPS_DEPOSIT_DATA_MOCK,
        },
      } as never);

      const transactionData: TransactionData = {
        isLoading: false,
        paymentToken: {
          ...PAYMENT_TOKEN_MOCK,
          assetId: `eip155:42161/erc20:${ARBITRUM_USDC_ADDRESS}`,
        },
        tokens: [
          {
            ...TRANSACTION_TOKEN_MOCK,
            address: ARBITRUM_USDC_ADDRESS,
            chainId: CHAIN_ID_ARBITRUM,
          },
        ],
      };

      updateSourceAmounts(TRANSACTION_ID_MOCK, transactionData, messenger);

      expect(transactionData.sourceAmounts).toHaveLength(1);
    });

    it('does not return empty array if payment token matches but nested perps deposit and across strategy', () => {
      getStrategyMock.mockReturnValue(TransactionPayStrategy.Across);
      getTransactionMock.mockReturnValue({
        id: TRANSACTION_ID_MOCK,
        txParams: {},
        nestedTransactions: [
          { to: ARBITRUM_USDC_ADDRESS, data: PERPS_DEPOSIT_DATA_MOCK },
        ],
      } as never);

      const transactionData: TransactionData = {
        isLoading: false,
        paymentToken: {
          ...PAYMENT_TOKEN_MOCK,
          assetId: `eip155:42161/erc20:${ARBITRUM_USDC_ADDRESS}`,
        },
        tokens: [
          {
            ...TRANSACTION_TOKEN_MOCK,
            address: ARBITRUM_USDC_ADDRESS,
            chainId: CHAIN_ID_ARBITRUM,
          },
        ],
      };

      updateSourceAmounts(TRANSACTION_ID_MOCK, transactionData, messenger);

      expect(transactionData.sourceAmounts).toHaveLength(1);
    });

    it('does not return empty array if payment token matches but isQuoteRequired is true', () => {
      const transactionData: TransactionData = {
        isLoading: false,
        isQuoteRequired: true,
        paymentToken: PAYMENT_TOKEN_MOCK,
        tokens: [
          {
            ...TRANSACTION_TOKEN_MOCK,
            address: PAYMENT_TOKEN_ADDRESS_MOCK,
            chainId: PAYMENT_TOKEN_CHAIN_ID_MOCK,
          },
        ],
      };

      updateSourceAmounts(TRANSACTION_ID_MOCK, transactionData, messenger);

      expect(transactionData.sourceAmounts).toHaveLength(1);
    });

    it('returns empty array if skipIfBalance and has balance', () => {
      const transactionData: TransactionData = {
        isLoading: false,
        paymentToken: PAYMENT_TOKEN_MOCK,
        tokens: [
          {
            ...TRANSACTION_TOKEN_MOCK,
            balanceUsd: TRANSACTION_TOKEN_MOCK.amountUsd,
            skipIfBalance: true,
          },
        ],
      };

      updateSourceAmounts(TRANSACTION_ID_MOCK, transactionData, messenger);

      expect(transactionData.sourceAmounts).toStrictEqual([]);
    });

    it('returns empty array if no payment token fiat rate', () => {
      const transactionData: TransactionData = {
        isLoading: false,
        paymentToken: PAYMENT_TOKEN_MOCK,
        tokens: [TRANSACTION_TOKEN_MOCK],
      };

      getAssetFiatRateMock.mockReturnValue(undefined);

      updateSourceAmounts(TRANSACTION_ID_MOCK, transactionData, messenger);

      expect(transactionData.sourceAmounts).toStrictEqual([]);
    });

    it('returns empty array if zero amount', () => {
      const transactionData: TransactionData = {
        isLoading: false,
        paymentToken: PAYMENT_TOKEN_MOCK,
        tokens: [
          {
            ...TRANSACTION_TOKEN_MOCK,
            amountRaw: '0',
          },
        ],
      };

      updateSourceAmounts(TRANSACTION_ID_MOCK, transactionData, messenger);

      expect(transactionData.sourceAmounts).toStrictEqual([]);
    });

    it('uses payment token balance if isMaxAmount is true', () => {
      const transactionData: TransactionData = {
        isLoading: false,
        isMaxAmount: true,
        paymentToken: PAYMENT_TOKEN_MOCK,
        tokens: [TRANSACTION_TOKEN_MOCK],
      };

      updateSourceAmounts(TRANSACTION_ID_MOCK, transactionData, messenger);

      expect(transactionData.sourceAmounts).toStrictEqual([
        {
          sourceAmountHuman: PAYMENT_TOKEN_MOCK.balanceHuman,
          sourceAmountRaw: PAYMENT_TOKEN_MOCK.balanceRaw,
          targetTokenAddress: TRANSACTION_TOKEN_MOCK.address,
        },
      ]);
    });

    it('uses getBalance override for isMaxAmount standard flow', () => {
      const getBalance = vi.fn().mockReturnValue({
        balanceRaw: '9900000',
      });

      const transactionData: TransactionData = {
        isLoading: false,
        isMaxAmount: true,
        paymentToken: PAYMENT_TOKEN_MOCK,
        tokens: [TRANSACTION_TOKEN_MOCK],
      };

      updateSourceAmounts(
        TRANSACTION_ID_MOCK,
        transactionData,
        messenger,
        getBalance,
      );

      expect(transactionData.sourceAmounts).toStrictEqual([
        {
          sourceAmountHuman: PAYMENT_TOKEN_MOCK.balanceHuman,
          sourceAmountRaw: '9900000',
          targetTokenAddress: TRANSACTION_TOKEN_MOCK.address,
        },
      ]);
    });

    it('falls back to payment token balance when getBalance returns undefined', () => {
      const getBalance = vi.fn().mockReturnValue(undefined);

      const transactionData: TransactionData = {
        isLoading: false,
        isMaxAmount: true,
        paymentToken: PAYMENT_TOKEN_MOCK,
        tokens: [TRANSACTION_TOKEN_MOCK],
      };

      updateSourceAmounts(
        TRANSACTION_ID_MOCK,
        transactionData,
        messenger,
        getBalance,
      );

      expect(transactionData.sourceAmounts).toStrictEqual([
        {
          sourceAmountHuman: PAYMENT_TOKEN_MOCK.balanceHuman,
          sourceAmountRaw: PAYMENT_TOKEN_MOCK.balanceRaw,
          targetTokenAddress: TRANSACTION_TOKEN_MOCK.address,
        },
      ]);
    });

    it('ignores getBalance when isMaxAmount is false', () => {
      const getBalance = vi.fn().mockReturnValue({
        balanceRaw: '9900000',
      });

      const transactionData: TransactionData = {
        isLoading: false,
        paymentToken: PAYMENT_TOKEN_MOCK,
        tokens: [TRANSACTION_TOKEN_MOCK],
      };

      updateSourceAmounts(
        TRANSACTION_ID_MOCK,
        transactionData,
        messenger,
        getBalance,
      );

      // isMaxAmount is false, so fiat-derived amounts should be used (not the override)
      expect(transactionData.sourceAmounts).toStrictEqual([
        {
          sourceAmountHuman: '2',
          sourceAmountRaw: '2000000',
          targetTokenAddress: TRANSACTION_TOKEN_MOCK.address,
        },
      ]);
    });

    it('does not call getBalance when transaction is not found', () => {
      // First call (top of updateSourceAmounts) returns undefined; subsequent
      // calls (getStrategyContext) return the normal mock so no crash.
      getTransactionMock.mockReturnValueOnce(undefined);

      const getBalance = vi.fn().mockReturnValue({
        balanceRaw: '9900000',
      });

      const transactionData: TransactionData = {
        isLoading: false,
        isMaxAmount: true,
        paymentToken: PAYMENT_TOKEN_MOCK,
        tokens: [TRANSACTION_TOKEN_MOCK],
      };

      updateSourceAmounts(
        TRANSACTION_ID_MOCK,
        transactionData,
        messenger,
        getBalance,
      );

      expect(getBalance).not.toHaveBeenCalled();
      expect(transactionData.sourceAmounts).toStrictEqual([
        {
          sourceAmountHuman: PAYMENT_TOKEN_MOCK.balanceHuman,
          sourceAmountRaw: PAYMENT_TOKEN_MOCK.balanceRaw,
          targetTokenAddress: TRANSACTION_TOKEN_MOCK.address,
        },
      ]);
    });

    it('uses getBalance override for MoneyAccount max when getBalance is provided', () => {
      const getBalance = vi.fn().mockReturnValue({
        balanceRaw: '9900000',
      });

      const transactionData: TransactionData = {
        isLoading: false,
        isMaxAmount: true,
        paymentOverride: PaymentOverride.MoneyAccount,
        paymentToken: {
          ...PAYMENT_TOKEN_MOCK,
          balanceHuman: '0.62',
          balanceRaw: '620000',
          balanceUsd: '0.62',
        },
        tokens: [
          {
            ...TRANSACTION_TOKEN_MOCK,
            amountUsd: '6.0',
          },
        ],
      };

      updateSourceAmounts(
        TRANSACTION_ID_MOCK,
        transactionData,
        messenger,
        getBalance,
      );

      // getBalance is provided, so its raw override is applied even for
      // MoneyAccount. sourceAmountHuman is unread and falls back to the pay
      // token balance.
      expect(transactionData.sourceAmounts).toStrictEqual([
        {
          sourceAmountHuman: '0.62',
          sourceAmountRaw: '9900000',
          targetTokenAddress: TRANSACTION_TOKEN_MOCK.address,
        },
      ]);
    });

    it('uses the payment token balance on max when getBalance is not provided (payment-override agnostic)', () => {
      const transactionData: TransactionData = {
        isLoading: false,
        isMaxAmount: true,
        paymentOverride: PaymentOverride.MoneyAccount,
        paymentToken: {
          ...PAYMENT_TOKEN_MOCK,
          balanceHuman: '0.62',
          balanceRaw: '620000',
          balanceUsd: '0.62',
        },
        tokens: [
          {
            ...TRANSACTION_TOKEN_MOCK,
            amountUsd: '6.0',
          },
        ],
      };

      updateSourceAmounts(TRANSACTION_ID_MOCK, transactionData, messenger);

      // No getBalance callback: max uses the pay token's on-chain balance,
      // regardless of paymentOverride. All balance complexity now lives in the
      // client getBalance callback.
      expect(transactionData.sourceAmounts).toStrictEqual([
        {
          sourceAmountHuman: '0.62',
          sourceAmountRaw: '620000',
          targetTokenAddress: TRANSACTION_TOKEN_MOCK.address,
        },
      ]);
    });

    it('uses getBalance override for isMaxAmount post-quote flow', () => {
      const DESTINATION_TOKEN = {
        assetId: `eip155:56/erc20:${DESTINATION_TOKEN_ADDRESS_MOCK}` as const,
        balanceFiat: '100.00',
        balanceHuman: '1.00',
        balanceRaw: '1000000000000000000',
        balanceUsd: '100.00',
        decimals: 18,
        symbol: 'BNB',
      };

      const getBalance = vi.fn().mockReturnValue({
        balanceRaw: '5500000',
      });

      const transactionData: TransactionData = {
        isLoading: false,
        isMaxAmount: true,
        isPostQuote: true,
        paymentToken: DESTINATION_TOKEN,
        tokens: [
          {
            ...TRANSACTION_TOKEN_MOCK,
            amountRaw: '6000000',
            skipIfBalance: false,
          },
        ],
      };

      updateSourceAmounts(
        TRANSACTION_ID_MOCK,
        transactionData,
        messenger,
        getBalance,
      );

      expect(transactionData.sourceAmounts).toStrictEqual([
        {
          sourceAmountHuman: TRANSACTION_TOKEN_MOCK.balanceHuman,
          sourceAmountRaw: '5500000',
          sourceBalanceRaw: '5500000',
          sourceChainId: TRANSACTION_TOKEN_MOCK.chainId,
          sourceTokenAddress: TRANSACTION_TOKEN_MOCK.address,
          targetTokenAddress: DESTINATION_TOKEN_ADDRESS_MOCK,
        },
      ]);
    });

    it('falls back to the payment token balance when getBalance returns undefined for MoneyAccount max', () => {
      // A getBalance callback that returns undefined is a deliberate signal to
      // use the pay token's on-chain balance — not the legacy fiat-derived
      // amount. The callback owns all balance complexity.
      const getBalance = vi.fn().mockReturnValue(undefined);

      const transactionData: TransactionData = {
        isLoading: false,
        isMaxAmount: true,
        paymentOverride: PaymentOverride.MoneyAccount,
        paymentToken: {
          ...PAYMENT_TOKEN_MOCK,
          balanceHuman: '0.62',
          balanceRaw: '620000',
          balanceUsd: '0.62',
        },
        tokens: [
          {
            ...TRANSACTION_TOKEN_MOCK,
            amountUsd: '6.0',
          },
        ],
      };

      updateSourceAmounts(
        TRANSACTION_ID_MOCK,
        transactionData,
        messenger,
        getBalance,
      );

      expect(getBalance).toHaveBeenCalled();
      expect(transactionData.sourceAmounts).toStrictEqual([
        {
          sourceAmountHuman: '0.62',
          sourceAmountRaw: '620000',
          targetTokenAddress: TRANSACTION_TOKEN_MOCK.address,
        },
      ]);
    });

    it('does nothing if no payment token', () => {
      const transactionData: TransactionData = {
        isLoading: false,
        tokens: [TRANSACTION_TOKEN_MOCK],
      };

      updateSourceAmounts(TRANSACTION_ID_MOCK, transactionData, messenger);

      expect(transactionData.sourceAmounts).toBeUndefined();
    });

    it('does nothing if no tokens', () => {
      const transactionData: TransactionData = {
        isLoading: false,
        paymentToken: PAYMENT_TOKEN_MOCK,
        tokens: [],
      };

      updateSourceAmounts(TRANSACTION_ID_MOCK, transactionData, messenger);

      expect(transactionData.sourceAmounts).toBeUndefined();
    });

    // eslint-disable-next-line vitest/expect-expect
    it('does nothing if no transaction data', () => {
      updateSourceAmounts(TRANSACTION_ID_MOCK, undefined, messenger);
    });

    describe('non-EVM payment token', () => {
      beforeEach(() => {
        getAssetFiatRateMock.mockReturnValue({
          fiatRate: '85',
          usdRate: '100',
        });
      });

      it('calculates source amounts using the asset fiat rate', () => {
        const transactionData: TransactionData = {
          isLoading: false,
          paymentToken: NON_EVM_PAYMENT_TOKEN_MOCK,
          tokens: [TRANSACTION_TOKEN_MOCK],
        };

        updateSourceAmounts(TRANSACTION_ID_MOCK, transactionData, messenger);

        expect(getAssetFiatRateMock).toHaveBeenCalledWith(
          messenger,
          NON_EVM_PAYMENT_TOKEN_MOCK.assetId,
        );
        expect(transactionData.sourceAmounts).toStrictEqual([
          {
            sourceAmountHuman: '0.06',
            sourceAmountRaw: '60000000',
            targetTokenAddress: TRANSACTION_TOKEN_MOCK.address,
          },
        ]);
      });

      it('uses the payment token balance if isMaxAmount is true', () => {
        const transactionData: TransactionData = {
          isLoading: false,
          isMaxAmount: true,
          paymentToken: NON_EVM_PAYMENT_TOKEN_MOCK,
          tokens: [TRANSACTION_TOKEN_MOCK],
        };

        updateSourceAmounts(TRANSACTION_ID_MOCK, transactionData, messenger);

        expect(transactionData.sourceAmounts).toStrictEqual([
          {
            sourceAmountHuman: NON_EVM_PAYMENT_TOKEN_MOCK.balanceHuman,
            sourceAmountRaw: NON_EVM_PAYMENT_TOKEN_MOCK.balanceRaw,
            targetTokenAddress: TRANSACTION_TOKEN_MOCK.address,
          },
        ]);
      });

      it('returns empty array if no asset fiat rate', () => {
        getAssetFiatRateMock.mockReturnValue(undefined);

        const transactionData: TransactionData = {
          isLoading: false,
          paymentToken: NON_EVM_PAYMENT_TOKEN_MOCK,
          tokens: [TRANSACTION_TOKEN_MOCK],
        };

        updateSourceAmounts(TRANSACTION_ID_MOCK, transactionData, messenger);

        expect(transactionData.sourceAmounts).toStrictEqual([]);
      });

      it('throws in post-quote flows', () => {
        const transactionData: TransactionData = {
          isLoading: false,
          isPostQuote: true,
          paymentToken: NON_EVM_PAYMENT_TOKEN_MOCK,
          tokens: [TRANSACTION_TOKEN_MOCK],
        };

        expect(() =>
          updateSourceAmounts(TRANSACTION_ID_MOCK, transactionData, messenger),
        ).toThrow('Post-quote payment tokens must be EVM tokens');
      });
    });

    describe('post-quote (withdrawal) flow', () => {
      const DESTINATION_TOKEN_MOCK = {
        assetId: `eip155:56/erc20:${DESTINATION_TOKEN_ADDRESS_MOCK}` as const,
        balanceFiat: '100.00',
        balanceHuman: '1.00',
        balanceRaw: '1000000000000000000',
        balanceUsd: '100.00',
        decimals: 18,
        symbol: 'BNB',
      };

      it('calculates source amounts from tokens for post-quote flow', () => {
        const transactionData: TransactionData = {
          isLoading: false,
          isPostQuote: true,
          paymentToken: DESTINATION_TOKEN_MOCK,
          tokens: [
            {
              ...TRANSACTION_TOKEN_MOCK,
              skipIfBalance: false,
            },
          ],
        };

        updateSourceAmounts(TRANSACTION_ID_MOCK, transactionData, messenger);

        expect(transactionData.sourceAmounts).toStrictEqual([
          {
            sourceAmountHuman: TRANSACTION_TOKEN_MOCK.amountHuman,
            sourceAmountRaw: TRANSACTION_TOKEN_MOCK.amountRaw,
            sourceBalanceRaw: TRANSACTION_TOKEN_MOCK.balanceRaw,
            sourceChainId: TRANSACTION_TOKEN_MOCK.chainId,
            sourceTokenAddress: TRANSACTION_TOKEN_MOCK.address,
            targetTokenAddress: DESTINATION_TOKEN_ADDRESS_MOCK,
          },
        ]);
      });

      it('filters out skipIfBalance tokens in post-quote flow', () => {
        const transactionData: TransactionData = {
          isLoading: false,
          isPostQuote: true,
          paymentToken: DESTINATION_TOKEN_MOCK,
          tokens: [
            {
              ...TRANSACTION_TOKEN_MOCK,
              skipIfBalance: true,
            },
          ],
        };

        updateSourceAmounts(TRANSACTION_ID_MOCK, transactionData, messenger);

        expect(transactionData.sourceAmounts).toStrictEqual([]);
      });

      it('does nothing for post-quote if no paymentToken', () => {
        const transactionData: TransactionData = {
          isLoading: false,
          isPostQuote: true,
          tokens: [TRANSACTION_TOKEN_MOCK],
        };

        updateSourceAmounts(TRANSACTION_ID_MOCK, transactionData, messenger);

        expect(transactionData.sourceAmounts).toBeUndefined();
      });

      it('filters out zero amount tokens in post-quote flow', () => {
        const transactionData: TransactionData = {
          isLoading: false,
          isPostQuote: true,
          paymentToken: DESTINATION_TOKEN_MOCK,
          tokens: [
            {
              ...TRANSACTION_TOKEN_MOCK,
              amountRaw: '0',
              skipIfBalance: false,
            },
          ],
        };

        updateSourceAmounts(TRANSACTION_ID_MOCK, transactionData, messenger);

        expect(transactionData.sourceAmounts).toStrictEqual([]);
      });

      it('filters out same token on same chain in post-quote flow', () => {
        const transactionData: TransactionData = {
          isLoading: false,
          isPostQuote: true,
          paymentToken: DESTINATION_TOKEN_MOCK,
          tokens: [
            {
              ...TRANSACTION_TOKEN_MOCK,
              address: DESTINATION_TOKEN_ADDRESS_MOCK,
              chainId: '0x38',
              skipIfBalance: false,
            },
          ],
        };

        updateSourceAmounts(TRANSACTION_ID_MOCK, transactionData, messenger);

        expect(transactionData.sourceAmounts).toStrictEqual([]);
      });

      it('does not filter out same token when isHyperliquidSource is true in post-quote flow', () => {
        const transactionData: TransactionData = {
          isLoading: false,
          isPostQuote: true,
          isHyperliquidSource: true,
          paymentToken: {
            ...DESTINATION_TOKEN_MOCK,
            assetId: `eip155:42161/erc20:${ARBITRUM_USDC_ADDRESS}`,
            decimals: 6,
            symbol: 'USDC',
          },
          tokens: [
            {
              ...TRANSACTION_TOKEN_MOCK,
              address: ARBITRUM_USDC_ADDRESS,
              chainId: CHAIN_ID_ARBITRUM,
              skipIfBalance: false,
            },
          ],
        };

        updateSourceAmounts(TRANSACTION_ID_MOCK, transactionData, messenger);

        expect(transactionData.sourceAmounts).toStrictEqual([
          {
            sourceAmountHuman: TRANSACTION_TOKEN_MOCK.amountHuman,
            sourceAmountRaw: TRANSACTION_TOKEN_MOCK.amountRaw,
            sourceBalanceRaw: TRANSACTION_TOKEN_MOCK.balanceRaw,
            sourceChainId: CHAIN_ID_ARBITRUM,
            sourceTokenAddress: ARBITRUM_USDC_ADDRESS,
            targetTokenAddress: ARBITRUM_USDC_ADDRESS,
          },
        ]);
      });

      it('still filters out same token when isHyperliquidSource is false in post-quote flow', () => {
        const transactionData: TransactionData = {
          isLoading: false,
          isPostQuote: true,
          isHyperliquidSource: false,
          paymentToken: DESTINATION_TOKEN_MOCK,
          tokens: [
            {
              ...TRANSACTION_TOKEN_MOCK,
              address: DESTINATION_TOKEN_ADDRESS_MOCK,
              chainId: '0x38',
              skipIfBalance: false,
            },
          ],
        };

        updateSourceAmounts(TRANSACTION_ID_MOCK, transactionData, messenger);

        expect(transactionData.sourceAmounts).toStrictEqual([]);
      });

      it('uses token balance when isMaxAmount is true in post-quote flow', () => {
        const transactionData: TransactionData = {
          isLoading: false,
          isMaxAmount: true,
          isPostQuote: true,
          paymentToken: DESTINATION_TOKEN_MOCK,
          tokens: [
            {
              ...TRANSACTION_TOKEN_MOCK,
              amountRaw: '2000000',
              skipIfBalance: false,
            },
          ],
        };

        updateSourceAmounts(TRANSACTION_ID_MOCK, transactionData, messenger);

        expect(transactionData.sourceAmounts).toStrictEqual([
          {
            sourceAmountHuman: TRANSACTION_TOKEN_MOCK.balanceHuman,
            sourceAmountRaw: TRANSACTION_TOKEN_MOCK.balanceRaw,
            sourceBalanceRaw: TRANSACTION_TOKEN_MOCK.balanceRaw,
            sourceChainId: TRANSACTION_TOKEN_MOCK.chainId,
            sourceTokenAddress: TRANSACTION_TOKEN_MOCK.address,
            targetTokenAddress: DESTINATION_TOKEN_ADDRESS_MOCK,
          },
        ]);
      });

      it('caps the max source amount to the amount the transaction funds', () => {
        const getBalance = vi.fn().mockReturnValue({
          balanceRaw: '21046127',
        });

        const transactionData: TransactionData = {
          isLoading: false,
          isMaxAmount: true,
          isPostQuote: true,
          paymentToken: DESTINATION_TOKEN_MOCK,
          tokens: [
            {
              ...TRANSACTION_TOKEN_MOCK,
              amountHuman: '21.040001',
              amountRaw: '21040001',
              skipIfBalance: false,
            },
          ],
        };

        updateSourceAmounts(
          TRANSACTION_ID_MOCK,
          transactionData,
          messenger,
          getBalance,
        );

        expect(transactionData.sourceAmounts).toStrictEqual([
          {
            sourceAmountHuman: '21.040001',
            sourceAmountRaw: '21040001',
            sourceBalanceRaw: '21046127',
            sourceChainId: TRANSACTION_TOKEN_MOCK.chainId,
            sourceTokenAddress: TRANSACTION_TOKEN_MOCK.address,
            targetTokenAddress: DESTINATION_TOKEN_ADDRESS_MOCK,
          },
        ]);
      });

      it('uses the balance on max when the transaction funds at least the balance', () => {
        const getBalance = vi.fn().mockReturnValue({
          balanceRaw: '21040001',
        });

        const transactionData: TransactionData = {
          isLoading: false,
          isMaxAmount: true,
          isPostQuote: true,
          paymentToken: DESTINATION_TOKEN_MOCK,
          tokens: [
            {
              ...TRANSACTION_TOKEN_MOCK,
              amountHuman: '21.046127',
              amountRaw: '21046127',
              skipIfBalance: false,
            },
          ],
        };

        updateSourceAmounts(
          TRANSACTION_ID_MOCK,
          transactionData,
          messenger,
          getBalance,
        );

        expect(transactionData.sourceAmounts).toStrictEqual([
          {
            sourceAmountHuman: TRANSACTION_TOKEN_MOCK.balanceHuman,
            sourceAmountRaw: '21040001',
            sourceBalanceRaw: '21040001',
            sourceChainId: TRANSACTION_TOKEN_MOCK.chainId,
            sourceTokenAddress: TRANSACTION_TOKEN_MOCK.address,
            targetTokenAddress: DESTINATION_TOKEN_ADDRESS_MOCK,
          },
        ]);
      });

      it('uses the balance on max when the transaction has no encoded amount', () => {
        const getBalance = vi.fn().mockReturnValue({
          balanceRaw: '21046127',
        });

        const transactionData: TransactionData = {
          isLoading: false,
          isMaxAmount: true,
          isPostQuote: true,
          paymentToken: DESTINATION_TOKEN_MOCK,
          tokens: [
            {
              ...TRANSACTION_TOKEN_MOCK,
              amountRaw: '0',
              skipIfBalance: false,
            },
          ],
        };

        updateSourceAmounts(
          TRANSACTION_ID_MOCK,
          transactionData,
          messenger,
          getBalance,
        );

        expect(transactionData.sourceAmounts).toStrictEqual([
          {
            sourceAmountHuman: TRANSACTION_TOKEN_MOCK.balanceHuman,
            sourceAmountRaw: '21046127',
            sourceBalanceRaw: '21046127',
            sourceChainId: TRANSACTION_TOKEN_MOCK.chainId,
            sourceTokenAddress: TRANSACTION_TOKEN_MOCK.address,
            targetTokenAddress: DESTINATION_TOKEN_ADDRESS_MOCK,
          },
        ]);
      });

      it('does not cap the max source amount for a HyperLiquid source', () => {
        const getBalance = vi.fn().mockReturnValue({
          balanceRaw: '21046127',
        });

        const transactionData: TransactionData = {
          isLoading: false,
          isHyperliquidSource: true,
          isMaxAmount: true,
          isPostQuote: true,
          paymentToken: DESTINATION_TOKEN_MOCK,
          tokens: [
            {
              ...TRANSACTION_TOKEN_MOCK,
              amountRaw: '21040001',
              skipIfBalance: false,
            },
          ],
        };

        updateSourceAmounts(
          TRANSACTION_ID_MOCK,
          transactionData,
          messenger,
          getBalance,
        );

        expect(transactionData.sourceAmounts).toStrictEqual([
          {
            sourceAmountHuman: TRANSACTION_TOKEN_MOCK.balanceHuman,
            sourceAmountRaw: '21046127',
            sourceBalanceRaw: '21046127',
            sourceChainId: TRANSACTION_TOKEN_MOCK.chainId,
            sourceTokenAddress: TRANSACTION_TOKEN_MOCK.address,
            targetTokenAddress: DESTINATION_TOKEN_ADDRESS_MOCK,
          },
        ]);
      });

      it('does not cap the max source amount for a Polymarket deposit wallet source', () => {
        const getBalance = vi.fn().mockReturnValue({
          balanceRaw: '21046127',
        });

        const transactionData: TransactionData = {
          isLoading: false,
          isMaxAmount: true,
          isPolymarketDepositWallet: true,
          isPostQuote: true,
          paymentToken: DESTINATION_TOKEN_MOCK,
          tokens: [
            {
              ...TRANSACTION_TOKEN_MOCK,
              amountRaw: '21040001',
              skipIfBalance: false,
            },
          ],
        };

        updateSourceAmounts(
          TRANSACTION_ID_MOCK,
          transactionData,
          messenger,
          getBalance,
        );

        expect(transactionData.sourceAmounts).toStrictEqual([
          {
            sourceAmountHuman: TRANSACTION_TOKEN_MOCK.balanceHuman,
            sourceAmountRaw: '21046127',
            sourceBalanceRaw: '21046127',
            sourceChainId: TRANSACTION_TOKEN_MOCK.chainId,
            sourceTokenAddress: TRANSACTION_TOKEN_MOCK.address,
            targetTokenAddress: DESTINATION_TOKEN_ADDRESS_MOCK,
          },
        ]);
      });
    });
  });
});
