/**
 * Validates that the raw API response from the profile pairing endpoint has
 * the expected shape before we attempt to map it into a `PairProfilesResponse`.
 *
 * @param input - The raw JSON parsed from the pair endpoint response body.
 * @returns true if the response has all required fields; false otherwise.
 */
export function validatePairResponse(input: unknown): boolean {
  const assumed = input as Record<string, unknown>;

  if (!assumed || typeof assumed !== 'object') {
    return false;
  }

  const profile = assumed.profile as Record<string, unknown> | undefined;
  if (!profile || typeof profile !== 'object') {
    return false;
  }

  if (typeof profile.profile_id !== 'string' || !profile.profile_id) {
    return false;
  }

  if (typeof profile.identifier_id !== 'string' || !profile.identifier_id) {
    return false;
  }

  return true;
}
