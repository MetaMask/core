import { describe, expect, it } from 'vitest';

import {
  getEnvelopeStatus,
  getInitialSeedlessOnboardingControllerStateWithDefaults,
} from './state.js';
import type { SeedlessOnboardingControllerState } from './types.js';

const ENVELOPE = {
  v: 1 as const,
  vaultAuthPubKey: 'vaultAuthPubKey',
  passwordAuthPubKey: 'passwordAuthPubKey',
};
const PENDING_MIGRATION = 'encryptedCheckpoint';

/**
 * Build a controller state for the given envelope fields.
 *
 * @param options - The envelope fields to set.
 * @param options.envelope - Whether the vault is envelope-managed.
 * @param options.pending - Whether an envelope migration is pending.
 * @param options.isLocalPassword - The `isLocalPassword` value to set, if any.
 * @returns The controller state.
 */
function buildState({
  envelope,
  pending,
  isLocalPassword,
}: {
  envelope: boolean;
  pending: boolean;
  isLocalPassword?: boolean;
}): SeedlessOnboardingControllerState {
  return {
    ...getInitialSeedlessOnboardingControllerStateWithDefaults(),
    ...(envelope && { envelope: ENVELOPE }),
    ...(pending && { pendingEnvelopeMigration: PENDING_MIGRATION }),
    ...(isLocalPassword !== undefined && { isLocalPassword }),
  };
}

describe('getEnvelopeStatus', () => {
  it.each([
    {
      name: 'no envelope and no pending migration',
      envelope: false,
      pending: false,
      isLocalPassword: undefined,
      expected: {
        isEnvelopeManaged: false,
        isMigrationPending: false,
        isLocalPassword: false,
      },
    },
    {
      name: 'a pending migration only',
      envelope: false,
      pending: true,
      isLocalPassword: undefined,
      expected: {
        isEnvelopeManaged: false,
        isMigrationPending: true,
        isLocalPassword: false,
      },
    },
    {
      name: 'an envelope only',
      envelope: true,
      pending: false,
      isLocalPassword: undefined,
      expected: {
        isEnvelopeManaged: true,
        isMigrationPending: false,
        isLocalPassword: false,
      },
    },
    {
      name: 'an envelope and a pending migration',
      envelope: true,
      pending: true,
      isLocalPassword: undefined,
      expected: {
        isEnvelopeManaged: true,
        isMigrationPending: true,
        isLocalPassword: false,
      },
    },
    {
      name: 'isLocalPassword set to false',
      envelope: false,
      pending: false,
      isLocalPassword: false,
      expected: {
        isEnvelopeManaged: false,
        isMigrationPending: false,
        isLocalPassword: false,
      },
    },
    {
      name: 'isLocalPassword set to true',
      envelope: true,
      pending: false,
      isLocalPassword: true,
      expected: {
        isEnvelopeManaged: true,
        isMigrationPending: false,
        isLocalPassword: true,
      },
    },
  ])(
    'returns the flags for $name',
    ({ envelope, pending, isLocalPassword, expected }) => {
      expect(
        getEnvelopeStatus(buildState({ envelope, pending, isLocalPassword })),
      ).toStrictEqual(expected);
    },
  );

  it('treats an empty pending checkpoint as no pending migration', () => {
    const state = {
      ...buildState({ envelope: true, pending: false }),
      pendingEnvelopeMigration: '',
    };

    expect(getEnvelopeStatus(state).isMigrationPending).toBe(false);
  });

  it('does not modify the state it reads', () => {
    const state = buildState({
      envelope: true,
      pending: true,
      isLocalPassword: true,
    });
    const before = structuredClone(state);

    getEnvelopeStatus(state);

    expect(state).toStrictEqual(before);
  });
});
