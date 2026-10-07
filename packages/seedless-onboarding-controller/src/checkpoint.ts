import {
  PasswordSyncInstruction,
  SeedlessOnboardingCheckpoint,
  SeedlessOnboardingControllerErrorMessage,
} from './constants.js';
import { SeedlessOnboardingError } from './errors.js';

/**
 * Map the remote password state and local recovery checkpoint to an
 * instruction.
 *
 * @param checkpoint - The persisted checkpoint, or `undefined` when none is
 * stored.
 * @param isPasswordOutdated - Whether the local password is behind the remote
 * password.
 * @returns The password-sync instruction.
 * @throws If the checkpoint is not part of password synchronization.
 */
export function getPasswordSyncInstruction(
  checkpoint: SeedlessOnboardingCheckpoint | undefined,
  isPasswordOutdated: boolean,
): PasswordSyncInstruction {
  switch (checkpoint) {
    case SeedlessOnboardingCheckpoint.KeySyncPending:
      return PasswordSyncInstruction.SyncKey;
    case undefined:
    case SeedlessOnboardingCheckpoint.RemotePasswordPending:
    case SeedlessOnboardingCheckpoint.LocalStatePending:
      if (isPasswordOutdated) {
        return PasswordSyncInstruction.PasswordOutdated;
      }
      return PasswordSyncInstruction.InSync;
    case SeedlessOnboardingCheckpoint.LocalPasswordPending:
      if (isPasswordOutdated) {
        return PasswordSyncInstruction.PasswordOutdated;
      }
      return PasswordSyncInstruction.ReconcileKeyring;
    default:
      throw new SeedlessOnboardingError(
        SeedlessOnboardingControllerErrorMessage.InvalidPasswordSyncCheckpoint,
      );
  }
}
