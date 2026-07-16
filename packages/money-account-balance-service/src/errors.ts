export class VedaResponseValidationError extends Error {
  constructor(message?: string) {
    super(message ?? 'Malformed response received from Veda API');
    this.name = 'VedaResponseValidationError';
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

/**
 * Thrown by the `'api'` balance strategy when the Money Account API positions
 * response does not include a usable `balance` object. This is a "source
 * unavailable" signal that lets {@link MoneyAccountBalanceService.getBalance}
 * fall back to the next configured source rather than failing outright.
 */
export class MoneyApiBalanceUnavailableError extends Error {
  constructor(message?: string) {
    super(
      message ??
        'MoneyAccountBalanceService: Money API positions response did not include a usable balance object.',
    );
    this.name = 'MoneyApiBalanceUnavailableError';
  }
}
