/**
 * Options for creating a KeyringControllerError.
 */
export type KeyringControllerErrorOptions = {
  /**
   * The underlying error that caused this error (for error chaining).
   * Uses the standard Error.cause property (ES2022).
   */
  cause?: Error;
  /**
   * Optional error code for programmatic error handling.
   * This can be used to identify specific error types without string matching.
   */
  code?: string;
  /**
   * Additional context data associated with the error.
   * Useful for debugging and error reporting.
   */
  data?: Record<string, unknown>;
};

/**
 * Error class for KeyringController-related errors.
 *
 * This error class extends the standard Error class and supports:
 * - Error chaining via the `cause` property (ES2022 standard)
 * - Optional error codes for programmatic error handling
 * - Additional context data for debugging
 * - Backward compatibility with the legacy `originalError` property
 */
export class KeyringControllerError extends Error {
  /**
   * Optional error code for programmatic error handling.
   */
  code?: string;

  /**
   * Additional context data associated with the error.
   */
  data?: Record<string, unknown>;

  /**
   * The underlying error that caused this error (ES2022 standard).
   * This is set manually for compatibility with older TypeScript versions.
   */
  cause?: Error;

  /**
   * @deprecated Use `cause` instead. This property is maintained for backward compatibility.
   */
  originalError?: Error;

  /**
   * Creates a new KeyringControllerError.
   *
   * @param message - The error message.
   * @param options - Error options or an Error object for backward compatibility.
   */
  constructor(
    message: string,
    options?: KeyringControllerErrorOptions | Error,
  ) {
    super(message);
    this.name = 'KeyringControllerError';

    // Support both new signature (options object) and legacy signature (Error as second param)
    const cause = options instanceof Error ? options : options?.cause;
    const code = options instanceof Error ? undefined : options?.code;
    const data = options instanceof Error ? undefined : options?.data;

    // Set cause property for error chaining (ES2022 standard)
    if (cause) {
      this.cause = cause;
      // Maintain backward compatibility with originalError
      this.originalError = cause;
    }

    // Set code and data if provided
    if (code) {
      this.code = code;
    }
    if (data) {
      this.data = data;
    }

    // Ensure proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, KeyringControllerError.prototype);
  }

  /**
   * Returns a JSON representation of the error.
   * Useful for logging and error reporting.
   *
   * @returns JSON representation of the error.
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      data: this.data,
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

  /**
   * Returns a string representation of the error chain.
   * Includes all chained errors for better debugging.
   *
   * @returns String representation of the error chain.
   */
  toString(): string {
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
