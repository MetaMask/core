import type { ParsedMessage } from '@spruceid/siwe-parser';

import { detectSIWE, isValidSIWEOrigin } from './siwe';

const siweMessage =
  'example.com wants you to sign in with your Ethereum account:\n0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2\n\n\nURI: https://example.com/login\nVersion: 1\nChain ID: 1\nNonce: 32891756\nIssued At: 2021-09-30T16:25:24Z';

const expectedParsedMessage: Omit<
  ParsedMessage,
  | 'scheme'
  | 'statement'
  | 'resources'
  | 'expirationTime'
  | 'notBefore'
  | 'requestId'
> = {
  domain: 'example.com',
  address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
  uri: 'https://example.com/login',
  version: '1',
  chainId: 1,
  nonce: '32891756',
  issuedAt: '2021-09-30T16:25:24Z',
};

describe('siwe', () => {
  describe('detectSIWE', () => {
    it('returns an object with isSIWEMessage set to true and parsedMessage', () => {
      const result = detectSIWE({ data: textAsHex(siweMessage) });
      expect(result.isSIWEMessage).toBe(true);
      // eslint-disable-next-line jest/prefer-strict-equal
      expect(result.parsedMessage).toEqual(expectedParsedMessage);
    });

    it('returns an object with isSIWEMessage set to true and parsedMessage when scheme is provided', () => {
      const result = detectSIWE({ data: textAsHex(`https://${siweMessage}`) });
      expect(result.isSIWEMessage).toBe(true);
      // eslint-disable-next-line jest/prefer-strict-equal
      expect(result.parsedMessage).toEqual({
        ...expectedParsedMessage,
        scheme: 'https',
      });
    });

    it('returns an object with isSIWEMessage set to false and parsedMessage set to null', () => {
      const result = detectSIWE({ data: '0xINVALIDDATA' });
      expect(result.isSIWEMessage).toBe(false);
      expect(result.parsedMessage).toBeNull();
    });
  });

  describe('isValidSIWEOrigin', () => {
    const optionalFields: Pick<
      ParsedMessage,
      | 'scheme'
      | 'expirationTime'
      | 'notBefore'
      | 'requestId'
      | 'resources'
      | 'statement'
    > = {
      scheme: null,
      expirationTime: null,
      notBefore: null,
      requestId: null,
      resources: null,
      statement: null,
    };

    const checks = [
      {
        name: 'identical domain',
        expected: true,
        cases: [
          {
            domain: 'example.com',
            origin: 'https://example.com',
          },
          {
            domain: 'example.com',
            origin: 'http://example.com',
          },
          {
            domain: 'example.com',
            origin: 'https://example.com:443',
          },
          {
            domain: 'example.com',
            origin: 'http://example.com:80',
          },
          {
            domain: 'eXAMPLe.cOM',
            origin: 'hTtp://ExamPLE.CoM',
          },
          {
            domain: 'example.com',
            origin: 'https://user:password@example.com',
          },
          {
            domain: 'example.com',
            origin: 'https://user@example.com',
          },
          {
            domain: 'example.com',
            origin: 'http://user:password@example.com:8090',
          },
          {
            domain: 'example.com',
            origin: 'http://user@example.com:8090',
          },
          {
            domain: 'example.com',
            origin: 'http://example.com:8090',
          },
          {
            domain: 'example.com',
            origin: 'https://example.com:8090',
          },
        ],
      },
      {
        name: 'matching domain and port',
        expected: true,
        cases: [
          {
            domain: 'example.com:443',
            origin: 'https://example.com:443',
          },
          {
            domain: 'example.com:443',
            origin: 'https://example.com',
          },
          {
            domain: 'example.com:443',
            origin: 'http://example.com:443',
          },
          {
            domain: 'example.com:80',
            origin: 'http://example.com',
          },
          {
            domain: 'example.com:80',
            origin: 'http://example.com:80',
          },
          {
            domain: 'example.com:80',
            origin: 'https://example.com:80',
          },
          {
            domain: 'example.com:8090',
            origin: 'http://example.com:8090',
          },
          {
            domain: 'example.com:8080',
            origin: 'https://example.com:8080',
          },
        ],
      },
      {
        name: 'matching userinfo',
        expected: true,
        cases: [
          {
            domain: 'alice@example.com',
            origin: 'https://alice:password@example.com',
          },
          {
            domain: 'alice@example.com',
            origin: 'https://alice@example.com',
          },
          {
            domain: 'alice@example.com:8090',
            origin: 'https://alice@example.com:8090',
          },
        ],
      },
      {
        name: 'mismatching userinfo',
        expected: false,
        cases: [
          {
            domain: 'alice@example.com',
            origin: 'https://bob@example.com',
          },
          {
            domain: 'alice@example.com',
            origin: 'https://example.com',
          },
          {
            domain: 'alice@example.com:8090',
            origin: 'https://bob:alice@example.com:8090',
          },
        ],
      },
      {
        name: 'mismatching domain',
        expected: false,
        cases: [
          {
            domain: 'example.com',
            origin: 'http://www.example.com',
          },
          {
            domain: 'www.example.com',
            origin: 'http://example.com',
          },
          {
            domain: 'example.com',
            origin: 'https://foo.example.com',
          },
          {
            domain: 'foo.example.com',
            origin: 'https://example.com',
          },
          {
            domain: 'localhost',
            origin: 'http://127.0.0.1',
          },
          {
            domain: '127.0.0.1',
            origin: 'http://localhost',
          },
        ],
      },
      {
        name: 'mismatching port',
        expected: false,
        cases: [
          {
            domain: 'www.example.com:8091',
            origin: 'http://www.example.com:8090',
          },
          {
            domain: 'www.example.com:8091',
            origin: 'https://www.example.com:8090',
          },
          {
            domain: 'example.com:8090',
            origin: 'http://example.com',
          },
          {
            domain: '127.0.0.1:8090',
            origin: 'https://127.0.0.1',
          },
          {
            domain: 'localhost:8090',
            origin: 'http://localhost',
          },
          {
            domain: '127.0.0.1:8090',
            origin: 'https://localhost',
          },
          {
            domain: '127.0.0.1:8090',
            origin: 'https://localhost:8091',
          },
          {
            domain: 'example.com:443',
            origin: 'http://example.com',
          },
          {
            domain: 'example.com:80',
            origin: 'https://example.com',
          },
        ],
      },
    ];
    for (const { name, expected, cases } of checks) {
      for (const { domain, origin } of cases) {
        it(`should return ${expected} for ${name} ${JSON.stringify({
          domain,
          origin,
        })}`, () => {
          const result = isValidSIWEOrigin({
            from: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
            origin,
            siwe: {
              isSIWEMessage: true,
              parsedMessage: {
                ...optionalFields,
                ...expectedParsedMessage,
                domain,
              },
            },
          });
          expect(result).toBe(expected);
        });
      }
    }
  });
});

/**
 * Converts the text to hex.
 * @param string - text to convert
 * @returns hex string
 */
function textAsHex(string: string): string {
  return Buffer.from(string, 'utf8').toString('hex');
}
