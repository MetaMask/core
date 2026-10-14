import { Interface } from '@ethersproject/abi';
import { TransactionType } from '@metamask/transaction-controller';
import type { TransactionMeta } from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';

import {
  POLYGON_PUSD_ADDRESS,
  POLYGON_USDCE_ADDRESS,
} from '../../constants.js';
import { getMessengerMock } from '../../tests/messenger-mock.js';
import type { QuoteRequest } from '../../types.js';
import { getLiveTokenBalance } from '../token.js';
import {
  POLYMARKET_COLLATERAL_OFFRAMP_POLYGON,
  POLYMARKET_COLLATERAL_ONRAMP_POLYGON,
} from './constants.js';
import {
  buildPolymarketDepositWalletSimulation,
  getPolymarketDepositWalletOverrides,
  getPredictWithdrawFeeTokenAccount,
  getPredictWithdrawSafeAddress,
  isPredictWithdraw,
  submitPolymarketWithdraw,
  sweepPolymarketDepositWallet,
} from './withdraw.js';
import type { DepositWalletWithdrawRequest } from './withdraw.js';

jest.mock('../token');

const DEPOSIT_ADDRESS_MOCK =
  '0x1234567890123456789012345678901234567890' as Hex;
const DEPOSIT_WALLET_MOCK = '0x2222222222222222222222222222222222222222' as Hex;
const EOA_MOCK = '0x1111111111111111111111111111111111111111' as Hex;
const SOURCE_AMOUNT_RAW_MOCK = '1000000';
const SOURCE_HASH_MOCK: Hex = `0x${'aa'.repeat(32)}`;

// transfer(DEPOSIT_ADDRESS_MOCK, 1000000000)
const TRANSFER_CALLDATA_MOCK =
  '0xa9059cbb0000000000000000000000001234567890123456789012345678901234567890000000000000000000000000000000000000000000000000000000003b9aca00' as Hex;

const WITHDRAW_TRANSACTION_MOCK = {
  type: TransactionType.predictWithdraw,
} as TransactionMeta;

