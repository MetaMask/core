/**
 * Error thrown by `MoneyAccountUpgradeController.upgradeAccount` when one of
 * the upgrade steps fails.
 *
 * Wraps the underlying error (preserved as `cause`) and records the name of
 * the step that was running, so consumers can attribute the failure to a
 * specific step — e.g. when tagging an error report — without parsing the
 * message.
 */
export class MoneyAccountUpgradeStepError extends Error {
  /** The name of the step that threw. */
  readonly step: string;

  /** The underlying error thrown by the step. */
  readonly cause: unknown;

  constructor(step: string, cause: unknown) {
    const causeMessage = cause instanceof Error ? cause.message : String(cause);
    super(`Money Account upgrade failed at step "${step}": ${causeMessage}`);

    this.name = 'MoneyAccountUpgradeStepError';
    this.step = step;
    this.cause = cause;
  }
}

/**
 * Type guard for {@link MoneyAccountUpgradeStepError}.
 *
 * Uses a structural check rather than `instanceof` so it holds across module
 * realm boundaries — e.g. when the controller is consumed from a bundled host
 * app where a duplicate copy of this class may exist.
 *
 * @param error - The value to test.
 * @returns Whether `error` is a `MoneyAccountUpgradeStepError`.
 */
export function isMoneyAccountUpgradeStepError(
  error: unknown,
): error is MoneyAccountUpgradeStepError {
  return (
    error instanceof Error &&
    error.name === 'MoneyAccountUpgradeStepError' &&
    typeof (error as { step?: unknown }).step === 'string'
  );
}
