import type { Hex } from '@metamask/utils';

import type {
  QuoteRequest,
  TransactionPayControllerMessenger,
} from '../../types';
import { getHyperliquidActivationFeeConfig } from '../../utils/feature-flags';
import { HYPERLIQUID_INFO_URL } from './constants';
import type { HyperLiquidLedgerUpdate } from './hyperliquid-activation';
import {
  applyHyperliquidActivationFee,
  isHyperLiquidAccountActivated,
} from './hyperliquid-activation';

jest.mock('../../utils/feature-flags', () => ({
  getHyperliquidActivationFeeConfig: jest.fn(),
}));

const ADDRESS_MOCK = '0xe09d44a3495dab36d37b787e6150e08b54e1ac2d' as Hex;
const OTHER_ADDRESS_MOCK = '0x6b9e773128f453f5c2c60935ee2de2cbc5390a24';
const MESSENGER_MOCK = {} as TransactionPayControllerMessenger;

// HyperCore USDC has 8 decimals: $4.80 = 480000000, $1.00 fee = 100000000.
const SOURCE_AMOUNT_MOCK = '480000000';
const REDUCED_AMOUNT_MOCK = '380000000';

const HYPERLIQUID_SOURCE_REQUEST_MOCK: QuoteRequest = {
  from: ADDRESS_MOCK,
  isHyperliquidSource: true,
  isPostQuote: true,
  sourceBalanceRaw: SOURCE_AMOUNT_MOCK,
  sourceChainId: '0x539',
  sourceTokenAddress: '0x00000000000000000000000000000000' as Hex,
  sourceTokenAmount: SOURCE_AMOUNT_MOCK,
  targetAmountMinimum: '0',
  targetChainId: '0xa4b1',
  targetTokenAddress: '0xaf88d065e77c8cc2239327c5edb3a432268e5831' as Hex,
};

/**
 * An inbound `send` (funds received from another account) - does not activate
 * unless it created the account and carries the activation fee.
 *
 * @param fee - Optional fee recorded on the transfer.
 * @param time - Optional entry timestamp.
 * @returns A ledger update representing an inbound send.
 */
function inboundSend(fee?: string, time?: number): HyperLiquidLedgerUpdate {
  return {
    time,
    delta: {
      type: 'send',
      user: OTHER_ADDRESS_MOCK,
      destination: ADDRESS_MOCK,
      ...(fee === undefined ? {} : { fee }),
    },
  };
}

/**
 * An outbound `send` initiated by the account - activates.
 *
 * @returns A ledger update representing an outbound send.
 */
function outboundSend(): HyperLiquidLedgerUpdate {
  return {
    delta: {
      type: 'send',
      user: ADDRESS_MOCK,
      destination: OTHER_ADDRESS_MOCK,
    },
  };
}

