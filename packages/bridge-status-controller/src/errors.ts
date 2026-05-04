import { QuoteStatusUpdateErrorType } from './constants';

export class QuoteStatusUpdateError extends Error {
  readonly details?: {
    quoteId: string;
    errorType?: QuoteStatusUpdateErrorType;
  };

  constructor(
    message: string,
    details: {
      errorType?: QuoteStatusUpdateErrorType;
      quoteId: string;
    },
  ) {
    super(
      `${details.errorType ? `[${details.errorType}] ` : ''}${message}`,
    );
    this.details = details;
    this.name = QuoteStatusUpdateError.name;
    Object.setPrototypeOf(this, QuoteStatusUpdateError.prototype);
  }
}
