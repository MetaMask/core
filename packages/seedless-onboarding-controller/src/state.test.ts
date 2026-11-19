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

/**
 * Build a controller state for the given envelope fields.
 *
 * @param options - The envelope fields to set.
 * @param options.envelope - Whether the vault is envelope-managed.
 * @param options.isLocalPassword - The `isLocalPassword` value to set, if any.
 * @returns The controller state.
 */
function buildState({
  envelope,
  isLocalPassword,
}: {
  envelope: boolean;
  isLocalPassword?: boolean;
}): SeedlessOnboardingControllerState {
  return {
    ...getInitialSeedlessOnboardingControllerStateWithDefaults(),
    ...(envelope && { envelope: ENVELOPE }),
    ...(isLocalPassword !== undefined && { isLocalPassword }),
  };
}

describe('getEnvelopeStatus', () => {
  it.each([
    {
      name: 'no envelope',
      envelope: false,
      isLocalPassword: undefined,
      expected: {
        isEnvelopeManaged: false,
        isLocalPassword: false,
      },
    },
    {
      name: 'an envelope',
      envelope: true,
      isLocalPassword: undefined,
      expected: {
        isEnvelopeManaged: true,
        isLocalPassword: false,
      },
    },
    {
      name: 'isLocalPassword set to false',
      envelope: false,
      isLocalPassword: false,
      expected: {
        isEnvelopeManaged: false,
        isLocalPassword: false,
      },
    },
    {
      name: 'isLocalPassword set to true',
      envelope: true,
      isLocalPassword: true,
      expected: {
        isEnvelopeManaged: true,
        isLocalPassword: true,
      },
    },
  ])(
    'returns the flags for $name',
    ({ envelope, isLocalPassword, expected }) => {
      expect(
        getEnvelopeStatus(buildState({ envelope, isLocalPassword })),
      ).toStrictEqual(expected);
    },
  );

  it('does not modify the state it reads', () => {
    const state = buildState({ envelope: true, isLocalPassword: true });
    const before = structuredClone(state);

    getEnvelopeStatus(state);

    expect(state).toStrictEqual(before);
  });
});
