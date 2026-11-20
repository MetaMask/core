import { StatusTypes } from '@metamask/bridge-controller';
import type {
  QuoteMetadata,
  QuoteResponseV1,
  TxData,
} from '@metamask/bridge-controller';
import { describe, expect, it } from 'vitest';

import {
  getControllerMessenger,
  getRootMessenger,
  registerDefaultActionHandlers,
} from '../__fixtures__/test-utils.js';
import { Operation } from '../types.js';
import type { BridgeHistoryItem } from '../types.js';
import { resolveValidQuotes } from './bridge.js';

const nativeAsset = {
  address: '0x0000000000000000000000000000000000000000',
  decimals: 18,
  symbol: 'ETH',
  chainId: 1,
  assetId: 'eip155:1/slip44:60' as const,
  name: 'Ether',
};

const cachedQuote = {
  quote: {
    requestId: 'quote-1',
    srcChainId: 1,
    destChainId: 1,
    srcTokenAmount: '1000000000000000000',
    destTokenAmount: '1000000000000000000',
    minDestTokenAmount: '950000000000000000',
    srcAsset: nativeAsset,
    destAsset: nativeAsset,
    destWalletAddress: '0xaccount1',
    slippage: 0.5,
    gasIncluded: false,
    gasIncluded7702: false,
    feeData: { metabridge: { amount: '0', asset: nativeAsset } },
    bridgeId: 'lifi',
    bridges: ['across'],
    steps: [],
  },
  trade: {
    from: '0xaccount1',
    to: '0xbridge',
    value: '0x0',
    data: '0x',
    chainId: 1,
    gasLimit: 21000,
  },
  estimatedProcessingTimeInSeconds: 15,
  sentAmount: { amount: '1', valueInCurrency: '1', usd: '1' },
  toTokenAmount: { amount: '1', valueInCurrency: '1', usd: '1' },
  minToTokenAmount: { amount: '1', valueInCurrency: '1', usd: '1' },
  totalNetworkFee: { amount: '0', valueInCurrency: '0', usd: '0' },
  gasFee: { total: { amount: '0', valueInCurrency: '0', usd: '0' } },
  adjustedReturn: { valueInCurrency: '1', usd: '1' },
  cost: { valueInCurrency: '0', usd: '0' },
  swapRate: '1',
} satisfies QuoteResponseV1<TxData> & QuoteMetadata;

const historyItem = (
  overrides: Partial<BridgeHistoryItem> = {},
): BridgeHistoryItem => ({
  txMetaId: 'tx-1',
  quote: cachedQuote.quote,
  startTime: Date.now(),
  estimatedProcessingTimeInSeconds: 15,
  slippagePercentage: 0.5,
  account: '0xaccount1',
  hasApprovalTx: false,
  status: {
    status: StatusTypes.PENDING,
    srcChain: { chainId: 1 },
  },
  ...overrides,
});

const setup = (
  fetchQuotes: () => Promise<(QuoteResponseV1<TxData> & QuoteMetadata)[]>,
): ReturnType<typeof getControllerMessenger> => {
  const rootMessenger = getRootMessenger();
  const messenger = getControllerMessenger(rootMessenger);
  registerDefaultActionHandlers(rootMessenger);
  rootMessenger.registerActionHandler(
    'BridgeController:fetchQuotes',
    fetchQuotes,
  );
  return messenger;
};

describe('resolveValidQuotes', () => {
  it('returns the cached quote when the follow-up is not a swap', async () => {
    const messenger = setup(async () => []);
    expect(
      await resolveValidQuotes(
        messenger,
        historyItem(),
        cachedQuote,
        Operation.DEPOSIT,
      ),
    ).toStrictEqual([cachedQuote]);
  });

  it('returns the cached quote when it is still fresh', async () => {
    const messenger = setup(async () => []);
    expect(
      await resolveValidQuotes(
        messenger,
        historyItem(),
        cachedQuote,
        Operation.SWAP,
      ),
    ).toStrictEqual([cachedQuote]);
  });

  it('refreshes with aggregator ids and returns the new quote', async () => {
    const quoteWithAggregator = {
      ...cachedQuote,
      quote: { ...cachedQuote.quote, aggregator: 'lifi' },
    };
    const messenger = setup(async () => [quoteWithAggregator]);
    const [quote] = await resolveValidQuotes(
      messenger,
      historyItem({ startTime: 0, quote: quoteWithAggregator.quote }),
      quoteWithAggregator,
      Operation.SWAP,
    );
    expect(quote).toBe(quoteWithAggregator);
  });

  it('throws when the refresh returns no quote', async () => {
    const messenger = setup(async () => []);
    await expect(
      resolveValidQuotes(
        messenger,
        historyItem({ startTime: 0 }),
        cachedQuote,
        Operation.SWAP,
      ),
    ).rejects.toThrow('Failed to refresh quote');
  });
});
