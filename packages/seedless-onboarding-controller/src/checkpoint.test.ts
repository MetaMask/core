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
  ])(
    'returns PasswordOutdated when the remote password moved for %s',
    (checkpoint) => {
      expect(getPasswordSyncInstruction(checkpoint, true)).toBe(
        PasswordSyncInstruction.PasswordOutdated,
      );
    },
  );

  it('returns SyncKey for KEY_SYNC_PENDING regardless of password state', () => {
    expect(
      getPasswordSyncInstruction(
        SeedlessOnboardingCheckpoint.KeySyncPending,
        true,
      ),
    ).toBe(PasswordSyncInstruction.SyncKey);
    expect(
      getPasswordSyncInstruction(
        SeedlessOnboardingCheckpoint.KeySyncPending,
        false,
      ),
    ).toBe(PasswordSyncInstruction.SyncKey);
  });

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
    expect(() => getPasswordSyncInstruction(checkpoint, true)).toThrow(
      SeedlessOnboardingControllerErrorMessage.InvalidPasswordSyncCheckpoint,
    );
  });
});
