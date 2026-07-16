import { toEntropyFingerprint, toEntropyId } from './utils';

const SECRET = new Uint8Array(32).fill(1);

describe('toEntropyFingerprint', () => {
  it('returns a 64-character lowercase hex string', async () => {
    const fingerprint = await toEntropyFingerprint(SECRET, 'bip44:srp');
    expect(fingerprint).toHaveLength(64);
    expect(fingerprint).toMatch(/^[0-9a-f]+$/u);
  });

  it('is deterministic — same inputs always produce the same fingerprint', async () => {
    const first = await toEntropyFingerprint(SECRET, 'bip44:srp');
    const second = await toEntropyFingerprint(SECRET, 'bip44:srp');
    expect(first).toBe(second);
  });

  it('is type-scoped — different entropy types produce different fingerprints for the same secret', async () => {
    const srpFingerprint = await toEntropyFingerprint(SECRET, 'bip44:srp');
    const pkFingerprint = await toEntropyFingerprint(
      SECRET,
      'raw:private-key',
    );
    expect(srpFingerprint).not.toBe(pkFingerprint);
  });

  it('produces different fingerprints for different secrets of the same type', async () => {
    const otherSecret = new Uint8Array(32).fill(2);
    const first = await toEntropyFingerprint(SECRET, 'bip44:srp');
    const second = await toEntropyFingerprint(otherSecret, 'bip44:srp');
    expect(first).not.toBe(second);
  });

  it('matches a known value to guard against accidental algorithm changes', async () => {
    // hex( HMAC-SHA256( key=Uint8Array(32).fill(1), msg='metamask:bip44:srp:fingerprint' ) )
    const fingerprint = await toEntropyFingerprint(SECRET, 'bip44:srp');
    expect(fingerprint).toBe(
      '10d37bf4886303a200fe2e8147ded8e89458e37576a799ddaaacb33c89c07599',
    );
  });
});

describe('toEntropyId', () => {
  it('returns a valid UUID v4 string', async () => {
    const id = await toEntropyId(SECRET, 'bip44:srp');
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
    );
  });

  it('is deterministic — same inputs always produce the same ID', async () => {
    const first = await toEntropyId(SECRET, 'bip44:srp');
    const second = await toEntropyId(SECRET, 'bip44:srp');
    expect(first).toBe(second);
  });

  it('is type-scoped — different entropy types produce different IDs for the same secret', async () => {
    const srpId = await toEntropyId(SECRET, 'bip44:srp');
    const pkId = await toEntropyId(SECRET, 'raw:private-key');
    expect(srpId).not.toBe(pkId);
  });

  it('produces different IDs for different secrets of the same type', async () => {
    const otherSecret = new Uint8Array(32).fill(2);
    const first = await toEntropyId(SECRET, 'bip44:srp');
    const second = await toEntropyId(otherSecret, 'bip44:srp');
    expect(first).not.toBe(second);
  });

  it('matches a known value to guard against accidental algorithm changes', async () => {
    // uuid({ random: HMAC-SHA256( key=Uint8Array(32).fill(1), msg='metamask:bip44:srp:fingerprint' ).slice(0, 16) })
    const id = await toEntropyId(SECRET, 'bip44:srp');
    expect(id).toBe('10d37bf4-8863-43a2-80fe-2e8147ded8e8');
  });
});
