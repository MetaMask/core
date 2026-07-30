import { Failure, StructError } from '@metamask/superstruct';
import { KnownCaipNamespace } from '@metamask/utils';

import { mockBridgeQuotesErc20Erc20V2Migration } from '../../tests/mock-quotes-erc20-erc20-migration-v2.js';
import { mockBridgeQuotesErc20Erc20V1 } from '../../tests/mock-quotes-erc20-erc20.js';
import { mergeQuoteMetadata } from '../utils/quote-metadata/merge.js';
import { toQuoteMetadataV1 } from '../utils/quote-metadata/to-quote-metadata-v1.js';
import { formatStructErrors } from '../utils/struct-error.js';
import { toQuoteResponseV2 } from './quote-response-v1-to-v2.js';
import { toQuoteResponseV1 } from './quote-response-v2-to-v1.js';

const MOCK_QUOTE_METADATA = {
  adjustedReturn: {
    usd: '2.08686',
    valueInCurrency: '419.98686',
  },
  cost: {
    usd: '8.91314',
    valueInCurrency: '1758.01314',
  },
  minToTokenAmount: {
    amount: '13.7',
    usd: undefined,
    valueInCurrency: undefined,
  },
  sentAmount: {
    amount: '14',
    usd: '11',
    valueInCurrency: '2178',
  },
  swapRate: '1.90909090909090909091',
  toTokenAmount: {
    amount: '13.984280',
    usd: '2.1',
    valueInCurrency: '420',
  },
  totalNetworkFee: {
    amount: '0.0000073',
    usd: '0.01314',
    valueInCurrency: '0.01314',
  },
  gasFee: {
    total: {
      amount: '0.000007',
      usd: '0.0131',
      valueInCurrency: '0.0131',
    },
  },
  relayerFee: {
    amount: '0.000003',
    usd: '0.00004',
    valueInCurrency: '0.00004',
  },
  priceImpact: {
    valueInCurrency: '10',
    usd: '10',
  },
};

