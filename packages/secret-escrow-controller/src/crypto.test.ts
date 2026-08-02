import { wrapPassword, unwrapPassword } from './crypto.js';

describe('wrapPassword / unwrapPassword', () => {
  it('round-trips a password under a 32-byte secret', () => {
    const secret = new Uint8Array(32).fill(9);
    const wrapped = wrapPassword('hunter2', secret);
    expect(unwrapPassword(wrapped, secret)).toBe('hunter2');
  });

  it('rejects a non-32-byte secret on wrap', () => {
    expect(() => wrapPassword('x', new Uint8Array(16))).toThrow(
      'Escrow secret must be 32 bytes',
    );
  });

  it('rejects a non-32-byte secret on unwrap', () => {
    expect(() =>
      unwrapPassword(
        { ciphertext: 'YQ==', iv: 'AAAAAAAAAAAA' },
        new Uint8Array(16),
      ),
    ).toThrow('Escrow secret must be 32 bytes');
  });
});
