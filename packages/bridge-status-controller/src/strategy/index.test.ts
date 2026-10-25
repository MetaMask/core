import { ChainId } from '@metamask/bridge-controller';
import type {
  BatchSellTradesResponse,
  QuoteMetadata,
  QuoteResponseV1,
  Trade,
} from '@metamask/bridge-controller';
import { describe, expect, it, vi } from 'vitest';

import { submitBatchSellHandler } from './batch-sell-strategy.js';
import { submitBatchHandler } from './batch-strategy.js';
import { submitEvmHandler } from './evm-strategy.js';
import executeSubmitStrategy from './index.js';
import { submitIntentHandler } from './intent-strategy.js';
import { submitNonEvmHandler } from './non-evm-strategy.js';
import type { SubmitStrategyParams } from './types.js';

vi.mock(import('./batch-sell-strategy.js'), () => ({
  submitBatchSellHandler: vi.fn(),
}));
vi.mock(import('./batch-strategy.js'), () => ({
  submitBatchHandler: vi.fn(),
}));
vi.mock(import('./evm-strategy.js'), () => ({
  submitEvmHandler: vi.fn(),
}));
vi.mock(import('./intent-strategy.js'), () => ({
  submitIntentHandler: vi.fn(),
}));
vi.mock(import('./non-evm-strategy.js'), () => ({
  submitNonEvmHandler: vi.fn(),
}));

const EVM_TX = {
  chainId: 1,
  data: '0x',
  from: '0x0000000000000000000000000000000000000001',
  to: '0x0000000000000000000000000000000000000002',
  value: '0x0',
  gasLimit: 21000,
};

/**
 * Builds the parameters for `executeSubmitStrategy` with a single quote.
 *
 * @param options - The options.
 * @param options.srcChainId - The source chain of the quote.
 * @param options.trade - The trade of the quote.
 * @param options.approval - The approval of the quote.
 * @param options.quote - Extra properties of the quote.
 * @param options.params - Extra properties of the parameters.
 * @returns The parameters.
 */
function buildParams({
  srcChainId = ChainId.ETH,
  trade = EVM_TX,
  approval,
  quote = {},
  params = {},
}: {
  srcChainId?: ChainId;
  trade?: unknown;
  approval?: unknown;
  quote?: Record<string, unknown>;
  params?: Partial<SubmitStrategyParams<Trade>>;
} = {}): SubmitStrategyParams<Trade> {
  return {
    batchSellTrades: undefined,
    isDelegatedAccount: false,
    isStxEnabled: false,
    quoteResponses: [
      {
        quote: { srcChainId, ...quote },
        trade,
        approval,
      } as unknown as QuoteResponseV1<Trade, Trade> & QuoteMetadata,
    ],
    ...params,
  } as SubmitStrategyParams<Trade>;
}

describe('executeSubmitStrategy', () => {
  describe('non-EVM transactions', () => {
    it.each([
      { chain: 'Solana', srcChainId: ChainId.SOLANA, trade: 'base64-tx' },
      {
        chain: 'Bitcoin',
        srcChainId: ChainId.BTC,
        trade: { unsignedPsbtBase64: 'psbt' },
      },
      { chain: 'Stellar', srcChainId: ChainId.STELLAR, trade: 'xdr-string' },
      {
        chain: 'Stellar',
        srcChainId: ChainId.STELLAR,
        trade: { xdrBase64: 'xdr' },
      },
      {
        chain: 'Tron',
        srcChainId: ChainId.TRON,
        trade: { raw_data_hex: '0x1234' },
      },
    ])(
      'submits a $chain trade with the non-EVM handler',
      ({ srcChainId, trade }) => {
        const result = {} as ReturnType<typeof submitNonEvmHandler>;
        vi.mocked(submitNonEvmHandler).mockReturnValue(result);
        const params = buildParams({ srcChainId, trade });

        expect(executeSubmitStrategy(params)).toBe(result);
        expect(submitNonEvmHandler).toHaveBeenCalledWith(params);
        expect(submitEvmHandler).not.toHaveBeenCalled();
      },
    );

    it.each([
      { chain: 'Solana', srcChainId: ChainId.SOLANA, trade: EVM_TX },
      { chain: 'Bitcoin', srcChainId: ChainId.BTC, trade: 'base64-tx' },
      { chain: 'Stellar', srcChainId: ChainId.STELLAR, trade: EVM_TX },
      { chain: 'Tron', srcChainId: ChainId.TRON, trade: EVM_TX },
    ])(
      'throws when a $chain quote does not contain a $chain trade',
      ({ srcChainId, trade }) => {
        expect(() =>
          executeSubmitStrategy(buildParams({ srcChainId, trade })),
        ).toThrow(
          'Failed to submit cross-chain swap transaction: trade is not a non-EVM transaction',
        );
        expect(submitNonEvmHandler).not.toHaveBeenCalled();
      },
    );
  });

  describe('EVM transactions', () => {
    it('throws when an EVM quote does not contain an EVM trade', () => {
      expect(() =>
        executeSubmitStrategy(buildParams({ trade: 'base64-tx' })),
      ).toThrow(
        'Failed to submit cross-chain swap transaction: trade is not an EVM transaction',
      );
      expect(submitEvmHandler).not.toHaveBeenCalled();
    });

    it('throws when an EVM quote contains a non-EVM approval', () => {
      expect(() =>
        executeSubmitStrategy(buildParams({ approval: 'base64-tx' })),
      ).toThrow(
        'Failed to submit cross-chain swap transaction: trade is not an EVM transaction',
      );
    });

    it('submits an intent quote with the intent handler', () => {
      const params = buildParams({
        quote: { intent: { protocol: 'cowswap' } },
      });

      executeSubmitStrategy(params);

      expect(submitIntentHandler).toHaveBeenCalledWith(params);
      expect(submitEvmHandler).not.toHaveBeenCalled();
    });

    it('submits a batch sell with the batch sell handler', () => {
      const params = buildParams({
        params: {
          batchSellTrades: {} as BatchSellTradesResponse,
        },
      });

      executeSubmitStrategy(params);

      expect(submitBatchSellHandler).toHaveBeenCalledWith(params);
      expect(submitEvmHandler).not.toHaveBeenCalled();
    });

    it.each([
      { reason: 'STX is enabled', params: { isStxEnabled: true }, quote: {} },
      {
        reason: 'the quote includes 7702 gas',
        params: {},
        quote: { gasIncluded7702: true },
      },
      {
        reason: 'the account is delegated',
        params: { isDelegatedAccount: true },
        quote: {},
      },
    ])('submits a batch when $reason', ({ params: extraParams, quote }) => {
      const params = buildParams({ params: extraParams, quote });

      executeSubmitStrategy(params);

      expect(submitBatchHandler).toHaveBeenCalledWith(params);
      expect(submitEvmHandler).not.toHaveBeenCalled();
    });

    it('submits an approval and trade with the EVM handler by default', () => {
      const result = {} as ReturnType<typeof submitEvmHandler>;
      vi.mocked(submitEvmHandler).mockReturnValue(result);
      const params = buildParams({ approval: EVM_TX });

      expect(executeSubmitStrategy(params)).toBe(result);
      expect(submitEvmHandler).toHaveBeenCalledWith(params);
      expect(submitBatchHandler).not.toHaveBeenCalled();
      expect(submitIntentHandler).not.toHaveBeenCalled();
      expect(submitBatchSellHandler).not.toHaveBeenCalled();
    });
  });
});
