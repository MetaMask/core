import { merge } from 'lodash';

import { getMockBridgeQuotesErc20Erc20V2 } from '../../../tests/mock-quotes-erc20-erc20.js';
import {
  getNativeAssetForChainId,
  toBridgeAssetV2,
  toQuoteMetadataV2,
} from '../../index.js';
import type { QuoteResponse } from '../../validators/quote-response.js';
import { mergeQuoteMetadata } from './merge.js';
import { toNormalizedAmounts } from './to-normalized-amounts.js';
import { QuoteMetadataMigrationPhase } from './types.js';
import type { QuoteMetadata } from './types.js';

const EMPTY_QUOTE = {
  quote: {
    src: {
      normalizedAmount: undefined,
      usd: undefined,
      valueInCurrency: undefined,
      amount: undefined,
    },
    dest: {
      minAmountNormalized: undefined,
      normalizedAmount: undefined,
      amount: undefined,
      minAmount: undefined,
      minAmountUsd: undefined,
      minAmountValueInCurrency: undefined,
      usd: undefined,
      valueInCurrency: undefined,
    },
    feeData: {
      network: undefined,
      relayer: undefined,
      txFee: undefined,
    },
    priceData: {
      swapRate: undefined,
    },
  },
};

const quoteResponseV2 = getMockBridgeQuotesErc20Erc20V2()[0];
const normalizedAmounts = toNormalizedAmounts(quoteResponseV2);

const v2PartialMetadata = {
  quote: {
    feeData: {
      relayer: [
        {
          amount: '100',
          usd: '100',
          asset: toBridgeAssetV2(getNativeAssetForChainId(10)),
        },
      ],
      txFee: [
        {
          amount: '100',
          usd: '100',
          asset: {
            decimals: 18,
            assetId:
              'eip155:10/erc20:0x0b2c639c533813f4aa9d7837caf62653d097ff85',
          },
        },
      ],
    },
  },
};

const v2Metadata = merge({}, v2PartialMetadata, {
  quote: {
    feeData: {
      network: [
        {
          amount: '100',
          usd: '100',
          asset: toBridgeAssetV2(getNativeAssetForChainId(10)),
        },
      ],
    },
  },
});

const partialLegacyQuoteMetadata = {
  relayerFee: {
    amount: '0.000000000000000105',
    valueInCurrency: '100',
    usd: '10',
  },
  includedTxFees: {
    amount: '0.000000000000000105',
    valueInCurrency: '100',
    usd: '10',
  },
};

const legacyQuoteMetadata = {
  ...partialLegacyQuoteMetadata,
  totalNetworkFee: {
    amount: '0.0000000000000004',
    usd: '400',
    valueInCurrency: '401',
  },
};

