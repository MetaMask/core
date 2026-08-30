import { QuoteStatusUpdateBackendErrorType } from './constants.js';
import { QuoteStatusGetError, QuoteStatusUpdateError } from './errors.js';

describe('QuoteStatusUpdateError', () => {
  describe('constructor', () => {
    it('prefixes the message with the error type when provided', () => {
      const error = new QuoteStatusUpdateError('something went wrong', {
        quoteId: 'quote-1',
        errorType: QuoteStatusUpdateBackendErrorType.QuoteNotFound,
      });

      expect(error.message).toBe('[QUOTE_NOT_FOUND] something went wrong');
    });

    it('leaves the message unprefixed when no error type is provided', () => {
      const error = new QuoteStatusUpdateError('something went wrong', {
        quoteId: 'quote-1',
      });

      expect(error.message).toBe('something went wrong');
    });

    it('preserves the structured details on the instance', () => {
      const details = {
        quoteId: 'quote-1',
        errorType: QuoteStatusUpdateBackendErrorType.ConcurrentUpdate,
      };

      const error = new QuoteStatusUpdateError('conflict', details);

      expect(error.details).toStrictEqual(details);
    });

    it('preserves details when no error type is provided', () => {
      const details = { quoteId: 'quote-1' };

      const error = new QuoteStatusUpdateError('no type', details);

      expect(error.details).toStrictEqual(details);
    });

    it('sets the error name to the class name', () => {
      const error = new QuoteStatusUpdateError('whatever', {
        quoteId: 'quote-1',
      });

      expect(error.name).toBe('QuoteStatusUpdateError');
    });
  });

  describe('prototype chain', () => {
    it('is an instance of QuoteStatusUpdateError', () => {
      const error = new QuoteStatusUpdateError('whatever', {
        quoteId: 'quote-1',
      });

      expect(error).toBeInstanceOf(QuoteStatusUpdateError);
    });

    it('is an instance of Error', () => {
      const error = new QuoteStatusUpdateError('whatever', {
        quoteId: 'quote-1',
      });

      expect(error).toBeInstanceOf(Error);
    });

    it('can be caught as an Error', () => {
      expect(() => {
        throw new QuoteStatusUpdateError('boom', { quoteId: 'quote-1' });
      }).toThrow('boom');
    });
  });
});

describe('QuoteStatusGetError', () => {
  describe('constructor', () => {
    it('keeps the provided message as-is', () => {
      const error = new QuoteStatusGetError('request failed', {
        quoteId: 'quote-1',
      });

      expect(error.message).toBe('request failed');
    });

    it('preserves the structured details on the instance', () => {
      const details = { quoteId: 'quote-1' };

      const error = new QuoteStatusGetError('request failed', details);

      expect(error.details).toStrictEqual(details);
    });

    it('sets the error name to the class name', () => {
      const error = new QuoteStatusGetError('whatever', {
        quoteId: 'quote-1',
      });

      expect(error.name).toBe('QuoteStatusGetError');
    });

    it('defaults retryable to false when no third argument is provided', () => {
      const error = new QuoteStatusGetError('request failed', {
        quoteId: 'quote-1',
      });

      expect(error.retryable).toBe(false);
    });

    it('sets retryable to true when explicitly passed', () => {
      const error = new QuoteStatusGetError(
        'request failed',
        { quoteId: 'quote-1' },
        true,
      );

      expect(error.retryable).toBe(true);
    });

    it('sets retryable to false when explicitly passed', () => {
      const error = new QuoteStatusGetError(
        'request failed',
        { quoteId: 'quote-1' },
        false,
      );

      expect(error.retryable).toBe(false);
    });
  });

  describe('prototype chain', () => {
    it('is an instance of QuoteStatusGetError', () => {
      const error = new QuoteStatusGetError('whatever', {
        quoteId: 'quote-1',
      });

      expect(error).toBeInstanceOf(QuoteStatusGetError);
    });

    it('is an instance of Error', () => {
      const error = new QuoteStatusGetError('whatever', {
        quoteId: 'quote-1',
      });

      expect(error).toBeInstanceOf(Error);
    });

    it('can be caught as an Error', () => {
      expect(() => {
        throw new QuoteStatusGetError('boom', { quoteId: 'quote-1' });
      }).toThrow('boom');
    });
  });
});
