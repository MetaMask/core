import type { StateMetadata } from '@metamask/base-controller';
import { isNullOrUndefined } from '@metamask/utils';

import type { SeedlessOnboardingControllerState } from './types.js';
import { assertIsSeedlessOnboardingUserAuthenticated } from './utils/index.js';

/**
 * Seedless Onboarding Controller State Metadata.
 *
 * This allows us to choose if fields of the state should be persisted or not
 * using the `persist` flag; and if they can be sent to Sentry or not, using
 * the `anonymous` flag.
 */
export const seedlessOnboardingMetadata: StateMetadata<SeedlessOnboardingControllerState> =
  {
    vault: {
      includeInStateLogs: false,
      persist: true,
      includeInDebugSnapshot: false,
      usedInUi: false,
    },
    socialBackupsMetadata: {
      includeInStateLogs: false,
      persist: true,
      includeInDebugSnapshot: false,
      usedInUi: false,
    },
    nodeAuthTokens: {
      // We sanitize the `authToken` field from the `nodeAuthTokens` to avoid logging the actual token.
      // The reason we include this in the state logs is to help with debugging in case of any issues.
      includeInStateLogs: (nodeAuthTokens) =>
        !isNullOrUndefined(nodeAuthTokens),
      persist: true,
      includeInDebugSnapshot: false,
      usedInUi: false,
    },
    authConnection: {
      includeInStateLogs: true,
      persist: true,
      includeInDebugSnapshot: true,
      usedInUi: true,
    },
    authConnectionId: {
      includeInStateLogs: true,
      persist: true,
      includeInDebugSnapshot: true,
      usedInUi: false,
    },
    groupedAuthConnectionId: {
      includeInStateLogs: true,
      persist: true,
      includeInDebugSnapshot: true,
      usedInUi: false,
    },
    userId: {
      includeInStateLogs: true,
      persist: true,
      includeInDebugSnapshot: false,
      usedInUi: false,
    },
    socialLoginEmail: {
      includeInStateLogs: false,
      persist: true,
      includeInDebugSnapshot: false,
      usedInUi: true,
    },
    vaultEncryptionKey: {
      includeInStateLogs: false,
      persist: false,
      includeInDebugSnapshot: false,
      usedInUi: false,
    },
    vaultEncryptionSalt: {
      includeInStateLogs: false,
      persist: false,
      includeInDebugSnapshot: false,
      usedInUi: false,
    },
    authPubKey: {
      includeInStateLogs: true,
      persist: true,
      includeInDebugSnapshot: false,
      usedInUi: false,
    },
    passwordOutdatedCache: {
      includeInStateLogs: true,
      persist: true,
      includeInDebugSnapshot: true,
      usedInUi: false,
    },
    refreshToken: {
      includeInStateLogs: false,
      persist: true,
      includeInDebugSnapshot: false,
      usedInUi: false,
    },
    revokeToken: {
      includeInStateLogs: false,
      persist: false,
      includeInDebugSnapshot: false,
      usedInUi: false,
    },
    pendingToBeRevokedTokens: {
      includeInStateLogs: false,
      persist: true,
      includeInDebugSnapshot: false,
      usedInUi: false,
    },
    // stays in vault
    accessToken: {
      includeInStateLogs: false,
      persist: false,
      includeInDebugSnapshot: false,
      usedInUi: false,
    },
    // stays outside of vault as this token is accessed by the metadata service
    // before the vault is created or unlocked.
    metadataAccessToken: {
      includeInStateLogs: false,
      persist: true,
      includeInDebugSnapshot: false,
      usedInUi: false,
    },
    encryptedSeedlessEncryptionKey: {
      includeInStateLogs: false,
      persist: true,
      includeInDebugSnapshot: false,
      usedInUi: false,
    },
    encryptedKeyringEncryptionKey: {
      includeInStateLogs: false,
      persist: true,
      includeInDebugSnapshot: false,
      usedInUi: false,
    },
    isSeedlessOnboardingUserAuthenticated: {
      includeInStateLogs: true,
      persist: true,
      includeInDebugSnapshot: true,
      usedInUi: false,
    },
    migrationVersion: {
      includeInStateLogs: true,
      persist: true,
      includeInDebugSnapshot: true,
      usedInUi: false,
    },
  };

/**
 * Get the initial state for the Seedless Onboarding Controller with defaults.
 *
 * @param overrides - The overrides for the initial state.
 * @returns The initial state for the Seedless Onboarding Controller.
 */
export function getInitialSeedlessOnboardingControllerStateWithDefaults(
  overrides?: Partial<SeedlessOnboardingControllerState>,
): SeedlessOnboardingControllerState {
  const initialState = {
    socialBackupsMetadata: [],
    isSeedlessOnboardingUserAuthenticated: false,
    migrationVersion: 0,
    ...overrides,
  };

  // Ensure authenticated flag is set correctly.
  try {
    assertIsSeedlessOnboardingUserAuthenticated(initialState);
    initialState.isSeedlessOnboardingUserAuthenticated = true;
  } catch {
    initialState.isSeedlessOnboardingUserAuthenticated = false;
  }
  return initialState;
}
