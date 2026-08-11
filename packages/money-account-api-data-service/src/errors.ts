/**
 * Thrown when a response from the Money Account API fails superstruct
 * validation. Indicates a contract mismatch between client and server.
 */
export class MoneyAccountApiResponseValidationError extends Error {
  constructor(message?: string) {
    super(
      message ??
        'MoneyAccountApiDataService: malformed response received from Money Account API',
    );
    this.name = 'MoneyAccountApiResponseValidationError';
  }
}
