import { KnownCaipNamespace } from '@metamask/utils';

import { mockBridgeQuotesErc20Erc20V2Migration } from '../../tests/mock-quotes-erc20-erc20-migration-v2';
import { validateQuoteResponse } from './quote-response';

describe('quote-response-v2', () => {
  describe('validateQuoteResponse', () => {
    it('should return a validation error for an invalid quote response', () => {
      const quoteResponse = {
        quote: {
          requestId: '123',
        },
      };

      expect(() =>
        validateQuoteResponse(quoteResponse),
      ).toThrowErrorMatchingInlineSnapshot(
        `"At path: quote.src -- Expected an object, but received: undefined"`,
      );
    });

    it('should validate a valid quote response', () => {
      const quoteResponse = mockBridgeQuotesErc20Erc20V2Migration[0];
      expect(validateQuoteResponse(quoteResponse)).toBe(true);
    });

    it('should return false when quote namespace is not supported', () => {
      const quoteResponse = mockBridgeQuotesErc20Erc20V2Migration[0];
      quoteResponse.quote.src.asset.assetId = `${KnownCaipNamespace.Wallet}:123/token:test`;
      expect(validateQuoteResponse(quoteResponse)).toBe(false);
    });
  });
});