describe('HyperLiquid Activation', () => {
  let fetchMock: jest.SpyInstance;
  const getConfigMock = jest.mocked(getHyperliquidActivationFeeConfig);

  beforeEach(() => {
    jest.resetAllMocks();
    fetchMock = jest.spyOn(global, 'fetch');
    getConfigMock.mockReturnValue({ enabled: true, amountUsd: 1 });
  });

  afterEach(() => {
    fetchMock.mockRestore();
  });

  describe('isHyperLiquidAccountActivated', () => {
    it('returns false when the address is empty', () => {
      expect(isHyperLiquidAccountActivated([outboundSend()], '')).toBe(false);
    });

    it('returns false for an empty ledger', () => {
      expect(isHyperLiquidAccountActivated([], ADDRESS_MOCK)).toBe(false);
    });

    it('returns false for a deposit-only ledger', () => {
      expect(
        isHyperLiquidAccountActivated(
          [{ delta: { type: 'deposit' } }],
          ADDRESS_MOCK,
        ),
      ).toBe(false);
    });

    it('returns false for an inbound send (funds received)', () => {
      expect(isHyperLiquidAccountActivated([inboundSend()], ADDRESS_MOCK)).toBe(
        false,
      );
    });

    it('returns false when an entry has no delta type', () => {
      expect(
        isHyperLiquidAccountActivated([{ delta: {} }, {}], ADDRESS_MOCK),
      ).toBe(false);
    });

    it('returns true for an outbound send', () => {
      expect(
        isHyperLiquidAccountActivated([outboundSend()], ADDRESS_MOCK),
      ).toBe(true);
    });

    it('returns true for an outbound spotTransfer', () => {
      expect(
        isHyperLiquidAccountActivated(
          [
            {
              delta: {
                type: 'spotTransfer',
                user: ADDRESS_MOCK,
                destination: OTHER_ADDRESS_MOCK,
              },
            },
          ],
          ADDRESS_MOCK,
        ),
      ).toBe(true);
    });

    it('returns false for a bridge withdraw', () => {
      // Bridge withdrawals do not settle the spot activation fee.
      expect(
        isHyperLiquidAccountActivated(
          [{ delta: { type: 'withdraw' } }],
          ADDRESS_MOCK,
        ),
      ).toBe(false);
    });

    it('returns true when the creation entry carries the activation fee', () => {
      expect(
        isHyperLiquidAccountActivated([inboundSend('1.0')], ADDRESS_MOCK),
      ).toBe(true);
    });

    it('returns true when the earliest of several entries carries the activation fee', () => {
      expect(
        isHyperLiquidAccountActivated(
          [inboundSend('0.0', 300), inboundSend('1.0', 100)],
          ADDRESS_MOCK,
        ),
      ).toBe(true);
    });

    it('returns false when only a later entry carries a fee', () => {
      // A fee on a non-creation inbound entry belongs to the sender's own
      // first-send activation, not to this account.
      expect(
        isHyperLiquidAccountActivated(
          [{ time: 100, delta: { type: 'deposit' } }, inboundSend('1.0', 200)],
          ADDRESS_MOCK,
        ),
      ).toBe(false);
    });

    it('returns false when the creation entry fee is below the activation fee', () => {
      expect(
        isHyperLiquidAccountActivated([inboundSend('0.001231')], ADDRESS_MOCK),
      ).toBe(false);
    });

    it('returns false when the creation entry fee is not numeric', () => {
      expect(
        isHyperLiquidAccountActivated([inboundSend('abc')], ADDRESS_MOCK),
      ).toBe(false);
    });

    it('matches the address case-insensitively', () => {
      expect(
        isHyperLiquidAccountActivated(
          [
            {
              delta: {
                type: 'send',
                user: ADDRESS_MOCK.toUpperCase(),
                destination: OTHER_ADDRESS_MOCK,
              },
            },
          ],
          ADDRESS_MOCK,
        ),
      ).toBe(true);
    });
  });

  describe('applyHyperliquidActivationFee', () => {
    it('returns the request unchanged when not a HyperLiquid source', async () => {
      const request: QuoteRequest = {
        ...HYPERLIQUID_SOURCE_REQUEST_MOCK,
        isHyperliquidSource: false,
      };

      const result = await applyHyperliquidActivationFee(
        request,
        MESSENGER_MOCK,
      );

      expect(result).toStrictEqual(request);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('returns the request unchanged when the feature is disabled', async () => {
      getConfigMock.mockReturnValue({ enabled: false, amountUsd: 1 });

      const result = await applyHyperliquidActivationFee(
        HYPERLIQUID_SOURCE_REQUEST_MOCK,
        MESSENGER_MOCK,
      );

      expect(result).toStrictEqual(HYPERLIQUID_SOURCE_REQUEST_MOCK);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('returns the request unchanged when the account is activated', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => [outboundSend()],
      } as never);

      const result = await applyHyperliquidActivationFee(
        HYPERLIQUID_SOURCE_REQUEST_MOCK,
        MESSENGER_MOCK,
      );

      expect(result).toStrictEqual(HYPERLIQUID_SOURCE_REQUEST_MOCK);
    });

    it('reserves the fee for an unactivated account', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => [inboundSend()],
      } as never);

      const result = await applyHyperliquidActivationFee(
        HYPERLIQUID_SOURCE_REQUEST_MOCK,
        MESSENGER_MOCK,
      );

      expect(result.sourceTokenAmount).toBe(REDUCED_AMOUNT_MOCK);
      expect(result.hyperliquidActivationFeeUsd).toBe('1');
    });

    it('queries the HyperLiquid info endpoint with the account address', async () => {
      fetchMock.mockResolvedValue({ ok: true, json: async () => [] } as never);

      await applyHyperliquidActivationFee(
        HYPERLIQUID_SOURCE_REQUEST_MOCK,
        MESSENGER_MOCK,
      );

      expect(fetchMock).toHaveBeenCalledWith(
        HYPERLIQUID_INFO_URL,
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            type: 'userNonFundingLedgerUpdates',
            user: ADDRESS_MOCK,
            startTime: 0,
          }),
        }),
      );
    });

    it('reserves a custom fee amount from the feature flag', async () => {
      getConfigMock.mockReturnValue({ enabled: true, amountUsd: 2 });
      fetchMock.mockResolvedValue({ ok: true, json: async () => [] } as never);

      const result = await applyHyperliquidActivationFee(
        HYPERLIQUID_SOURCE_REQUEST_MOCK,
        MESSENGER_MOCK,
      );

      // $4.80 - $2.00 = $2.80 = 280000000 (8 decimals).
      expect(result.sourceTokenAmount).toBe('280000000');
      expect(result.hyperliquidActivationFeeUsd).toBe('2');
    });

    it('returns the request unchanged when the amount does not exceed the fee', async () => {
      fetchMock.mockResolvedValue({ ok: true, json: async () => [] } as never);

      const request: QuoteRequest = {
        ...HYPERLIQUID_SOURCE_REQUEST_MOCK,
        sourceTokenAmount: '100000000',
      };

      const result = await applyHyperliquidActivationFee(
        request,
        MESSENGER_MOCK,
      );

      expect(result).toStrictEqual(request);
    });

    it('reserves the fee when the info request throws', async () => {
      fetchMock.mockRejectedValue(new Error('network'));

      const result = await applyHyperliquidActivationFee(
        HYPERLIQUID_SOURCE_REQUEST_MOCK,
        MESSENGER_MOCK,
      );

      expect(result.sourceTokenAmount).toBe(REDUCED_AMOUNT_MOCK);
      expect(result.hyperliquidActivationFeeUsd).toBe('1');
    });

    it('reserves the fee when the info request is not ok', async () => {
      fetchMock.mockResolvedValue({ ok: false, status: 500 } as never);

      const result = await applyHyperliquidActivationFee(
        HYPERLIQUID_SOURCE_REQUEST_MOCK,
        MESSENGER_MOCK,
      );

      expect(result.sourceTokenAmount).toBe(REDUCED_AMOUNT_MOCK);
      expect(result.hyperliquidActivationFeeUsd).toBe('1');
    });

    it('resolves the config for the given transaction type', async () => {
      fetchMock.mockResolvedValue({ ok: true, json: async () => [] } as never);

      await applyHyperliquidActivationFee(
        HYPERLIQUID_SOURCE_REQUEST_MOCK,
        MESSENGER_MOCK,
        'perpsWithdraw',
      );

      expect(getConfigMock).toHaveBeenCalledWith(
        MESSENGER_MOCK,
        'perpsWithdraw',
      );
    });
  });
});
