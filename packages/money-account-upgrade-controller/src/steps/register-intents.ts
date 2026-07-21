import type { DelegationResponse } from '@metamask/authenticated-user-storage';
import type {
  IntentEntry,
  SendIntentParams,
} from '@metamask/chomp-api-service';

import {
  equalsIgnoreCase,
  makeHasVedaRedeemerCaveat,
} from './delegation-matchers';
import type { Step } from './step';

type IntentMetadataType = SendIntentParams['metadata']['type'];

/**
 * Parses a delegation's metadata `type` field — typed as `string` in storage —
 * into the narrow set of CHOMP intent types. Throws if the field carries any
 * other value, since registering it as an intent would be a category error.
 *
 * @param type - The `type` field from `DelegationMetadata`.
 * @returns The same value, narrowed to `IntentMetadataType`.
 */
function parseIntentMetadataType(type: string): IntentMetadataType {
  if (type !== 'cash-deposit' && type !== 'cash-withdrawal') {
    throw new Error(
      `Expected delegation type to be "cash-deposit" or "cash-withdrawal", got "${type}"`,
    );
  }
  return type;
}

/**
 * Registers CHOMP intents for the auto-deposit / auto-withdrawal delegations
 * persisted by the build-delegation step.
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

    const hasVedaRedeemerCaveat = makeHasVedaRedeemerCaveat(
      redeemerEnforcer,
      vedaVaultAdapterAddress,
    );

    const configuredTokenAddresses = [musdTokenAddress, boringVaultAddress];
    const matchesConfiguredToken = (entry: DelegationResponse): boolean =>
      configuredTokenAddresses.some((tokenAddress) =>
        equalsIgnoreCase(entry.metadata.tokenAddress, tokenAddress),
      );

    const needsIntent = (entry: DelegationResponse): boolean =>
      equalsIgnoreCase(entry.signedDelegation.delegator, address) &&
      equalsIgnoreCase(entry.signedDelegation.delegate, delegateAddress) &&
      equalsIgnoreCase(entry.metadata.chainIdHex, chainId) &&
      matchesConfiguredToken(entry) &&
      hasVedaRedeemerCaveat(entry) &&
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