describe('Polymarket withdraw', () => {
  const {
    messenger,
    polymarketGetDepositWalletAddressMock,
    polymarketSubmitDepositWalletBatchMock,
  } = getMessengerMock();
  const getLiveTokenBalanceMock = jest.mocked(getLiveTokenBalance);

  function buildRequest(
    overrides: Partial<DepositWalletWithdrawRequest> = {},
  ): DepositWalletWithdrawRequest {
    return {
      depositData: TRANSFER_CALLDATA_MOCK,
      from: EOA_MOCK,
      messenger,
      sourceAmountRaw: SOURCE_AMOUNT_RAW_MOCK,
      ...overrides,
    };
  }

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

  describe('getPolymarketDepositWalletOverrides', () => {
    it('returns the deposit wallet and USDC.e as the source token', async () => {
      const result = await getPolymarketDepositWalletOverrides(
        EOA_MOCK,
        messenger,
      );

      expect(polymarketGetDepositWalletAddressMock).toHaveBeenCalledWith({
        eoa: EOA_MOCK,
      });
      expect(result).toStrictEqual({
        depositWallet: DEPOSIT_WALLET_MOCK,
        sourceTokenAddress: POLYGON_USDCE_ADDRESS,
      });
    });
  });

  describe('submitPolymarketWithdraw', () => {
    it('submits the approve + unwrap batch via the relayer callback', async () => {
      const result = await submitPolymarketWithdraw(buildRequest());

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

      const result = await submitPolymarketWithdraw(buildRequest());

      expect(result.preSubmitUsdceBalance).toBe(2500000n);
    });

    it('defaults pre-submit balance to zero when the balance read fails', async () => {
      getLiveTokenBalanceMock.mockRejectedValue(new Error('rpc down'));

      const result = await submitPolymarketWithdraw(buildRequest());

      expect(result.preSubmitUsdceBalance).toBe(0n);
    });

    it('throws without submitting when there is no deposit calldata', async () => {
      await expect(
        submitPolymarketWithdraw(buildRequest({ depositData: undefined })),
      ).rejects.toThrow('quote has no deposit step calldata');

      expect(polymarketSubmitDepositWalletBatchMock).not.toHaveBeenCalled();
    });
  });

  describe('sweepPolymarketDepositWallet', () => {
    const successOptions = {
      from: EOA_MOCK,
      isRefund: false,
      messenger,
      preSubmitUsdceBalance: 0n,
    };

    it('wraps any USDC.e balance back into pUSD on the deposit wallet', async () => {
      getLiveTokenBalanceMock.mockResolvedValue('5000000');

      await sweepPolymarketDepositWallet(successOptions);

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

      await sweepPolymarketDepositWallet(successOptions);

      expect(polymarketSubmitDepositWalletBatchMock).not.toHaveBeenCalled();
    });

    it('does not throw when the balance read fails', async () => {
      getLiveTokenBalanceMock.mockRejectedValue(new Error('rpc down'));

      expect(
        await sweepPolymarketDepositWallet(successOptions),
      ).toBeUndefined();
      expect(polymarketSubmitDepositWalletBatchMock).not.toHaveBeenCalled();
    });

    it('does not throw when the wrap-back batch submission fails', async () => {
      getLiveTokenBalanceMock.mockResolvedValue('5000000');
      polymarketSubmitDepositWalletBatchMock.mockRejectedValueOnce(
        new Error('relayer down'),
      );

      expect(
        await sweepPolymarketDepositWallet(successOptions),
      ).toBeUndefined();
    });

    describe('when the withdraw was refunded', () => {
      const refundOptions = {
        ...successOptions,
        isRefund: true,
        preSubmitUsdceBalance: 1000000n,
      };

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

        const sweepPromise = sweepPolymarketDepositWallet(refundOptions);

        await jest.advanceTimersByTimeAsync(5000);
        await sweepPromise;

        expect(getLiveTokenBalanceMock).toHaveBeenCalledTimes(3);
        expect(polymarketSubmitDepositWalletBatchMock).toHaveBeenCalledTimes(1);
        const call = polymarketSubmitDepositWalletBatchMock.mock.calls[0][0];
        expect(call.calls[1].target).toBe(POLYMARKET_COLLATERAL_ONRAMP_POLYGON);
      });

      it('gives up after five attempts and sweeps the residual stale balance', async () => {
        getLiveTokenBalanceMock.mockResolvedValue('1000000');

        const sweepPromise = sweepPolymarketDepositWallet(refundOptions);

        await jest.advanceTimersByTimeAsync(4000);
        await sweepPromise;

        expect(getLiveTokenBalanceMock).toHaveBeenCalledTimes(5);
        expect(polymarketSubmitDepositWalletBatchMock).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('isPredictWithdraw', () => {
    it('returns true for a post-quote predict withdraw', () => {
      expect(
        isPredictWithdraw(
          { isPostQuote: true } as QuoteRequest,
          WITHDRAW_TRANSACTION_MOCK,
        ),
      ).toBe(true);
    });

    it('returns false when not post-quote', () => {
      expect(
        isPredictWithdraw({} as QuoteRequest, WITHDRAW_TRANSACTION_MOCK),
      ).toBe(false);
    });

    it('returns false when the transaction is not a predict withdraw', () => {
      expect(
        isPredictWithdraw(
          { isPostQuote: true } as QuoteRequest,
          {
            type: TransactionType.simpleSend,
          } as TransactionMeta,
        ),
      ).toBe(false);
    });
  });

  describe('getPredictWithdrawSafeAddress', () => {
    const safeRequest = {
      isPostQuote: true,
      refundTo: DEPOSIT_WALLET_MOCK,
    } as QuoteRequest;

    it('returns refundTo for a deposit-style predict withdraw', () => {
      expect(
        getPredictWithdrawSafeAddress(
          safeRequest,
          WITHDRAW_TRANSACTION_MOCK,
          true,
        ),
      ).toBe(DEPOSIT_WALLET_MOCK);
    });

    it('returns undefined for the deposit-wallet variant (handled by its own simulation)', () => {
      expect(
        getPredictWithdrawSafeAddress(
          { ...safeRequest, isPolymarketDepositWallet: true },
          WITHDRAW_TRANSACTION_MOCK,
          true,
        ),
      ).toBeUndefined();
    });

    it('returns undefined for swap-only routes (no deposit step)', () => {
      expect(
        getPredictWithdrawSafeAddress(
          safeRequest,
          WITHDRAW_TRANSACTION_MOCK,
          false,
        ),
      ).toBeUndefined();
    });

    it('returns undefined when not a predict withdraw', () => {
      expect(
        getPredictWithdrawSafeAddress(
          safeRequest,
          { type: TransactionType.simpleSend } as TransactionMeta,
          true,
        ),
      ).toBeUndefined();
    });
  });

  describe('getPredictWithdrawFeeTokenAccount', () => {
    it('returns refundTo for a predict withdraw', () => {
      expect(
        getPredictWithdrawFeeTokenAccount(
          { isPostQuote: true, refundTo: DEPOSIT_WALLET_MOCK } as QuoteRequest,
          WITHDRAW_TRANSACTION_MOCK,
        ),
      ).toBe(DEPOSIT_WALLET_MOCK);
    });

    it('returns undefined when not a predict withdraw', () => {
      expect(
        getPredictWithdrawFeeTokenAccount(
          { refundTo: DEPOSIT_WALLET_MOCK } as QuoteRequest,
          WITHDRAW_TRANSACTION_MOCK,
        ),
      ).toBeUndefined();
    });
  });

  describe('buildPolymarketDepositWalletSimulation', () => {
    it('simulates the real approve + unwrap batch from the deposit wallet', async () => {
      const simulation =
        await buildPolymarketDepositWalletSimulation(buildRequest());

      expect(polymarketGetDepositWalletAddressMock).toHaveBeenCalledWith({
        eoa: EOA_MOCK,
      });
      expect(simulation.transactions).toHaveLength(2);

      const [approve, unwrap] = simulation.transactions;

      expect(approve.from).toBe(DEPOSIT_WALLET_MOCK);
      expect(approve.to).toBe(POLYGON_PUSD_ADDRESS);
      expect(approve.value).toBe('0x0');

      expect(unwrap.from).toBe(DEPOSIT_WALLET_MOCK);
      expect(unwrap.to).toBe(POLYMARKET_COLLATERAL_OFFRAMP_POLYGON);
      expect(unwrap.value).toBe('0x0');
    });

    it('approves the offramp and unwraps the source amount to the deposit address', async () => {
      const simulation =
        await buildPolymarketDepositWalletSimulation(buildRequest());

      const [approve, unwrap] = simulation.transactions;

      const decodedApprove = new Interface([
        'function approve(address spender, uint256 amount)',
      ]).decodeFunctionData('approve', approve.data as Hex);

      expect(decodedApprove[0].toLowerCase()).toBe(
        POLYMARKET_COLLATERAL_OFFRAMP_POLYGON.toLowerCase(),
      );
      expect(decodedApprove[1].toString()).toBe(SOURCE_AMOUNT_RAW_MOCK);

      const decodedUnwrap = new Interface([
        'function unwrap(address asset, address recipient, uint256 amount)',
      ]).decodeFunctionData('unwrap', unwrap.data as Hex);

      expect(decodedUnwrap[0].toLowerCase()).toBe(
        POLYGON_USDCE_ADDRESS.toLowerCase(),
      );
      expect(decodedUnwrap[1].toLowerCase()).toBe(
        DEPOSIT_ADDRESS_MOCK.toLowerCase(),
      );
      expect(decodedUnwrap[2].toString()).toBe(SOURCE_AMOUNT_RAW_MOCK);
    });

    it('throws when there is no deposit calldata', async () => {
      await expect(
        buildPolymarketDepositWalletSimulation(
          buildRequest({ depositData: undefined }),
        ),
      ).rejects.toThrow('quote has no deposit step calldata');
    });
  });
});
