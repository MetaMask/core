export class VedaResponseValidationError extends Error {
  constructor(message?: string) {
    super(message ?? 'Malformed response received from Veda API');
    this.name = 'VedaResponseValidationError';
  }
}

/**
 * Thrown when a balance source returns data that fails semantic validation
 * (e.g. non-integer amounts, or `totalBalance !== musdBalance + vmusdValueInMusd`).
 * Reported via the messenger's `captureException` when encountered by
 * {@link MoneyAccountBalanceService.fetchBalanceWithFallback}.
 */
export class MoneyAccountBalanceValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MoneyAccountBalanceValidationError';
  }
}

/**
 * Thrown when a balance source is transport-successful but has no usable
 * balance (e.g. Money API `balance: null`). Reported via the messenger's
 * `captureException` when encountered by
 * {@link MoneyAccountBalanceService.fetchBalanceWithFallback}.
 */
export class MoneyAccountBalanceUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MoneyAccountBalanceUnavailableError';
  }
}

/**
 * Thrown when every eligible balance source fails. Preserves each cause for
 * diagnostics; never substitutes a zero balance.
 */
export class MoneyAccountBalanceFetchError extends Error {
  readonly causes: unknown[];

  constructor(causes: unknown[]) {
    super(
      'MoneyAccountBalanceService: failed to fetch balance from all eligible sources',
    );
    this.name = 'MoneyAccountBalanceFetchError';
    this.causes = causes;
  }
}

/**
 * Thrown when a public method is called but vault config has not yet been
 * loaded from RemoteFeatureFlagController, or the flag key is absent.
 * This is a transient condition — the service will recover once flags are
 * fetched and a valid config arrives.
 */
export class VaultConfigNotAvailableError extends Error {
  constructor() {
    super(
      'MoneyAccountBalanceService: vault config is not available. ' +
        'RemoteFeatureFlagController may not have fetched flags yet.',
    );
    this.name = 'VaultConfigNotAvailableError';
  }
}

/**
 * Thrown when the vault config flag value is present but fails superstruct
 * validation. This surfaces to error monitoring service (e.g. Sentry) via the messenger's captureException
 * handler.
 */
export class VaultConfigValidationError extends Error {
  constructor(message?: string) {
    super(
      message ??
        'MoneyAccountBalanceService: vault config from remote feature flags is malformed.',
    );
    this.name = 'VaultConfigValidationError';
  }
}
