import { merge } from 'lodash';

import type { QuoteResponse } from '../..';
import { getMockBridgeQuotesErc20Erc20V2 } from '../../../tests/mock-quotes-erc20-erc20';
import { mergeQuoteMetadata } from './merge';

describe('mergeQuoteMetadata', () => {
  it.each([
    {
      title: 'when quoteMetadata is empty',
      quoteResponse: getMockBridgeQuotesErc20Erc20V2()[0],
      quoteMetadata: {},
      mergedQuote: getMockBridgeQuotesErc20Erc20V2()[0],
    },
    {
      title: 'with relayer fee',
      quoteResponse: merge({}, getMockBridgeQuotesErc20Erc20V2()[0], {
        quote: {
          feeData: {
            relayer: [
              {
                amount: '100',
                usd: '100',
              },
            ],
          },
        },
      }),
      quoteMetadata: {
        relayerFee: {
          amount: '.000000000000000105',
          valueInCurrency: '100',
          usd: '10',
        },
      },
      mergedQuote: merge({}, getMockBridgeQuotesErc20Erc20V2()[0], {
        quote: {
          feeData: {
            relayer: [{ amount: '105', usd: '10' }],
          },
        },
      }),
    },
    {
      title: 'when quoteResponse is invalid',
      quoteResponse: { a: 1 },
      quoteMetadata: { b: 2 },
      mergedQuote: { a: 1, b: 2 },
    },
  ])(
    'should merge quote metadata $title',
    ({ quoteResponse, quoteMetadata, mergedQuote }) => {
      expect(
        mergeQuoteMetadata(quoteResponse as QuoteResponse, quoteMetadata),
      ).toMatchObject(mergedQuote);
    },
  );
});
