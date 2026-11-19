import type { ShieldController } from '@metamask/shield-controller';

type ShieldControllerOptions = ConstructorParameters<
  typeof ShieldController
>[0];

type ShieldControllerCommonOptions = Pick<
  ShieldControllerOptions,
  | 'transactionHistoryLimit'
  | 'coverageHistoryLimit'
  | 'normalizeSignatureRequest'
>;

/**
 * Per-instance options for the wallet's `ShieldController`.
 */
export type ShieldControllerInstanceOptions = ShieldControllerCommonOptions;
