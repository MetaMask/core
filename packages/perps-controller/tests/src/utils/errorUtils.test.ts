import { describe, expect, it } from 'vitest';

import { PerpsControllerError } from '../../../src/errors.js';
import { PERPS_ERROR_CODES } from '../../../src/perpsErrorCodes.js';
import {
  isAbortError,
  ensureError,
  isHyperLiquidMultiSigRequiredError,
  isHyperLiquidUserNotFoundError,
  isKeyringLockedError,
  normalizeHyperLiquidError,
} from '../../../src/utils/errorUtils.js';

describe('errorUtils', () => {
  describe('isAbortError', () => {
    it('returns true for Error with name AbortError', () => {
      const error = new Error('The operation was aborted');
      error.name = 'AbortError';

      expect(isAbortError(error)).toBe(true);
    });

    it('returns true for Error with "signal is aborted" message', () => {
      const error = new Error('AbortError: signal is aborted without reason');

      expect(isAbortError(error)).toBe(true);
    });

    it('returns true for Error with "The operation was aborted" message', () => {
      const error = new Error('The operation was aborted');

      expect(isAbortError(error)).toBe(true);
    });

    it('returns false for regular Error', () => {
      const error = new Error('Network timeout');

      expect(isAbortError(error)).toBe(false);
    });

    it('returns false for non-Error values', () => {
      expect(isAbortError('some string')).toBe(false);
      expect(isAbortError(null)).toBe(false);
      expect(isAbortError(undefined)).toBe(false);
      expect(isAbortError(42)).toBe(false);
    });

    it('returns false for DOMException with non-abort name', () => {
      const error = new Error('Something failed');
      error.name = 'TypeError';

      expect(isAbortError(error)).toBe(false);
    });
  });

  describe('ensureError', () => {
    it('returns Error instance unchanged', () => {
      const error = new Error('test');

      expect(ensureError(error)).toBe(error);
    });

    it('wraps string in Error', () => {
      const result = ensureError('string error');

      expect(result).toBeInstanceOf(Error);
      expect(result.message).toBe('string error');
    });

    it('wraps undefined with context', () => {
      const result = ensureError(undefined, 'TestContext');

      expect(result).toBeInstanceOf(Error);
      expect(result.message).toContain('Unknown error');
      expect(result.message).toContain('TestContext');
    });

    it('wraps null with context', () => {
      const result = ensureError(null, 'TestContext');

      expect(result).toBeInstanceOf(Error);
      expect(result.message).toContain('Unknown error');
    });
  });

  describe('isKeyringLockedError', () => {
    it('returns true for direct KEYRING_LOCKED errors', () => {
      const error = new Error('KEYRING_LOCKED');

      expect(isKeyringLockedError(error)).toBe(true);
    });

    it('returns true for wrapped KEYRING_LOCKED causes', () => {
      const error = Object.assign(
        new Error('Failed to sign typed data with viem wallet'),
        { cause: new Error('KEYRING_LOCKED') },
      );

      expect(isKeyringLockedError(error)).toBe(true);
    });

    it('returns false for non-keyring errors with cyclic causes', () => {
      const error = new Error('Network error') as Error & { cause?: unknown };
      error.cause = error;

      expect(isKeyringLockedError(error)).toBe(false);
    });
  });

  describe('isHyperLiquidUserNotFoundError', () => {
    it('returns true for the Hyperliquid "wallet does not exist" rejection', () => {
      const error = new Error(
        'User or API Wallet 0x340ed4af8642491fe02fa28403cad1a53268e510 does not exist.',
      );

      expect(isHyperLiquidUserNotFoundError(error)).toBe(true);
    });

    it('returns true for non-Error rejections carrying the same message', () => {
      expect(
        isHyperLiquidUserNotFoundError(
          'user or API wallet 0xabc does not exist',
        ),
      ).toBe(true);
    });

    it('returns false for unrelated "does not exist" errors', () => {
      expect(
        isHyperLiquidUserNotFoundError(new Error('Asset BTC does not exist')),
      ).toBe(false);
    });
  });

  describe('isHyperLiquidMultiSigRequiredError', () => {
    it('returns true for both Hyperliquid multi-sig required spellings', () => {
      // Hyperliquid is not consistent about the hyphen across endpoints, so
      // both spellings must classify as the same benign condition.
      expect(
        isHyperLiquidMultiSigRequiredError(
          new Error('ApiRequestError: Multi-sig required'),
        ),
      ).toBe(true);
      expect(
        isHyperLiquidMultiSigRequiredError(
          new Error('ApiRequestError: Multisig required'),
        ),
      ).toBe(true);
    });

    it('returns true for non-Error rejections carrying the same message', () => {
      expect(isHyperLiquidMultiSigRequiredError('multi-sig required')).toBe(
        true,
      );
    });

    it('returns false for unrelated Hyperliquid and network errors', () => {
      expect(
        isHyperLiquidMultiSigRequiredError(new Error('Network error')),
      ).toBe(false);
      expect(
        isHyperLiquidMultiSigRequiredError(
          new Error(
            'User or API Wallet 0x340ed4af8642491fe02fa28403cad1a53268e510 does not exist.',
          ),
        ),
      ).toBe(false);
      expect(isHyperLiquidMultiSigRequiredError(undefined)).toBe(false);
    });
  });

  describe('normalizeHyperLiquidError', () => {
    it.each([
      [
        'Insufficient margin to place order',
        PERPS_ERROR_CODES.INSUFFICIENT_MARGIN,
      ],
      [
        'Reduce only order would increase position',
        PERPS_ERROR_CODES.REDUCE_ONLY_VIOLATION,
      ],
      [
        'Order could not immediately match against any resting orders',
        PERPS_ERROR_CODES.IOC_CANCEL,
      ],
      [
        'Too many requests: rate limit exceeded',
        PERPS_ERROR_CODES.RATE_LIMIT_EXCEEDED,
      ],
      [
        'Order must have minimum value of $10',
        PERPS_ERROR_CODES.ORDER_SIZE_MIN,
      ],
      [
        'User or API Wallet 0xabc does not exist.',
        PERPS_ERROR_CODES.EXCHANGE_ACCOUNT_NOT_FOUND,
      ],
      [
        'Must deposit before performing actions. User: 0xabc',
        PERPS_ERROR_CODES.EXCHANGE_ACCOUNT_NOT_FOUND,
      ],
    ])('maps "%s" to %s with provider details', (message, code) => {
      const cause = new Error(message);

      const result = normalizeHyperLiquidError(cause);

      expect(result.message).toBe(code);
      expect(result.errorCode).toBe(code);
      expect(result.errorDetails).toStrictEqual({
        code,
        provider: 'hyperliquid',
      });
      expect(result.cause).toBe(cause);
    });

    it('preserves an existing structured controller error', () => {
      const error = new PerpsControllerError(
        PERPS_ERROR_CODES.PRICE_MOVED,
        PERPS_ERROR_CODES.PRICE_MOVED,
      );
      const result = normalizeHyperLiquidError(error);

      expect(result).toBe(error);
    });

    it('returns a safe generic error for an unknown failure and retains the cause', () => {
      const cause = new Error(
        'Unexpected Hyperliquid response containing sensitive diagnostics',
      );

      const result = normalizeHyperLiquidError(cause);

      expect(result.message).toBe(PERPS_ERROR_CODES.UNKNOWN_ERROR);
      expect(result.message).not.toContain(cause.message);
      expect(result.errorCode).toBe(PERPS_ERROR_CODES.UNKNOWN_ERROR);
      expect(result.errorDetails).toStrictEqual({
        code: PERPS_ERROR_CODES.UNKNOWN_ERROR,
        provider: 'hyperliquid',
      });
      expect(result.cause).toBe(cause);
    });
  });
});
