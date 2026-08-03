import {
  computeTotpCode,
  decodeBase32,
  encodeBase32,
  generateTotpSecret,
  verifyTotpCode,
} from './totp.js';

describe('totp helpers', () => {
  it('round-trips base32 encoding', () => {
    const bytes = new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f]);
    expect(decodeBase32(encodeBase32(bytes))).toStrictEqual(bytes);
  });

  it('generates and verifies a TOTP code', async () => {
    const secret = generateTotpSecret(() => new Uint8Array(20).fill(7));
    const now = 1_700_000_000;
    const code = await computeTotpCode(secret, now);
    expect(code).toMatch(/^\d{6}$/u);
    expect(await verifyTotpCode(secret, code, now)).toBe(true);
    expect(await verifyTotpCode(secret, '000000', now)).toBe(false);
  });
});
