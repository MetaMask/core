/**
 * Codes for the errors `MoneyAccountLifecycleController` throws, so clients
 * can tell failures apart without parsing messages.
 */
export enum MoneyAccountLifecycleErrorCode {
  MigrationInProgress = 'MIGRATION_IN_PROGRESS',
  UpgradeInProgress = 'UPGRADE_IN_PROGRESS',
  NoMoneyAccount = 'NO_MONEY_ACCOUNT',
  StateCleared = 'STATE_CLEARED',
  MigrationNotAvailable = 'MIGRATION_NOT_AVAILABLE',
  MultipleIdentities = 'MULTIPLE_IDENTITIES',
  MigrationNotResumable = 'MIGRATION_NOT_RESUMABLE',
  IdentityAlreadyMigrating = 'IDENTITY_ALREADY_MIGRATING',
  NotMigratable = 'NOT_MIGRATABLE',
  SuccessorMismatch = 'SUCCESSOR_MISMATCH',
  SuccessorAlreadyInIdentity = 'SUCCESSOR_ALREADY_IN_IDENTITY',
  SubscriptionPriceMissing = 'SUBSCRIPTION_PRICE_MISSING',
  SubscriptionMissing = 'SUBSCRIPTION_MISSING',
}

/**
 * An error thrown by `MoneyAccountLifecycleController`. Messages never
 * contain addresses, so they are safe to report to error monitoring.
 */
export class MoneyAccountLifecycleError extends Error {
  readonly code: MoneyAccountLifecycleErrorCode;

  constructor(code: MoneyAccountLifecycleErrorCode, message: string) {
    super(message);
    this.name = 'MoneyAccountLifecycleError';
    this.code = code;
  }
}
