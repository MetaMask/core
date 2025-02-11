import type { QuoteRequest } from '../types';

export const isValidQuoteRequest = (
  partialRequest: Partial<QuoteRequest>,
  requireAmount = true,
): partialRequest is QuoteRequest => {
  const stringFields = ['srcTokenAddress', 'destTokenAddress'];
  if (requireAmount) {
    stringFields.push('srcTokenAmount');
  }
  const numberFields = ['srcChainId', 'destChainId', 'slippage'];

  return (
    stringFields.every(
      (field) =>
        field in partialRequest &&
        typeof partialRequest[field as keyof typeof partialRequest] ===
          'string' &&
        partialRequest[field as keyof typeof partialRequest] !== undefined &&
        partialRequest[field as keyof typeof partialRequest] !== '' &&
        partialRequest[field as keyof typeof partialRequest] !== null,
    ) &&
    numberFields.every(
      (field) =>
        field in partialRequest &&
        typeof partialRequest[field as keyof typeof partialRequest] ===
          'number' &&
        partialRequest[field as keyof typeof partialRequest] !== undefined &&
        !isNaN(Number(partialRequest[field as keyof typeof partialRequest])) &&
        partialRequest[field as keyof typeof partialRequest] !== null,
    ) &&
    (requireAmount
      ? Boolean((partialRequest.srcTokenAmount ?? '').match(/^[1-9]\d*$/u))
      : true)
  );
};
