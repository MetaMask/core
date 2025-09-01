export class SubscriptionServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SubscriptionServiceError';
  }
}
