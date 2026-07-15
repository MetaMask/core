import { inspect } from 'node:util';

import { Password, Srp } from './secrets';

const VALID_SRP_12 =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const VALID_SRP_24 =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon ' +
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon art';

const VALID_SRPS: Record<number, string> = {
  12: VALID_SRP_12,
  15: 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon address',
  18: 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon agent',
  21: 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon admit',
  24: VALID_SRP_24,
};

describe('Password', () => {
  describe('from', () => {
    it('wraps a non-empty string', () => {
      const password = Password.from('hunter2');
      expect(password).toBeInstanceOf(Password);
    });

    it('throws on an empty string', () => {
      expect(() => Password.from('')).toThrow(
        'Password must be a non-empty string',
      );
    });
  });

  describe('unwrap', () => {
    it('returns the original value', () => {
      expect(Password.from('hunter2').unwrap()).toBe('hunter2');
    });
  });

  describe('redaction', () => {
    const SECRET = 'do-not-log-me';
    let password: Password;

    beforeEach(() => {
      password = Password.from(SECRET);
    });

    it('redacts under util.inspect', () => {
      const inspected = inspect(password);
      expect(inspected).toBe('[redacted]');
      expect(inspected).not.toContain(SECRET);
    });

    it('redacts inside an inspected object', () => {
      const inspected = inspect({ password });
      expect(inspected).toContain('[redacted]');
      expect(inspected).not.toContain(SECRET);
    });

    it('redacts under JSON.stringify', () => {
      const serialized = JSON.stringify({ password });
      expect(serialized).toBe('{"password":"[redacted]"}');
      expect(serialized).not.toContain(SECRET);
    });

    it('redacts under String() conversion', () => {
      expect(String(password)).toBe('[redacted]');
    });

    it('redacts under template-literal interpolation', () => {
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions -- We are intentionally exercising the redacting toString().
      const message = `password is ${password}`;
      expect(message).toBe('password is [redacted]');
      expect(message).not.toContain(SECRET);
    });
  });
});

describe('Srp', () => {
  describe('from', () => {
    it.each([12, 15, 18, 21, 24])(
      'accepts a %i-word mnemonic of valid words',
      (count) => {
        expect(Srp.from(VALID_SRPS[count])).toBeInstanceOf(Srp);
      },
    );

    it('throws when the word count is invalid', () => {
      expect(() => Srp.from('abandon abandon abandon')).toThrow(
        /must be 12, 15, 18, 21, or 24 words \(got 3\)/u,
      );
    });

    it('throws when a word is not in the BIP-39 wordlist', () => {
      const phrase =
        'notabip39word abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
      expect(() => Srp.from(phrase)).toThrow(
        'Secret recovery phrase contains a word not in the BIP-39 English wordlist',
      );
    });

    it('throws when the phrase has an invalid checksum', () => {
      // All valid BIP-39 words, correct count, but wrong last word → bad checksum
      expect(() =>
        Srp.from(
          'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon above',
        ),
      ).toThrow('Secret recovery phrase has an invalid checksum');
    });

    it('accepts a phrase with a trailing space', () => {
      expect(Srp.from(`${VALID_SRP_12} `)).toBeInstanceOf(Srp);
    });

    it('accepts a phrase with leading whitespace', () => {
      expect(Srp.from(`  ${VALID_SRP_12}`)).toBeInstanceOf(Srp);
    });

    it('accepts a phrase with multiple spaces between words', () => {
      const phrase = VALID_SRP_12.replace(' test ', '  test  ');
      expect(Srp.from(phrase)).toBeInstanceOf(Srp);
    });

    it('normalizes whitespace in the stored value', () => {
      expect(Srp.from(`  ${VALID_SRP_12}  `).unwrap()).toBe(VALID_SRP_12);
    });
  });

  describe('unwrap', () => {
    it('returns the normalized phrase', () => {
      expect(Srp.from(VALID_SRP_12).unwrap()).toBe(VALID_SRP_12);
      expect(Srp.from(VALID_SRP_24).unwrap()).toBe(VALID_SRP_24);
    });
  });

  describe('redaction', () => {
    let srp: Srp;

    beforeEach(() => {
      srp = Srp.from(VALID_SRP_12);
    });

    it('redacts under util.inspect', () => {
      const inspected = inspect(srp);
      expect(inspected).toBe('[redacted]');
      expect(inspected).not.toContain('ball');
    });

    it('redacts inside an inspected object', () => {
      const inspected = inspect({ srp });
      expect(inspected).toContain('[redacted]');
      expect(inspected).not.toContain('ball');
    });

    it('redacts under JSON.stringify', () => {
      const serialized = JSON.stringify({ srp });
      expect(serialized).toBe('{"srp":"[redacted]"}');
      expect(serialized).not.toContain('ball');
    });

    it('redacts under String() conversion', () => {
      expect(String(srp)).toBe('[redacted]');
    });

    it('redacts under template-literal interpolation', () => {
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions -- We are intentionally exercising the redacting toString().
      const message = `srp is ${srp}`;
      expect(message).toBe('srp is [redacted]');
      expect(message).not.toContain('ball');
    });
  });
});