describe('quote-response-v1 compatibility', () => {
  describe('toQuoteResponseV1', () => {
    it('should return a validation error for an invalid quote response', () => {
      const quoteResponse = {
        quote: {
          requestId: '123',
        },
      };

      const expectedError = new StructError(
        {
          value: '',
          key: '',
          type: '',
          message:
            'Expected the value to satisfy a union of `intersection | intersection | intersection | intersection',
          explanation:
            'Expected the value to satisfy a union of `intersection | intersection | intersection | intersection`, but received: [object Object]',
          branch: [],
          path: [],
          refinement: undefined,
        },
        function (): Generator<Failure, unknown, unknown> {
          return [
            {
              path: ['quote', 'src'],
              message: 'Expected an object, but received: undefined',
            },
            {
              path: ['quote', 'dest'],
              message: 'Expected an object, but received: undefined',
            },
            {
              path: ['quote', 'feeData'],
              message: 'Expected an object, but received: undefined',
            },
            {
              path: ['quote', 'aggregator'],
              message: 'Expected a string, but received: undefined',
            },
            {
              path: ['quote', 'protocols'],
              message: 'Expected an array value, but received: undefined',
            },
            {
              path: ['estimatedProcessingTimeInSeconds'],
              message: 'Expected a number, but received: undefined',
            },
            {
              path: ['namespace'],
              message:
                'Expected the literal `"eip155"`, but received: undefined',
            },
            {
              path: ['chainId'],
              message:
                'Expected a value of type `CaipChainId`, but received: `undefined`',
            },
            {
              path: ['trade'],
              message: 'Expected an object, but received: undefined',
            },
            {
              path: ['namespace'],
              message:
                'Expected the literal `"solana"`, but received: undefined',
            },
            {
              path: ['trade'],
              message: 'Expected a string, but received: undefined',
            },
            {
              path: ['namespace'],
              message: 'Expected the literal `"tron"`, but received: undefined',
            },

            {
              path: ['namespace'],
              message:
                'Expected the literal `"bip122"`, but received: undefined',
            },
          ] as unknown as Generator<Failure, unknown, unknown>;
        },
      );
      // @ts-expect-error - invalid quote response
      expect(() => toQuoteResponseV1(quoteResponse))
        .toThrowErrorMatchingInlineSnapshot(`
        "Failed to convert QuoteResponseV2 to QuoteResponseV1. [
          "At path: quote.srcChainId (number) -- Expected a number, but received: undefined",
          "At path: quote.srcAsset (number) -- Expected an object, but received: undefined",
          "At path: quote.srcTokenAmount (number) -- Expected a string, but received: undefined",
          "At path: quote.destChainId (number) -- Expected a number, but received: undefined",
          "At path: quote.destAsset (number) -- Expected an object, but received: undefined",
          "At path: quote.destTokenAmount (number) -- Expected a string, but received: undefined",
          "At path: quote.minDestTokenAmount (number) -- Expected a string, but received: undefined",
          "At path: quote.feeData (number) -- Expected an object, but received: undefined",
          "At path: quote.bridgeId (number) -- Expected a string, but received: undefined",
          "At path: quote.bridges (number) -- Expected an array value, but received: undefined",
          "At path: quote.steps (number) -- Expected an array value, but received: undefined",
          "At path: estimatedProcessingTimeInSeconds (number) -- Expected a number, but received: undefined",
          "At path: trade (number) -- Expected the value to satisfy a union of \`type | type | type | union | string\`, but received: undefined",
          "At path: trade (number) -- Expected an object, but received: undefined",
          "At path: trade (number) -- Expected the value to satisfy a union of \`type | type\`, but received: undefined",
          "At path: trade (number) -- Expected a string, but received: undefined"
        ]"
      `);

      expect(formatStructErrors(expectedError)).toMatchInlineSnapshot(`
        [
          "At path: <root> -- Expected the value to satisfy a union of \`intersection | intersection | intersection | intersection",
          "At path: quote.src -- Expected an object, but received: undefined",
          "At path: quote.dest -- Expected an object, but received: undefined",
          "At path: quote.feeData -- Expected an object, but received: undefined",
          "At path: quote.aggregator -- Expected a string, but received: undefined",
          "At path: quote.protocols -- Expected an array value, but received: undefined",
          "At path: estimatedProcessingTimeInSeconds -- Expected a number, but received: undefined",
          "At path: namespace -- Expected the literal \`"eip155"\`, but received: undefined",
          "At path: chainId -- Expected a value of type \`CaipChainId\`, but received: \`undefined\`",
          "At path: trade -- Expected an object, but received: undefined",
          "At path: namespace -- Expected the literal \`"solana"\`, but received: undefined",
          "At path: trade -- Expected a string, but received: undefined",
          "At path: namespace -- Expected the literal \`"tron"\`, but received: undefined",
          "At path: namespace -- Expected the literal \`"bip122"\`, but received: undefined",
        ]
      `);
    });

    it('should return a valid QuoteResponseV1 with V2 input (no metadata)', () => {
      const quoteResponse = mockBridgeQuotesErc20Erc20V1[0];
      expect(quoteResponse.quote.minDestTokenAmount).toBe('13700000');

      const quoteResponseV2 = toQuoteResponseV2(quoteResponse);
      expect(quoteResponseV2.quote.feeData.network).toBeUndefined();

      const quoteMetadata = toQuoteMetadataV1(quoteResponseV2);
      expect(
        Object.values(quoteMetadata).every((value) => value === undefined),
      ).toBe(true);

      expect(quoteResponseV2.quote.dest.minAmount).toBe('13700000');
      const expectedQuoteResponseV2 = mockBridgeQuotesErc20Erc20V2Migration[0];
      delete expectedQuoteResponseV2.quote.feeData.network;

      expect(quoteResponseV2).toStrictEqual({
        ...expectedQuoteResponseV2,
        namespace: KnownCaipNamespace.Eip155,
        chainId: 'eip155:10',
      });
      expect(quoteResponseV2.quote.dest.minAmount).toMatchInlineSnapshot(
        `"13700000"`,
      );
      expect(quoteResponseV2.quote.feeData.network).toBeUndefined();

      const quoteResponseV1 = toQuoteResponseV1(quoteResponseV2);
      expect(quoteResponseV1.quote.minDestTokenAmount).toBe('13700000');

      expect(quoteResponseV1).toStrictEqual(quoteResponse);
    });

    it('should return a valid QuoteResponseV1 with V2 input (remove metadata)', () => {
      const quoteResponseV1WithMetadata = mergeQuoteMetadata(
        mockBridgeQuotesErc20Erc20V1[0],
        MOCK_QUOTE_METADATA,
      );

      // Build input data by converting V1 to V2
      const quoteResponseV2 = mergeQuoteMetadata(
        toQuoteResponseV2(quoteResponseV1WithMetadata),
        MOCK_QUOTE_METADATA,
      );

      const expectedQuoteResponseV2 = mergeQuoteMetadata(
        toQuoteResponseV2(mockBridgeQuotesErc20Erc20V2Migration[0]),
        MOCK_QUOTE_METADATA,
      );

      expect(
        toQuoteResponseV2(quoteResponseV1WithMetadata).quote.feeData
          ?.network?.[0],
      ).toMatchInlineSnapshot(`undefined`);
      expect(quoteResponseV2.quote.feeData?.network?.[0])
        .toMatchInlineSnapshot(`
        {
          "amount": "7000000000000",
          "asset": {
            "assetId": "eip155:10/slip44:60",
            "decimals": 18,
            "name": "Ether",
            "symbol": "ETH",
          },
          "normalizedAmount": "0.000007",
          "usd": "0.0131",
          "valueInCurrency": "0.0131",
        }
      `);

      expect(quoteResponseV2).toStrictEqual({
        ...expectedQuoteResponseV2,
        namespace: KnownCaipNamespace.Eip155,
        chainId: 'eip155:10',
        ...MOCK_QUOTE_METADATA,
      });

      // Convert V2 to V1
      const quoteResponseV1 = toQuoteResponseV1(quoteResponseV2);
      expect(quoteResponseV1).toStrictEqual(mockBridgeQuotesErc20Erc20V1[0]);
    });

    it('should return a valid QuoteResponse with V1 input', () => {
      const quoteResponse = mockBridgeQuotesErc20Erc20V1[0];
      const quoteResponseV2 = toQuoteResponseV1(quoteResponse);
      expect(quoteResponseV2).toStrictEqual(mockBridgeQuotesErc20Erc20V1[0]);
    });

    it('should return a valid QuoteResponseV1 with V1 input and metadata', () => {
      const quoteResponse = mergeQuoteMetadata(
        mockBridgeQuotesErc20Erc20V1[0],
        MOCK_QUOTE_METADATA,
      );

      // Convert to V1
      const quoteResponseV1 = toQuoteResponseV1(quoteResponse);
      expect(quoteResponseV1).toStrictEqual(quoteResponse);
      expect(toQuoteMetadataV1(quoteResponseV1)).toStrictEqual(
        MOCK_QUOTE_METADATA,
      );
    });

    it('should throw an error for a null input', () => {
      // @ts-expect-error - null input
      expect(() => toQuoteResponseV1(null)).toThrow(
        'Failed to convert QuoteResponseV2 + metadata to QuoteResponseV1. [\n  "At path: <root> (type) -- Expected an object, but received: null"\n]',
      );
    });
  });
});
