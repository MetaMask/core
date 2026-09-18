/* eslint-disable @typescript-eslint/naming-convention */

type RawProfileAlias = {
  alias_profile_id: string;
  canonical_profile_id: string;
  identifier_ids: { id: string; type: string }[];
};

export type RawPairResponse = {
  profile: {
    profile_id: string;
    identifier_id: string;
    metametrics_id?: string;
  };
  profile_aliases?: RawProfileAlias[];
};

/**
 * Asserts that the raw API response from the profile pairing endpoint has the
 * expected shape before we attempt to map it into a `PairProfilesResponse`.
 * Throws if the response is malformed.
 *
 * @param input - The raw JSON parsed from the pair endpoint response body.
 */
export function validatePairResponse(
  input: unknown,
): asserts input is RawPairResponse {
  if (!input || typeof input !== 'object') {
    throw new Error('validatePairResponse: input is not an object');
  }

  const assumed = input as Record<string, unknown>;
  const profile = assumed.profile as Record<string, unknown> | undefined;
  if (!profile || typeof profile !== 'object') {
    throw new Error(
      'validatePairResponse: profile is missing or not an object',
    );
  }

  if (typeof profile.profile_id !== 'string' || !profile.profile_id) {
    throw new Error(
      'validatePairResponse: profile.profile_id is missing or empty',
    );
  }

  if (typeof profile.identifier_id !== 'string' || !profile.identifier_id) {
    throw new Error(
      'validatePairResponse: profile.identifier_id is missing or empty',
    );
  }
}
