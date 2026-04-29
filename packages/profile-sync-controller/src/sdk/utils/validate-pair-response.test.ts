import type { RawPairResponse } from './validate-pair-response';
import { validatePairResponse } from './validate-pair-response';

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
  it('does not throw for a valid pair response', () => {
    expect(() =>
      validatePairResponse(createValidRawPairResponse()),
    ).not.toThrow();
  });

  it('does not throw when metametrics_id is absent (optional field)', () => {
    const response = createValidRawPairResponse();
    delete response.profile.metametrics_id;
    expect(() => validatePairResponse(response)).not.toThrow();
  });

  it('does not throw when profile_aliases is absent (optional field)', () => {
    const response = createValidRawPairResponse();
    delete response.profile_aliases;
    expect(() => validatePairResponse(response)).not.toThrow();
  });

  it.each([null, undefined, 'string', 42])(
    'throws for non-object input: %p',
    (input) => {
      expect(() => validatePairResponse(input)).toThrow(
        'input is not an object',
      );
    },
  );

  it('throws when profile is missing', () => {
    expect(() => validatePairResponse({})).toThrow(
      'profile is missing or not an object',
    );
    expect(() => validatePairResponse({ profile_aliases: [] })).toThrow(
      'profile is missing or not an object',
    );
  });

  it('throws when profile is not an object', () => {
    expect(() => validatePairResponse({ profile: null })).toThrow(
      'profile is missing or not an object',
    );
    expect(() => validatePairResponse({ profile: 'string' })).toThrow(
      'profile is missing or not an object',
    );
  });

  it('throws when profile_id is missing or empty', () => {
    expect(() =>
      validatePairResponse({
        profile: { identifier_id: 'some-id' },
      }),
    ).toThrow('profile.profile_id is missing or empty');

    expect(() =>
      validatePairResponse({
        profile: { profile_id: '', identifier_id: 'some-id' },
      }),
    ).toThrow('profile.profile_id is missing or empty');
  });

  it('throws when identifier_id is missing or empty', () => {
    expect(() =>
      validatePairResponse({
        profile: { profile_id: 'some-id' },
      }),
    ).toThrow('profile.identifier_id is missing or empty');

    expect(() =>
      validatePairResponse({
        profile: { profile_id: 'some-id', identifier_id: '' },
      }),
    ).toThrow('profile.identifier_id is missing or empty');
  });

  it('throws when profile_id or identifier_id is not a string', () => {
    expect(() =>
      validatePairResponse({
        profile: { profile_id: 123, identifier_id: 'some-id' },
      }),
    ).toThrow('profile.profile_id is missing or empty');

    expect(() =>
      validatePairResponse({
        profile: { profile_id: 'some-id', identifier_id: true },
      }),
    ).toThrow('profile.identifier_id is missing or empty');
  });
});
