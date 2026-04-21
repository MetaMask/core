import type { QuoteRequest } from '../../types';

export function isAcrossQuoteRequest(request: QuoteRequest): boolean {
  return (
    request.isMaxAmount === true ||
    (request.targetAmountMinimum !== undefined &&
      request.targetAmountMinimum !== '0')
  );
}
