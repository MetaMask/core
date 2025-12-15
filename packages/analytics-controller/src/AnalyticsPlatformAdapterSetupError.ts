/**
 * Error thrown when platform adapter setup fails during the onSetupCompleted lifecycle hook.
 */
export class AnalyticsPlatformAdapterSetupError extends Error {
  cause?: Error;

  constructor(message: string, cause?: Error) {
    super(message);
    this.name = this.constructor.name;
    if (cause) {
      this.cause = cause;
    }
  }
}
