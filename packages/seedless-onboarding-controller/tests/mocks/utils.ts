import type { DecodedBaseJWTToken } from '../../src/types';

/**
 * Creates a mock JWT token for testing
 *
 * @param payload - The payload to encode
 * @returns The JWT token string
 */
export function createMockJWTToken(
  payload: Partial<DecodedBaseJWTToken> = {},
): string {
  const defaultPayload: DecodedBaseJWTToken = {
    exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
    iat: Math.floor(Date.now() / 1000), // issued now
    aud: 'mock_audience',
    iss: 'mock_issuer',
    sub: 'mock_subject',
    ...payload,
  };
  const header = { alg: 'HS256', typ: 'JWT' };
  const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64');
  const encodedPayload = Buffer.from(JSON.stringify(defaultPayload)).toString(
    'base64',
  );
  const signature = 'mock_signature';
  return `${encodedHeader}.${encodedPayload}.${signature}`;
}
