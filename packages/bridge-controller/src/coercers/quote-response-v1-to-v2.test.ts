import { Failure, StructError } from '@metamask/superstruct';
import { KnownCaipNamespace } from '@metamask/utils';
import { QuoteMetadata } from 'src/utils/quote-metadata/types';

import { mockBridgeQuotesErc20Erc20V1 } from '../../tests/mock-quotes-erc20-erc20';
import { mockBridgeQuotesErc20Erc20V2Migration } from '../../tests/mock-quotes-erc20-erc20-migration-v2';
import { mergeQuoteMetadata } from '../utils/quote-metadata/merge';
import { toQuoteMetadataV1 } from '../utils/quote-metadata/to-quote-metadata-v1';
import { formatStructErrors } from '../utils/struct-error';
import { toQuoteResponseV2 } from './quote-response-v1-to-v2';

const TEST_METADATA: QuoteMetadata = {
  sentAmount: {
    amount: '14',
    usd: undefined,
    valueInCurrency: undefined,
  },
  toTokenAmount: {
    amount: '13.98428',
    usd: undefined,
    valueInCurrency: undefined,
  },
  minToTokenAmount: {
    amount: '13.7',
    usd: undefined,
    valueInCurrency: undefined,
  },
  relayerFee: {
    amount: '0.00001',
    usd: undefined,
    valueInCurrency: undefined,
  },
  totalNetworkFee: {
    amount: '0.001',
    usd: undefined,
    valueInCurrency: undefined,
  },
  gasFee: {
    total: { amount: '0.00099', usd: undefined, valueInCurrency: undefined },
  },
  includedTxFees: {
    amount: undefined,
    usd: undefined,
    valueInCurrency: undefined,
  },
  cost: {
    usd: undefined,
    valueInCurrency: undefined,
  },
  adjustedReturn: {
    usd: undefined,
    valueInCurrency: undefined,
  },
  swapRate: '0.99887714285714285714',
  priceImpact: {
    usd: '1.5',
    valueInCurrency: '1.5',
  },
};

const quoteResponseV1WithMetadata = {
  ...mockBridgeQuotesErc20Erc20V1[0],
  ...TEST_METADATA,
};

describe('quote-response-v2 migration', () => {
  describe('toQuoteResponseV2', () => {
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
            'At path: quote.src -- Expected an object, but received: undefined',
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
      expect(() => toQuoteResponseV2(quoteResponse)).toThrow(expectedError);

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

    it('should return QuoteResponse with no normalized amounts and no metadata (V1 input)', () => {
      const quoteResponseV2 = toQuoteResponseV2(quoteResponseV1WithMetadata);

      const expectedQuoteResponseV2 = mockBridgeQuotesErc20Erc20V2Migration[0];
      delete expectedQuoteResponseV2.quote.feeData.network;
      expect(
        quoteResponseV2.quote.feeData?.network?.[0]?.amount,
      ).toBeUndefined();

      expect(quoteResponseV2).toStrictEqual({
        ...expectedQuoteResponseV2,
        ...TEST_METADATA,
        namespace: KnownCaipNamespace.Eip155,
        chainId: 'eip155:10',
      });

      const extractedMetadata = toQuoteMetadataV1(quoteResponseV2);
      expect(extractedMetadata).toStrictEqual(TEST_METADATA);
    });

    it('should return QuoteResponse with no normalized amounts and preserve metadata (V1 input)', () => {
      const quoteResponseV2 = mergeQuoteMetadata(
        toQuoteResponseV2(quoteResponseV1WithMetadata),
        TEST_METADATA,
      );
      const expectedQuoteResponseV2 = mergeQuoteMetadata(
        mockBridgeQuotesErc20Erc20V2Migration[0],
        TEST_METADATA,
      );

      expect(expectedQuoteResponseV2.quote.feeData).toMatchInlineSnapshot(`
        {
          "metabridge": [
            {
              "amount": "0",
              "asset": {
                "assetId": "eip155:10/erc20:0x0b2c639c533813f4aa9d7837caf62653d097ff85",
                "decimals": 6,
                "name": "USD Coin",
                "symbol": "USDC",
              },
            },
          ],
          "network": [
            {
              "amount": "990000000000000",
              "asset": {
                "assetId": "eip155:10/slip44:60",
                "decimals": 18,
                "name": "Ether",
                "symbol": "ETH",
              },
              "normalizedAmount": "0.00099",
              "usd": undefined,
              "valueInCurrency": undefined,
            },
          ],
          "relayer": [
            {
              "amount": "10000000000000",
              "asset": {
                "assetId": "eip155:10/slip44:60",
                "decimals": 18,
                "name": "Ether",
                "symbol": "ETH",
              },
              "normalizedAmount": "0.00001",
              "usd": undefined,
              "valueInCurrency": undefined,
            },
          ],
          "txFee": [
            {
              "amount": undefined,
              "normalizedAmount": undefined,
              "usd": undefined,
              "valueInCurrency": undefined,
            },
          ],
        }
      `);

      const extractedMetadata = toQuoteMetadataV1(quoteResponseV2);
      expect(quoteResponseV2).toStrictEqual({
        ...expectedQuoteResponseV2,
        ...TEST_METADATA,
        namespace: KnownCaipNamespace.Eip155,
        chainId: 'eip155:10',
      });
      expect(extractedMetadata).toStrictEqual(TEST_METADATA);
    });

    it('should return QuoteResponse and preserve metadata (V2 input)', () => {
      const quoteResponse = {
        ...mockBridgeQuotesErc20Erc20V2Migration[0],
        ...TEST_METADATA,
      };
      const quoteResponseV2 = toQuoteResponseV2(quoteResponse);
      expect(quoteResponseV2).toStrictEqual({
        ...quoteResponse,
        namespace: KnownCaipNamespace.Eip155,
        chainId: 'eip155:10',
      });
      expect(toQuoteMetadataV1(quoteResponseV2)).toStrictEqual(TEST_METADATA);
    });

    it('should throw an error for a null input', () => {
      expect(() => toQuoteResponseV2(null)).toThrow(
        'Expected an object, but received: null',
      );
    });
  });
});
