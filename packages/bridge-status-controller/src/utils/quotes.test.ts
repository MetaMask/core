import type {
  BridgeAsset,
  QuoteMetadata,
  QuoteResponseV1,
  TxData,
} from '@metamask/bridge-controller';
import { ActionTypes, toQuoteResponseV2 } from '@metamask/bridge-controller';
import type { CaipAssetType } from '@metamask/utils';
import { describe, expect, it } from 'vitest';

import { normalizeQuoteResponses } from './quotes.js';

const nativeAsset = (chainId: number): BridgeAsset => ({
  address: '0x0000000000000000000000000000000000000000',
  assetId: `eip155:${chainId}/slip44:60` as CaipAssetType,
  chainId,
  symbol: 'ETH',
  decimals: 18,
  name: 'ETH',
});

const v1Quote = {
  quote: {
    requestId: 'quote-1',
    srcChainId: 1,
    destChainId: 1,
    srcTokenAmount: '1000000000000000000',
    destTokenAmount: '1000000000000000000',
    minDestTokenAmount: '950000000000000000',
    srcAsset: nativeAsset(1),
    destAsset: nativeAsset(1),
    feeData: {
      metabridge: {
        amount: '0',
        asset: nativeAsset(1),
      },
    },
    bridgeId: 'lifi',
    bridges: ['across'],
    steps: [
      {
        action: ActionTypes.SWAP,
        srcChainId: 1,
        destChainId: 1,
        srcAsset: nativeAsset(1),
        destAsset: nativeAsset(1),
      },
    ],
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

describe('normalizeQuoteResponses', () => {
  it('returns v1 quotes unchanged', () => {
    expect(normalizeQuoteResponses([v1Quote])).toStrictEqual([v1Quote]);
  });

  it('converts v2 quotes to v1 with metadata', () => {
    const [normalized] = normalizeQuoteResponses([toQuoteResponseV2(v1Quote)]);

    expect(normalized.quote.srcChainId).toBe(1);
    expect(normalized.quote.destChainId).toBe(1);
    expect(normalized.sentAmount?.amount).toBe('1');
    expect(normalized.trade).toStrictEqual(v1Quote.trade);
  });
});
