import type { Hex } from '@metamask/utils';

import {
  POLYGON_PUSD_ADDRESS,
  POLYGON_USDCE_ADDRESS,
} from '../../../constants.js';
import { getMessengerMock } from '../../../tests/messenger-mock.js';
import type { QuoteRequest, TransactionPayQuote } from '../../../types.js';
import { getLiveTokenBalance } from '../../../utils/token.js';
import type { RelayQuote, RelayQuoteRequest } from '../types.js';
import {
  POLYMARKET_COLLATERAL_OFFRAMP_POLYGON,
  POLYMARKET_COLLATERAL_ONRAMP_POLYGON,
} from './constants.js';
import {
  applyPolymarketDepositWalletOverrides,
  submitPolymarketWithdraw,
  sweepPolymarketDepositWallet,
} from './withdraw.js';

jest.mock('../../../utils/token');

const EOA_MOCK = '0x1111111111111111111111111111111111111111' as Hex;
const DEPOSIT_WALLET_MOCK = '0x2222222222222222222222222222222222222222' as Hex;
const SOURCE_HASH_MOCK: Hex = `0x${'aa'.repeat(32)}`;
const SOURCE_AMOUNT_RAW_MOCK = '1000000';

// transfer(0x1234...7890, 0) encoded calldata
const TRANSFER_CALLDATA_MOCK =
  '0xa9059cbb0000000000000000000000001234567890123456789012345678901234567890000000000000000000000000000000000000000000000000000000003b9aca00' as Hex;

function buildQuote(
  overrides: Partial<RelayQuote> = {},
): TransactionPayQuote<RelayQuote> {
  return {
    original: {
      steps: [
        {
          id: 'deposit',
          kind: 'transaction',
          items: [
            {
              data: {
                data: TRANSFER_CALLDATA_MOCK,
              },
            },
          ],
        },
      ],
      ...overrides,
    },
    sourceAmount: {
      raw: SOURCE_AMOUNT_RAW_MOCK,
      human: '1',
      fiat: '1',
      usd: '1',
    },
  } as TransactionPayQuote<RelayQuote>;
}

