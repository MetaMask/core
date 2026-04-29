import type { PasskeyControllerErrorCode as PasskeyControllerErrorCodeType } from './constants';

/**
 * Options for creating a {@link PasskeyControllerError}.
 */
export type PasskeyControllerErrorOptions = {
  /**
   * The underlying error that caused this error (for error chaining).
   */
  cause?: Error;
  /**
   * Stable code for programmatic handling (see {@link PasskeyControllerErrorCode}).
   */
  code?: PasskeyControllerErrorCodeType;
  /**
   * Additional context for debugging or reporting.
   */
  context?: Record<string, unknown>;
};

/**
 * Error class for PasskeyController-related errors.
 */
export class PasskeyControllerError extends Error {
  code?: PasskeyControllerErrorCodeType;

  context?: Record<string, unknown>;

  cause?: Error;

  /**
   * @param message - The error message.
   * @param options - Error options or an `Error` instance used as `cause` (Keyring-style overload).
   */
  constructor(
    message: string,
    options?: PasskeyControllerErrorOptions | Error,
  ) {
    super(message);
    this.name = 'PasskeyControllerError';

    const cause = options instanceof Error ? options : options?.cause;
    const code = options instanceof Error ? undefined : options?.code;
    const context = options instanceof Error ? undefined : options?.context;

    if (cause) {
      this.cause = cause;
    }
    if (code) {
      this.code = code;
    }
    if (context) {
      this.context = context;
    }

    Object.setPrototypeOf(this, PasskeyControllerError.prototype);
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      context: this.context,
      stack: this.stack,
      cause: this.cause
        ? {
            name: this.cause.name,
            message: this.cause.message,
            stack: this.cause.stack,
          }
        : undefined,
    };
  }

  override toString(): string {
    let result = `${this.name}: ${this.message}`;
    if (this.code) {
      result += ` [${this.code}]`;
    }
    if (this.cause) {
      result += `\n  Caused by: ${this.cause}`;
    }
    return result;
  }
}
