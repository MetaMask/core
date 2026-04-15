export class VedaResponseValidationError extends Error {
  constructor(message?: string) {
    super(message ?? 'Malformed response received from Veda API');
    this.name = 'VedaResponseValidationError';
  }
}