describe('mergeQuoteMetadata', () => {
  // PHASE 1
  it.each([
    {
      title: 'includes normalized amounts when quoteMetadata is empty',
      quoteResponse: quoteResponseV2,
      quoteMetadata: {},
      mergedQuote: merge({}, EMPTY_QUOTE, quoteResponseV2, normalizedAmounts),
    },
    {
      title: 'omits network fee when legacy metadata has no totalNetworkFee',
      quoteResponse: merge({}, quoteResponseV2, v2Metadata),
      quoteMetadata: partialLegacyQuoteMetadata,
      mergedQuote: merge(
        {},
        EMPTY_QUOTE,
        quoteResponseV2,
        partialLegacyQuoteMetadata,
        normalizedAmounts,
        toQuoteMetadataV2(
          partialLegacyQuoteMetadata,
          merge({}, quoteResponseV2, v2Metadata),
        ),
      ),
    },
    {
      title: 'includes network fee when legacy metadata has totalNetworkFee',
      quoteResponse: merge({}, quoteResponseV2, v2PartialMetadata),
      quoteMetadata: legacyQuoteMetadata,
      mergedQuote: merge(
        {},
        EMPTY_QUOTE,
        quoteResponseV2,
        legacyQuoteMetadata,
        normalizedAmounts,
        toQuoteMetadataV2(
          legacyQuoteMetadata,
          merge({}, quoteResponseV2, v2PartialMetadata),
        ),
      ),
    },
    {
      title: 'replaces network fee when legacy metadata has totalNetworkFee',
      quoteResponse: merge({}, quoteResponseV2, v2Metadata),
      quoteMetadata: legacyQuoteMetadata,
      mergedQuote: merge(
        {},
        EMPTY_QUOTE,
        quoteResponseV2,
        legacyQuoteMetadata,
        normalizedAmounts,
        toQuoteMetadataV2(
          legacyQuoteMetadata,
          merge({}, quoteResponseV2, v2Metadata),
        ),
      ),
    },
    {
      title: 'includes empty quote response when quoteResponse is invalid',
      quoteResponse: { a: 1 },
      quoteMetadata: { b: 2 } as QuoteMetadata,
      mergedQuote: { a: 1, b: 2, ...EMPTY_QUOTE },
    },
  ])(
    'merged quote $title (Phase 1)',
    ({ quoteResponse, quoteMetadata, mergedQuote }) => {
      expect(
        mergeQuoteMetadata(
          quoteResponse as QuoteResponse,
          quoteMetadata,
          QuoteMetadataMigrationPhase.V1Data,
        ),
      ).toStrictEqual(mergedQuote);
    },
  );

  // PHASE 1.5
  it.each([
    {
      title: 'includes normalized amounts when quoteMetadata is empty',
      quoteResponse: quoteResponseV2,
      quoteMetadata: {},
      mergedQuote: merge({}, EMPTY_QUOTE, quoteResponseV2, normalizedAmounts),
    },
    {
      title: 'includes nested network fee',
      quoteResponse: merge({}, quoteResponseV2, v2Metadata),
      quoteMetadata: partialLegacyQuoteMetadata,
      mergedQuote: merge(
        {},
        EMPTY_QUOTE,
        quoteResponseV2,
        partialLegacyQuoteMetadata,
        toQuoteMetadataV2(
          partialLegacyQuoteMetadata,
          merge({}, quoteResponseV2, v2Metadata),
        ),
        toNormalizedAmounts(merge({}, quoteResponseV2, v2Metadata)),
        v2Metadata,
      ),
    },
    {
      title: 'includes legacy network fee when nested network fee is undefined',
      quoteResponse: merge({}, quoteResponseV2, v2PartialMetadata),
      quoteMetadata: legacyQuoteMetadata,
      mergedQuote: merge(
        {},
        EMPTY_QUOTE,
        quoteResponseV2,
        legacyQuoteMetadata,
        toQuoteMetadataV2(
          legacyQuoteMetadata,
          merge({}, quoteResponseV2, v2PartialMetadata),
        ),
        toNormalizedAmounts(merge({}, quoteResponseV2, v2PartialMetadata)),
        v2PartialMetadata,
      ),
    },
    {
      title: 'replaces legacy network fee when metadata has network fee',
      quoteResponse: merge({}, quoteResponseV2, v2Metadata),
      quoteMetadata: legacyQuoteMetadata,
      mergedQuote: merge(
        {},
        EMPTY_QUOTE,
        quoteResponseV2,
        legacyQuoteMetadata,
        toQuoteMetadataV2(
          legacyQuoteMetadata,
          merge({}, quoteResponseV2, v2Metadata),
        ),
        toNormalizedAmounts(merge({}, quoteResponseV2, v2Metadata)),
        v2Metadata,
      ),
    },
    {
      title: 'includes empty quote response when quoteResponse is invalid',
      quoteResponse: { a: 1 },
      quoteMetadata: { b: 2 } as QuoteMetadata,
      mergedQuote: { a: 1, b: 2, ...EMPTY_QUOTE },
    },
  ])(
    'merged quote $title (Phase 1.5)',
    ({ quoteResponse, quoteMetadata, mergedQuote }) => {
      expect(
        mergeQuoteMetadata(
          quoteResponse as QuoteResponse,
          quoteMetadata,
          QuoteMetadataMigrationPhase.V2WithV1Fallback,
        ),
      ).toStrictEqual(mergedQuote);
    },
  );

  // PHASE 2
  it.each([
    {
      title: 'includes normalized amounts when quoteMetadata is empty',
      quoteResponse: quoteResponseV2,
      quoteMetadata: {},
      mergedQuote: merge({}, quoteResponseV2, normalizedAmounts),
    },
    {
      title: 'only includes nested network fee',
      quoteResponse: merge({}, quoteResponseV2, v2Metadata),
      quoteMetadata: legacyQuoteMetadata,
      mergedQuote: merge(
        {},
        quoteResponseV2,
        v2Metadata,
        toNormalizedAmounts(merge({}, quoteResponseV2, v2Metadata)),
      ),
    },
    {
      title: 'excludes network fee when nested network fee is undefined',
      quoteResponse: merge({}, quoteResponseV2, v2PartialMetadata),
      quoteMetadata: legacyQuoteMetadata,
      mergedQuote: merge(
        {},
        quoteResponseV2,
        toNormalizedAmounts(merge({}, quoteResponseV2, v2PartialMetadata)),
        v2PartialMetadata,
      ),
    },
    {
      title: 'includes empty quote response when quoteResponse is invalid',
      quoteResponse: { a: 1 },
      quoteMetadata: { b: 2 } as QuoteMetadata,
      mergedQuote: { a: 1, ...toNormalizedAmounts({}) },
    },
  ])(
    'merged quote $title (Phase 2)',
    ({ quoteResponse, quoteMetadata, mergedQuote }) => {
      expect(
        mergeQuoteMetadata(
          quoteResponse as QuoteResponse,
          quoteMetadata,
          QuoteMetadataMigrationPhase.V2Only,
        ),
      ).toStrictEqual(mergedQuote);
    },
  );
});