describe('Polymarket withdraw', () => {
  const {
    messenger,
    polymarketGetDepositWalletAddressMock,
    polymarketSubmitDepositWalletBatchMock,
  } = getMessengerMock();
  const getLiveTokenBalanceMock = jest.mocked(getLiveTokenBalance);

  beforeEach(() => {
    jest.resetAllMocks();
    polymarketGetDepositWalletAddressMock.mockResolvedValue(
      DEPOSIT_WALLET_MOCK,
    );
    polymarketSubmitDepositWalletBatchMock.mockResolvedValue({
      sourceHash: SOURCE_HASH_MOCK,
    });
    getLiveTokenBalanceMock.mockResolvedValue('0');
  });

  describe('applyPolymarketDepositWalletOverrides', () => {
    it('rewrites the quote body for the deposit-wallet path', async () => {
      const body = {} as RelayQuoteRequest;
      const request = { from: EOA_MOCK } as QuoteRequest;

      await applyPolymarketDepositWalletOverrides(body, request, messenger);

      expect(polymarketGetDepositWalletAddressMock).toHaveBeenCalledWith({
        eoa: EOA_MOCK,
      });
      expect(body).toStrictEqual({
        originCurrency: POLYGON_USDCE_ADDRESS,
        user: DEPOSIT_WALLET_MOCK,
        refundTo: DEPOSIT_WALLET_MOCK,
        useDepositAddress: true,
        strict: true,
      });
    });
  });

  describe('submitPolymarketWithdraw', () => {
    it('submits the approve + unwrap batch via the relayer callback', async () => {
      const quote = buildQuote();

      const result = await submitPolymarketWithdraw(quote, EOA_MOCK, messenger);

      expect(result).toStrictEqual({
        sourceHash: SOURCE_HASH_MOCK,
        preSubmitUsdceBalance: 0n,
      });
      expect(polymarketSubmitDepositWalletBatchMock).toHaveBeenCalledTimes(1);
      const call = polymarketSubmitDepositWalletBatchMock.mock.calls[0][0];
      expect(call.eoa).toBe(EOA_MOCK);
      expect(call.depositWallet).toBe(DEPOSIT_WALLET_MOCK);
      expect(call.calls).toHaveLength(2);
      expect(call.calls[0].target).toBe(POLYGON_PUSD_ADDRESS);
      expect(call.calls[0].value).toBe('0');
      expect(call.calls[1].target).toBe(POLYMARKET_COLLATERAL_OFFRAMP_POLYGON);
      expect(call.calls[1].value).toBe('0');
    });

    it('captures the pre-submit USDC.e balance', async () => {
      getLiveTokenBalanceMock.mockResolvedValue('2500000');

      const result = await submitPolymarketWithdraw(
        buildQuote(),
        EOA_MOCK,
        messenger,
      );

      expect(result.preSubmitUsdceBalance).toBe(2500000n);
    });

    it('defaults pre-submit balance to zero when the balance read fails', async () => {
      getLiveTokenBalanceMock.mockRejectedValue(new Error('rpc down'));

      const result = await submitPolymarketWithdraw(
        buildQuote(),
        EOA_MOCK,
        messenger,
      );

      expect(result.preSubmitUsdceBalance).toBe(0n);
    });

    it('throws when the Relay quote has no deposit step', async () => {
      const quote = buildQuote({ steps: [] } as Partial<RelayQuote>);

      await expect(
        submitPolymarketWithdraw(quote, EOA_MOCK, messenger),
      ).rejects.toThrow('Relay quote has no deposit step');
    });

    it('throws when the Relay quote deposit step is missing calldata', async () => {
      const quote = buildQuote({
        steps: [
          {
            id: 'deposit',
            kind: 'transaction',
            items: [{ data: {} }],
          },
        ],
      } as unknown as Partial<RelayQuote>);

      await expect(
        submitPolymarketWithdraw(quote, EOA_MOCK, messenger),
      ).rejects.toThrow('deposit step is missing calldata');
    });
  });

  describe('sweepPolymarketDepositWallet', () => {
    const successOptions = {
      relayStatus: 'success' as const,
      preSubmitUsdceBalance: 0n,
    };

    it('wraps any USDC.e balance back into pUSD on the deposit wallet', async () => {
      getLiveTokenBalanceMock.mockResolvedValue('5000000');

      await sweepPolymarketDepositWallet(EOA_MOCK, messenger, successOptions);

      expect(polymarketSubmitDepositWalletBatchMock).toHaveBeenCalledTimes(1);
      const call = polymarketSubmitDepositWalletBatchMock.mock.calls[0][0];
      expect(call.eoa).toBe(EOA_MOCK);
      expect(call.depositWallet).toBe(DEPOSIT_WALLET_MOCK);
      expect(call.calls).toHaveLength(2);
      expect(call.calls[0].target).toBe(POLYGON_USDCE_ADDRESS);
      expect(call.calls[1].target).toBe(POLYMARKET_COLLATERAL_ONRAMP_POLYGON);
    });

    it('is a no-op when the USDC.e balance is zero', async () => {
      getLiveTokenBalanceMock.mockResolvedValue('0');

      await sweepPolymarketDepositWallet(EOA_MOCK, messenger, successOptions);

      expect(polymarketSubmitDepositWalletBatchMock).not.toHaveBeenCalled();
    });

    it('does not throw when the balance read fails', async () => {
      getLiveTokenBalanceMock.mockRejectedValue(new Error('rpc down'));

      expect(
        await sweepPolymarketDepositWallet(EOA_MOCK, messenger, successOptions),
      ).toBeUndefined();
      expect(polymarketSubmitDepositWalletBatchMock).not.toHaveBeenCalled();
    });

    it('does not throw when the wrap-back batch submission fails', async () => {
      getLiveTokenBalanceMock.mockResolvedValue('5000000');
      polymarketSubmitDepositWalletBatchMock.mockRejectedValueOnce(
        new Error('relayer down'),
      );

      expect(
        await sweepPolymarketDepositWallet(EOA_MOCK, messenger, successOptions),
      ).toBeUndefined();
    });

    describe('when relayStatus is refund', () => {
      beforeEach(() => {
        jest.useFakeTimers();
      });

      afterEach(() => {
        jest.useRealTimers();
      });

      it('retries until the balance exceeds the pre-submit balance, waits for the relayer to settle, then sweeps the full new balance', async () => {
        getLiveTokenBalanceMock
          .mockResolvedValueOnce('1000000')
          .mockResolvedValueOnce('1000000')
          .mockResolvedValueOnce('4000000');

        const sweepPromise = sweepPolymarketDepositWallet(EOA_MOCK, messenger, {
          relayStatus: 'refund',
          preSubmitUsdceBalance: 1000000n,
        });

        await jest.advanceTimersByTimeAsync(5000);
        await sweepPromise;

        expect(getLiveTokenBalanceMock).toHaveBeenCalledTimes(3);
        expect(polymarketSubmitDepositWalletBatchMock).toHaveBeenCalledTimes(1);
        const call = polymarketSubmitDepositWalletBatchMock.mock.calls[0][0];
        expect(call.calls[1].target).toBe(POLYMARKET_COLLATERAL_ONRAMP_POLYGON);
      });

      it('also retries when relayStatus is refunded', async () => {
        getLiveTokenBalanceMock
          .mockResolvedValueOnce('1000000')
          .mockResolvedValueOnce('4000000');

        const sweepPromise = sweepPolymarketDepositWallet(EOA_MOCK, messenger, {
          relayStatus: 'refunded',
          preSubmitUsdceBalance: 1000000n,
        });

        await jest.advanceTimersByTimeAsync(4000);
        await sweepPromise;

        expect(getLiveTokenBalanceMock).toHaveBeenCalledTimes(2);
        expect(polymarketSubmitDepositWalletBatchMock).toHaveBeenCalledTimes(1);
      });

      it('gives up after five attempts and sweeps the residual stale balance', async () => {
        getLiveTokenBalanceMock.mockResolvedValue('1000000');

        const sweepPromise = sweepPolymarketDepositWallet(EOA_MOCK, messenger, {
          relayStatus: 'refund',
          preSubmitUsdceBalance: 1000000n,
        });

        await jest.advanceTimersByTimeAsync(4000);
        await sweepPromise;

        expect(getLiveTokenBalanceMock).toHaveBeenCalledTimes(5);
        expect(polymarketSubmitDepositWalletBatchMock).toHaveBeenCalledTimes(1);
      });
    });
  });
});
