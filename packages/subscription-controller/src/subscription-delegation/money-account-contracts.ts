import type { Hex } from '@metamask/utils';

import type {
  MoneyAccountAuthorizationReason,
  PreparedSubscriptionPermission,
} from './types.js';

/**
 * Temporary local contract for Money Account delegation readiness.
 *
 * These types should move to `@metamask/money-account-controller` once the
 * owning package publishes the corresponding messenger actions.
 */
export type MoneyAccountDelegationScope = 'base-vault' | 'premium-vault';

export type VaultPermissionId =
  | 'cash-deposit'
  | 'cash-withdrawal'
  | 'cash-deposit-premium'
  | 'cash-withdrawal-premium';

export type DelegationsReadinessResult =
  | {
      status: 'ready' | 'setup-required';
      readinessFingerprint: Hex;
      permissions: PreparedSubscriptionPermission[];
    }
  | {
      status: 'money-account-authorization-required';
      reasons: MoneyAccountAuthorizationReason[];
    };

export type EnsureDelegationsReadinessResult = {
  status: 'ready';
  activeDelegationHashes: Partial<Record<VaultPermissionId, Hex>>;
};

export type MoneyAccountControllerGetDelegationsReadinessAction = {
  type: 'MoneyAccountController:getDelegationsReadiness';
  handler: () => Promise<DelegationsReadinessResult>;
};

export type MoneyAccountControllerEnsureDelegationsReadinessAction = {
  type: 'MoneyAccountController:ensureDelegationsReadiness';
  handler: () => Promise<EnsureDelegationsReadinessResult>;
};
