import { bytesToBase64 } from '@metamask/utils';
import { utf8ToBytes } from '@noble/ciphers/utils';

import type { DecodedNodeAuthToken, DecodedBaseJWTToken } from './types';
import { decodeNodeAuthToken, decodeJWTToken } from './utils';

describe('utils', () => {
  describe('decodeNodeAuthToken', () => {
    /**
     * Creates a mock node auth token for testing
     *
     * @param params - The parameters for the token
     * @returns The base64 encoded token
     */
    const createMockNodeAuthToken = (
      params: Partial<DecodedNodeAuthToken> = {},
    ): string => {
      const defaultToken: DecodedNodeAuthToken = {
        exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
        temp_key_x: 'mock_temp_key_x',
        temp_key_y: 'mock_temp_key_y',
        aud: 'mock_audience',
        verifier_name: 'mock_verifier',
        verifier_id: 'mock_verifier_id',
        scope: 'mock_scope',
        signature: 'mock_signature',
        ...params,
      };
      const tokenJson = JSON.stringify(defaultToken);
      const tokenBytes = utf8ToBytes(tokenJson);
      return bytesToBase64(tokenBytes);
    };

    it('should successfully decode a valid node auth token', () => {
      const mockToken = createMockNodeAuthToken({
        exp: 1234567890,
        temp_key_x: 'test_key_x',
        temp_key_y: 'test_key_y',
        aud: 'test_audience',
        verifier_name: 'test_verifier',
        verifier_id: 'test_verifier_id',
        scope: 'test_scope',
        signature: 'test_signature',
      });

      const result = decodeNodeAuthToken(mockToken);

      expect(result).toStrictEqual({
        exp: 1234567890,
        temp_key_x: 'test_key_x',
        temp_key_y: 'test_key_y',
        aud: 'test_audience',
        verifier_name: 'test_verifier',
        verifier_id: 'test_verifier_id',
        scope: 'test_scope',
        signature: 'test_signature',
      });
    });

    it('should handle token with special characters in string fields', () => {
      const mockToken = createMockNodeAuthToken({
        verifier_name: 'test-verifier_name.with+special&chars',
        aud: 'https://example.com/audience',
        scope: 'read:profile write:data',
      });

      const result = decodeNodeAuthToken(mockToken);

      expect(result.verifier_name).toBe(
        'test-verifier_name.with+special&chars',
      );
      expect(result.aud).toBe('https://example.com/audience');
      expect(result.scope).toBe('read:profile write:data');
    });
  });

  describe('decodeJWTToken', () => {
    /**
     * Creates a mock JWT token for testing
     *
     * @param payload - The payload to encode
     * @returns The JWT token string
     */
    const createMockJWTToken = (
      payload: Partial<DecodedBaseJWTToken> = {},
    ): string => {
      const defaultPayload: DecodedBaseJWTToken = {
        exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
        iat: Math.floor(Date.now() / 1000), // issued now
        aud: 'mock_audience',
        iss: 'mock_issuer',
        sub: 'mock_subject',
        ...payload,
      };
      const header = { alg: 'HS256', typ: 'JWT' };
      const encodedHeader = Buffer.from(JSON.stringify(header)).toString(
        'base64',
      );
      const encodedPayload = Buffer.from(
        JSON.stringify(defaultPayload),
      ).toString('base64');
      const signature = 'mock_signature';
      return `${encodedHeader}.${encodedPayload}.${signature}`;
    };

    it('should successfully decode a valid JWT token', () => {
      const mockPayload = {
        exp: 1234567890,
        iat: 1234567800,
        aud: 'test_audience',
        iss: 'test_issuer',
        sub: 'test_subject',
      };
      const mockToken = createMockJWTToken(mockPayload);

      const result = decodeJWTToken(mockToken);

      expect(result).toStrictEqual(mockPayload);
    });

    it('should handle JWT token with padding issues', () => {
      // Create a token where the payload needs padding
      const payload = {
        exp: 123,
        iat: 100,
        aud: 'test',
        iss: 'test',
        sub: 'test',
      };
      const header = { alg: 'HS256', typ: 'JWT' };
      const encodedHeader = Buffer.from(JSON.stringify(header)).toString(
        'base64',
      );
      // Create a payload that when base64 encoded doesn't have proper padding
      const encodedPayload = Buffer.from(JSON.stringify(payload))
        .toString('base64')
        .replace(/[=]/gu, '');
      const signature = 'signature';
      const token = `${encodedHeader}.${encodedPayload}.${signature}`;

      const result = decodeJWTToken(token);

      expect(result.exp).toBe(123);
      expect(result.iat).toBe(100);
      expect(result.aud).toBe('test');
    });

    it('should throw an error for token with incorrect number of parts', () => {
      const invalidToken = 'header.payload'; // Missing signature

      expect(() => {
        decodeJWTToken(invalidToken);
      }).toThrow('Invalid JWT token format');
    });

    it('should throw an error for token with too many parts', () => {
      const invalidToken = 'header.payload.signature.extra'; // Too many parts

      expect(() => {
        decodeJWTToken(invalidToken);
      }).toThrow('Invalid JWT token format');
    });

    it('should handle token with special characters in string fields', () => {
      const mockToken = createMockJWTToken({
        aud: 'https://example.com/audience',
        iss: 'https://issuer.example.com',
        sub: 'user-123@example.com',
      });

      const result = decodeJWTToken(mockToken);

      expect(result.aud).toBe('https://example.com/audience');
      expect(result.iss).toBe('https://issuer.example.com');
      expect(result.sub).toBe('user-123@example.com');
    });
  });
});
