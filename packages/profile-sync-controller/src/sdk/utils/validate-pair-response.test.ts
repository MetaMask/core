import { validatePairResponse } from './validate-pair-response';

type RawPairResponse = {
  profile: {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    profile_id: string;
    // eslint-disable-next-line @typescript-eslint/naming-convention
    identifier_id: string;
    // eslint-disable-next-line @typescript-eslint/naming-convention
    metametrics_id: string;
  };
  // eslint-disable-next-line @typescript-eslint/naming-convention
  profile_aliases: never[];
};

function createValidRawPairResponse(): RawPairResponse {
  return {
    profile: {
      profile_id: 'f88227bd-b615-41a3-b0be-467dd781a4ad',
      identifier_id:
        'da9a9fc7b09edde9cc23cec9b7e11a71fb0ab4d2ddd8af8af905306f3e1456fb',
      metametrics_id: '561ec651-a844-4b36-a451-04d6eac35740',
    },
    profile_aliases: [],
  };
}

describe('validatePairResponse()', () => {
  it('returns true for a valid pair response', () => {
    expect(validatePairResponse(createValidRawPairResponse())).toBe(true);
  });

  it('returns true when metametrics_id is absent (optional field)', () => {
    const response = createValidRawPairResponse();
    delete (response.profile as Record<string, unknown>).metametrics_id;
    expect(validatePairResponse(response)).toBe(true);
  });

  it('returns true when profile_aliases is absent (optional field)', () => {
    const response = createValidRawPairResponse() as Record<string, unknown>;
    delete response.profile_aliases;
    expect(validatePairResponse(response)).toBe(true);
  });

  it('returns false for null/undefined/non-object input', () => {
    expect(validatePairResponse(null)).toBe(false);
    expect(validatePairResponse(undefined)).toBe(false);
    expect(validatePairResponse('string')).toBe(false);
    expect(validatePairResponse(42)).toBe(false);
  });

  it('returns false when profile is missing', () => {
    expect(validatePairResponse({})).toBe(false);
    expect(validatePairResponse({ profile_aliases: [] })).toBe(false);
  });

  it('returns false when profile is not an object', () => {
    expect(validatePairResponse({ profile: null })).toBe(false);
    expect(validatePairResponse({ profile: 'string' })).toBe(false);
  });

  it('returns false when profile_id is missing or empty', () => {
    const missingProfileId = {
      ...createValidRawPairResponse(),
      profile: { identifier_id: 'some-id' },
    };
    expect(validatePairResponse(missingProfileId)).toBe(false);

    const emptyProfileId = {
      ...createValidRawPairResponse(),
      profile: { ...createValidRawPairResponse().profile, profile_id: '' },
    };
    expect(validatePairResponse(emptyProfileId)).toBe(false);
  });

  it('returns false when identifier_id is missing or empty', () => {
    const missingIdentifierId = {
      ...createValidRawPairResponse(),
      profile: { profile_id: 'some-id' },
    };
    expect(validatePairResponse(missingIdentifierId)).toBe(false);

    const emptyIdentifierId = {
      ...createValidRawPairResponse(),
      profile: { ...createValidRawPairResponse().profile, identifier_id: '' },
    };
    expect(validatePairResponse(emptyIdentifierId)).toBe(false);
  });

  it('returns false when profile_id or identifier_id is not a string', () => {
    expect(
      validatePairResponse({
        profile: { profile_id: 123, identifier_id: 'some-id' },
      }),
    ).toBe(false);

    expect(
      validatePairResponse({
        profile: { profile_id: 'some-id', identifier_id: true },
      }),
    ).toBe(false);
  });
});
