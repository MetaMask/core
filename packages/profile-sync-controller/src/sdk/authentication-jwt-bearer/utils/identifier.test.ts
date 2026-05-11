import { createSHA256Hash } from '../../../shared/encryption';
import { Env } from '../../../shared/env';
import { computeIdentifierId, IDENTIFIER_SALT } from './identifier';

describe('computeIdentifierId', () => {
  const MOCK_PUBLIC_KEY =
    '0x02acabf4ecab2f8f559596c51c758ee97823f97c6c6feac031cdacb77eae071b5c';

  it.each([Env.DEV, Env.UAT, Env.PRD])(
    'produces SHA256(publicKey + salt) for %s environment',
    (env) => {
      const result = computeIdentifierId(MOCK_PUBLIC_KEY, env);
      const expected = createSHA256Hash(MOCK_PUBLIC_KEY + IDENTIFIER_SALT[env]);
      expect(result).toBe(expected);
    },
  );

  it('produces different hashes for different environments', () => {
    const devHash = computeIdentifierId(MOCK_PUBLIC_KEY, Env.DEV);
    const uatHash = computeIdentifierId(MOCK_PUBLIC_KEY, Env.UAT);
    const prdHash = computeIdentifierId(MOCK_PUBLIC_KEY, Env.PRD);

    expect(devHash).not.toBe(uatHash);
    expect(devHash).not.toBe(prdHash);
    expect(uatHash).not.toBe(prdHash);
  });

  it('produces different hashes for different public keys', () => {
    const hash1 = computeIdentifierId('key-1', Env.PRD);
    const hash2 = computeIdentifierId('key-2', Env.PRD);
    expect(hash1).not.toBe(hash2);
  });

  it('is deterministic', () => {
    const hash1 = computeIdentifierId(MOCK_PUBLIC_KEY, Env.PRD);
    const hash2 = computeIdentifierId(MOCK_PUBLIC_KEY, Env.PRD);
    expect(hash1).toBe(hash2);
  });

  it('returns a hex string', () => {
    const result = computeIdentifierId(MOCK_PUBLIC_KEY, Env.PRD);
    expect(result).toMatch(/^[0-9a-f]{64}$/u);
  });

  it('throws for invalid environment', () => {
    // @ts-expect-error: testing runtime guard with an invalid env value
    expect(() => computeIdentifierId(MOCK_PUBLIC_KEY, 'invalid')).toThrow(
      'Cannot compute identifier ID: invalid environment',
    );
  });
});
