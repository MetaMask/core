import { fingerprint, toEntropyFingerprint, toEntropyId } from './utils';

const SECRET = new Uint8Array(32).fill(1);

describe('fingerprint', () => {
  it('returns a valid UUID v4 string', async () => {
    const fp = await fingerprint(SECRET);
    expect(fp).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
    );
  });

  it('is deterministic — same input always produces the same fingerprint', async () => {
    const first = await fingerprint(SECRET);
    const second = await fingerprint(SECRET);
    expect(first).toBe(second);
  });

  it('produces different fingerprints for different secrets', async () => {
    const otherSecret = new Uint8Array(32).fill(2);
    const first = await fingerprint(SECRET);
    const second = await fingerprint(otherSecret);
    expect(first).not.toBe(second);
  });

  it('matches a known value to guard against accidental algorithm changes', async () => {
    // uuid({ random: HMAC-SHA256( key=Uint8Array(32).fill(1), msg='metamask:fingerprint' ).slice(0, 16) })
    const fp = await fingerprint(SECRET);
    expect(fp).toBe('29b22736-01c7-4096-9ae5-9f735d55b5a2');
  });
});

describe('toEntropyFingerprint', () => {
  it('returns a 64-character lowercase hex string', async () => {
    const fp = await toEntropyFingerprint(SECRET);
    expect(fp).toHaveLength(64);
    expect(fp).toMatch(/^[0-9a-f]+$/u);
  });

  it('is deterministic — same input always produces the same fingerprint', async () => {
    const first = await toEntropyFingerprint(SECRET);
    const second = await toEntropyFingerprint(SECRET);
    expect(first).toBe(second);
  });

  it('produces different fingerprints for different secrets', async () => {
    const otherSecret = new Uint8Array(32).fill(2);
    const first = await toEntropyFingerprint(SECRET);
    const second = await toEntropyFingerprint(otherSecret);
    expect(first).not.toBe(second);
  });

  it('matches a known value to guard against accidental algorithm changes', async () => {
    // hex( HMAC-SHA256( key=Uint8Array(32).fill(1), msg='metamask:fingerprint' ) )
    const fp = await toEntropyFingerprint(SECRET);
    expect(fp).toBe(
      '29b2273601c75096dae59f735d55b5a24384e06ff17496130d059b1bd5915560',
    );
  });
});

describe('toEntropyId', () => {
  it('returns the full entropy:category:implementation:uuid format', async () => {
    const id = await toEntropyId('bip44', 'mnemonic', SECRET);
    expect(id).toMatch(
      /^entropy:bip44:mnemonic:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
    );
  });

  it('is deterministic — same inputs always produce the same ID', async () => {
    const first = await toEntropyId('bip44', 'mnemonic', SECRET);
    const second = await toEntropyId('bip44', 'mnemonic', SECRET);
    expect(first).toBe(second);
  });

  it('produces different IDs for different secrets', async () => {
    const otherSecret = new Uint8Array(32).fill(2);
    const first = await toEntropyId('bip44', 'mnemonic', SECRET);
    const second = await toEntropyId('bip44', 'mnemonic', otherSecret);
    expect(first).not.toBe(second);
  });

  it('produces different IDs for different category:implementation combinations', async () => {
    const mnemonicId = await toEntropyId('bip44', 'mnemonic', SECRET);
    const privateKeyId = await toEntropyId('raw', 'private-key', SECRET);
    expect(mnemonicId).not.toBe(privateKeyId);
  });

  it("uses '_' as the UUID segment when no material is provided (hardware wallets)", async () => {
    const id = await toEntropyId('bip44', 'ledger');
    expect(id).toBe('entropy:bip44:ledger:_');
  });

  it('matches a known value to guard against accidental algorithm changes', async () => {
    const id = await toEntropyId('bip44', 'mnemonic', SECRET);
    expect(id).toBe('entropy:bip44:mnemonic:29b22736-01c7-4096-9ae5-9f735d55b5a2');
  });
});
