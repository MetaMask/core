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

  /**
   * Whether the failure is terminal — the condition will not resolve on its
   * own, so retrying the upgrade sequence cannot succeed. Derived from the
   * cause (see {@link TerminalUpgradeError}).
   */
  readonly terminal: boolean;

  constructor(step: string, cause: unknown) {
    const causeMessage = cause instanceof Error ? cause.message : String(cause);
    super(`Money Account upgrade failed at step "${step}": ${causeMessage}`);

    this.name = 'MoneyAccountUpgradeStepError';
    this.step = step;
    this.cause = cause;
    this.terminal =
      cause instanceof Error &&
      (cause as { terminal?: unknown }).terminal === true;
  }
}

/**
 * Error a step throws to mark a failure as terminal: the condition will not
 * resolve on its own, so retrying the upgrade sequence is pointless — e.g.
 * the account is already delegated to a third-party implementation.
 *
 * Detected structurally via the `terminal` property (rather than
 * `instanceof`) so the marking survives module-realm duplication.
 */
export class TerminalUpgradeError extends Error {
  /** Marks the failure as not retryable. */
  readonly terminal = true;

  constructor(message: string) {
    super(message);
    this.name = 'TerminalUpgradeError';
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

/**
 * Whether `error` is a {@link MoneyAccountUpgradeStepError} marked as
 * terminal — a failure that will not resolve on its own, so retrying the
 * upgrade sequence cannot succeed.
 *
 * Uses the same structural checks as {@link isMoneyAccountUpgradeStepError}
 * so it holds across module realm boundaries.
 *
 * @param error - The value to test.
 * @returns Whether `error` is a terminal `MoneyAccountUpgradeStepError`.
 */
export function isTerminalMoneyAccountUpgradeError(
  error: unknown,
): error is MoneyAccountUpgradeStepError {
  return (
    isMoneyAccountUpgradeStepError(error) &&
    (error as { terminal?: unknown }).terminal === true
  );
}
