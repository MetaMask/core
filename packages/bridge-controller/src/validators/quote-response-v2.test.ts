import { mockBridgeQuotesErc20Erc20V2Migration } from '../../tests/mock-quotes-erc20-erc20-migration-v2';
import { validateQuoteResponse } from './quote-response-v2';

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
  });
});
