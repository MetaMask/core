import type { DelegationResponse } from '@metamask/authenticated-user-storage';
import type {
  IntentEntry,
  SendIntentParams,
} from '@metamask/chomp-api-service';

import type { VaultDelegationType } from '../types.js';
import {
  getVaultDelegations,
  makeMatchesVaultDelegation,
} from './delegation-matchers.js';
import type { Step } from './step.js';

const VAULT_DELEGATION_TYPES: VaultDelegationType[] = [
  'cash-deposit',
  'cash-withdrawal',
  'cash-deposit-premium',
  'cash-withdrawal-premium',
];

/**
 * Parses a delegation's metadata `type` field — typed as `string` in storage —
 * into the narrow set of vault CHOMP intent types. Throws if the field carries
 * any other value, since registering it as a vault intent would be a category
 * error.
 *
 * @param type - The `type` field from `DelegationMetadata`.
 * @returns The same value, narrowed to `VaultDelegationType`.
 */
function parseIntentMetadataType(type: string): VaultDelegationType {
  const vaultType = VAULT_DELEGATION_TYPES.find((entry) => entry === type);
  if (!vaultType) {
    throw new Error(
      `Expected delegation type to be one of ${VAULT_DELEGATION_TYPES.join(', ')}, got "${type}"`,
    );
  }
  return vaultType;
}

/**
 * Registers CHOMP intents for the auto-deposit / auto-withdrawal delegations
 * persisted by the build-delegation step, for the base vault and, when
 * configured, the premium vault.
 *
 * For each stored delegation between this account and CHOMP's delegate on
 * this chain, the step builds an intent referencing the stored
 * `delegationHash` and submits the batch to `POST /v1/intent`. Delegations
 * whose `delegationHash` already has an active intent on CHOMP are skipped
 * (revoked intents are re-registered). Reports `'already-done'` when every
 * eligible delegation already has an active intent.
 *
 * Once registered, CHOMP re-fetches the delegation from Authenticated User
 * Storage, re-validates it, and adds the account to its monitoring list so
 * subsequent eligible operations can be picked up automatically.
 */
export const registerIntentsStep: Step = {
  name: 'register-intents',
  async run({
    messenger,
    address,
    chainId,
    boringVaultAddress,
    delegateAddress,
    musdTokenAddress,
    premiumVault,
    redeemerEnforcer,
    vedaVaultAdapterAddress,
  }) {
    const [delegations, existingIntents] = await Promise.all([
      messenger.call('AuthenticatedUserStorageService:listDelegations'),
      messenger.call('ChompApiService:getIntentsByAddress', address),
    ]);

    const activeIntentHashes = new Set(
      existingIntents
        .filter((intent: IntentEntry) => intent.status === 'active')
        .map((intent: IntentEntry) => intent.delegationHash.toLowerCase()),
    );

    const matchers = getVaultDelegations({
      musdTokenAddress,
      boringVaultAddress,
      vedaVaultAdapterAddress,
      premiumVault,
    }).map((delegation) =>
      makeMatchesVaultDelegation(
        { address, chainId, delegateAddress, redeemerEnforcer },
        delegation,
      ),
    );

    const needsIntent = (entry: DelegationResponse): boolean =>
      matchers.some((matches) => matches(entry)) &&
      !activeIntentHashes.has(entry.metadata.delegationHash.toLowerCase());

    const toIntent = (entry: DelegationResponse): SendIntentParams => ({
      account: address,
      delegationHash: entry.metadata.delegationHash,
      chainId,
      metadata: {
        allowance: entry.metadata.allowance,
        tokenSymbol: entry.metadata.tokenSymbol,
        tokenAddress: entry.metadata.tokenAddress,
        type: parseIntentMetadataType(entry.metadata.type),
      },
    });

    const intents = delegations.filter(needsIntent).map(toIntent);

    if (intents.length === 0) {
      return 'already-done';
    }

    await messenger.call('ChompApiService:createIntents', intents);
    return 'completed';
  },
};
