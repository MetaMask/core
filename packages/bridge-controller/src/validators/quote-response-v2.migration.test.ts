import { StructError } from '@metamask/superstruct';

import { mockBridgeQuotesErc20Erc20V1 } from '../../tests/mock-quotes-erc20-erc20';
import { mockBridgeQuotesErc20Erc20V2Migration } from '../../tests/mock-quotes-erc20-erc20-migration-v2';
import { FeatureId } from './feature-flags';
import { toQuoteResponseV2 } from './quote-response-v2-migration';

describe('quote-response-v2-migration', () => {
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
            'Expected the value to satisfy a union of `intersection | intersection | intersection | intersection`, but received: [object Object]',
          branch: [],
          path: [],
          refinement: undefined,
        },
        function () {
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
                'Expected a value of type `CaipChainId`, but received: \`undefined\`',
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
          ];
        },
      );
      expect(() => toQuoteResponseV2(quoteResponse)).toThrow(expectedError);

      expect(
        JSON.stringify(
          Array.from(
            new Set(
              expectedError
                .failures()
                .filter(({ path }) => path.length > 0)
                .map(
                  ({ message, path }) =>
                    `At path: ${path.join('.')} -- ${message}`,
                ),
            ),
          ),
        ),
      ).toMatchInlineSnapshot(
        `"["At path: quote.src -- Expected an object, but received: undefined","At path: quote.dest -- Expected an object, but received: undefined","At path: quote.feeData -- Expected an object, but received: undefined","At path: quote.aggregator -- Expected a string, but received: undefined","At path: quote.protocols -- Expected an array value, but received: undefined","At path: estimatedProcessingTimeInSeconds -- Expected a number, but received: undefined","At path: namespace -- Expected the literal \`\\"eip155\\"\`, but received: undefined","At path: chainId -- Expected a value of type \`CaipChainId\`, but received: \`undefined\`","At path: trade -- Expected an object, but received: undefined","At path: namespace -- Expected the literal \`\\"solana\\"\`, but received: undefined","At path: trade -- Expected a string, but received: undefined","At path: namespace -- Expected the literal \`\\"tron\\"\`, but received: undefined","At path: namespace -- Expected the literal \`\\"bip122\\"\`, but received: undefined"]"`,
      );
    });

    it('should return a valid QuoteResponse with V1 input', () => {
      const quoteResponse = mockBridgeQuotesErc20Erc20V1[0];
      const quoteResponseV2 = toQuoteResponseV2(
        quoteResponse,
        FeatureId.DAPP_SWAP,
      );
      expect(quoteResponseV2).toStrictEqual(
        mockBridgeQuotesErc20Erc20V2Migration[0],
      );
    });

    it('should return a valid QuoteResponse with V2 input', () => {
      const quoteResponse = mockBridgeQuotesErc20Erc20V2Migration[0];
      const quoteResponseV2 = toQuoteResponseV2(
        quoteResponse,
        FeatureId.DAPP_SWAP,
      );
      expect(quoteResponseV2).toStrictEqual(
        mockBridgeQuotesErc20Erc20V2Migration[0],
      );
    });
  });
});
