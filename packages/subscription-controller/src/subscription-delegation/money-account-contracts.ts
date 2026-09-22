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

/**
 * Idempotent readiness check for the Money Account vault delegations.
 *
 * `MoneyAccountController` creates the vault delegations early in the account
 * lifecycle and keeps retrying to fill any gaps on its own. In the common case
 * the delegations already exist and this action simply reports them; if any
 * are missing it attempts to create them before reporting. The result is the
 * current readiness either way, so callers use the same action both to build
 * the approval bundle and as a post-approval safety check.
 */
export type MoneyAccountControllerEnsureDelegationsReadinessAction = {
  type: 'MoneyAccountController:ensureDelegationsReadiness';
  handler: () => Promise<DelegationsReadinessResult>;
};
