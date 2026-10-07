import { getPasswordSyncInstruction } from './checkpoint.js';
import {
  PasswordSyncInstruction,
  SeedlessOnboardingCheckpoint,
  SeedlessOnboardingControllerErrorMessage,
} from './constants.js';

describe('getPasswordSyncInstruction', () => {
  it.each([
    undefined,
    SeedlessOnboardingCheckpoint.RemotePasswordPending,
    SeedlessOnboardingCheckpoint.LocalStatePending,
    SeedlessOnboardingCheckpoint.LocalPasswordPending,
    SeedlessOnboardingCheckpoint.KeySyncPending,
  ])(
    'returns PasswordOutdated when the remote password moved for %s',
    (checkpoint) => {
      expect(getPasswordSyncInstruction(checkpoint, true)).toBe(
        PasswordSyncInstruction.PasswordOutdated,
      );
    },
  );

  it.each([
    [undefined, PasswordSyncInstruction.InSync],
    [
      SeedlessOnboardingCheckpoint.RemotePasswordPending,
      PasswordSyncInstruction.InSync,
    ],
    [
      SeedlessOnboardingCheckpoint.LocalStatePending,
      PasswordSyncInstruction.InSync,
    ],
    [
      SeedlessOnboardingCheckpoint.LocalPasswordPending,
      PasswordSyncInstruction.ReconcileKeyring,
    ],
    [
      SeedlessOnboardingCheckpoint.KeySyncPending,
      PasswordSyncInstruction.SyncKey,
    ],
  ] as const)(
    'maps %s when the remote password is current',
    (checkpoint, expectedInstruction) => {
      expect(getPasswordSyncInstruction(checkpoint, false)).toBe(
        expectedInstruction,
      );
    },
  );

  it.each([
    SeedlessOnboardingCheckpoint.LocalKeyPending,
    SeedlessOnboardingCheckpoint.RemoteSecretPending,
    SeedlessOnboardingCheckpoint.RemoteKeyPending,
  ])('throws for an unsupported checkpoint: %s', (checkpoint) => {
    expect(() => getPasswordSyncInstruction(checkpoint, false)).toThrow(
      SeedlessOnboardingControllerErrorMessage.InvalidPasswordSyncCheckpoint,
    );
  });
});
