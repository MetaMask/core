import { StatusTypes } from '@metamask/bridge-controller';

import {
  QuoteStatusBackendStatus,
  QuoteStatusUpdateBackendErrorType,
} from './constants';
import {
  validateQuoteStatusGetResponse,
  validateQuoteStatusUpdateResponse,
} from './validators';

describe('quote-status validators', () => {
  describe('validateQuoteStatusUpdateResponse', () => {
    it('accepts a valid base error response', () => {
      const response = {
        statusCode: 404,
        message: 'quote not found',
        type: QuoteStatusUpdateBackendErrorType.QuoteNotFound,
      };

      expect(() => validateQuoteStatusUpdateResponse(response)).not.toThrow();
    });

    it('accepts a valid on-chain mismatch response', () => {
      const response = {
        statusCode: 400,
        message: 'status mismatch',
        type: QuoteStatusUpdateBackendErrorType.QuoteStatusOnChainMismatch,
        currentStatus: QuoteStatusBackendStatus.Submitted,
        newStatus: QuoteStatusBackendStatus.FinalizedSuccess,
      };

      expect(() => validateQuoteStatusUpdateResponse(response)).not.toThrow();
    });

    it('throws for mismatch type without current/new status', () => {
      const response = {
        statusCode: 400,
        message: 'status mismatch',
        type: QuoteStatusUpdateBackendErrorType.QuoteStatusOnChainMismatch,
      };

      expect(() => validateQuoteStatusUpdateResponse(response)).toThrow(
        'Expected the value to satisfy a union of',
      );
    });

    it('throws for unsupported update error type', () => {
      const response = {
        statusCode: 400,
        message: 'unsupported type',
        type: 'NOT_A_REAL_TYPE',
      };

      expect(() => validateQuoteStatusUpdateResponse(response)).toThrow(
        'Expected the value to satisfy a union of',
      );
    });
  });

  describe('validateQuoteStatusGetResponse', () => {
    it('accepts an empty response', () => {
      expect(() => validateQuoteStatusGetResponse({})).not.toThrow();
    });

    it('accepts a valid response with submitted transaction status', () => {
      const response = {
        submittedTx: {
          status: StatusTypes.SUBMITTED,
          srcChain: {
            chainId: 1,
          },
        },
      };

      expect(() => validateQuoteStatusGetResponse(response)).not.toThrow();
    });

    it('throws when submittedTx is present without status', () => {
      const response = {
        submittedTx: {},
      };

      expect(() => validateQuoteStatusGetResponse(response)).toThrow(
        'At path: submittedTx.status',
      );
    });

    it('throws when submitted transaction status is invalid', () => {
      const response = {
        submittedTx: {
          status: 'NOT_A_STATUS_TYPE',
        },
      };

      expect(() => validateQuoteStatusGetResponse(response)).toThrow(
        'At path: submittedTx.status',
      );
    });
  });
});
