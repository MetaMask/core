import { SolScope } from '@metamask/keyring-api';
import { v4 as uuid } from 'uuid';

import {
  getMinimumBalanceForRentExemptionRequest,
  computeFeeRequest,
} from './snaps';

jest.mock('uuid', () => ({
  v4: jest.fn(),
}));

describe('Snaps Utils', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (uuid as jest.Mock).mockReturnValue('test-uuid-1234');
  });

  describe('getMinimumBalanceForRentExemptionRequest', () => {
    it('should create a proper request for getting minimum balance for rent exemption', () => {
      const snapId = 'test-snap-id';
      const result = getMinimumBalanceForRentExemptionRequest(snapId);

      expect(result.snapId).toBe(snapId);
      expect(result.origin).toBe('metamask');
      expect(result.handler).toBe('onProtocolRequest');
      expect(result.request.method).toBe(' ');
      expect(result.request.jsonrpc).toBe('2.0');
      expect(result.request.params.scope).toBe(SolScope.Mainnet);
      expect(result.request.params.request.id).toBe('test-uuid-1234');
      expect(result.request.params.request.jsonrpc).toBe('2.0');
      expect(result.request.params.request.method).toBe(
        'getMinimumBalanceForRentExemption',
      );
      expect(result.request.params.request.params).toStrictEqual([
        0,
        { commitment: 'confirmed' },
      ]);
    });
  });

  describe('computeFeeRequest', () => {
    it('should create a proper request for computing fees', () => {
      const snapId = 'test-snap-id';
      const transaction = 'base64-encoded-transaction';
      const accountId = 'test-account-id';
      const scope = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp' as const;

      const result = computeFeeRequest(snapId, transaction, accountId, scope);

      expect(result.snapId).toBe(snapId);
      expect(result.origin).toBe('metamask');
      expect(result.handler).toBe('onClientRequest');
      expect(result.request.id).toBe('test-uuid-1234');
      expect(result.request.jsonrpc).toBe('2.0');
      expect(result.request.method).toBe('computeFee');
      expect(result.request.params.transaction).toBe(transaction);
      expect(result.request.params.accountId).toBe(accountId);
      expect(result.request.params.scope).toBe(scope);
    });

    it('should handle different chain scopes', () => {
      const snapId = 'test-snap-id';
      const transaction = 'base64-encoded-transaction';
      const accountId = 'test-account-id';
      const btcScope = 'bip122:000000000019d6689c085ae165831e93' as const;

      const result = computeFeeRequest(
        snapId,
        transaction,
        accountId,
        btcScope,
      );

      expect(result.request.params.scope).toBe(btcScope);
    });
  });
});
