import { SolScope } from '@metamask/keyring-api';
import { v4 as uuid } from 'uuid';

import {
  getMinimumBalanceForRentExemptionRequest,
  computeFeeRequest,
  signAndSendTransactionRequest,
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
      expect(result.request.method).toBe('ClientRequest:computeFee');
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

  describe('signAndSendTransactionRequest', () => {
    it('should create a proper request without options', () => {
      const snapId = 'test-snap-id';
      const transaction = 'base64-encoded-transaction';
      const scope = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp' as const;
      const accountId = 'test-account-id';

      const result = signAndSendTransactionRequest(
        snapId,
        transaction,
        scope,
        accountId,
      );

      expect(result.snapId).toBe(snapId);
      expect(result.origin).toBe('metamask');
      expect(result.handler).toBe('onClientRequest');
      expect(result.request.id).toBe('test-uuid-1234');
      expect(result.request.jsonrpc).toBe('2.0');
      expect(result.request.method).toBe(
        'ClientRequest:signAndSendTransaction',
      );
      expect(result.request.params.transaction).toBe(transaction);
      expect(result.request.params.scope).toBe(scope);
      expect(result.request.params.accountId).toBe(accountId);
      expect(result.request.params).not.toHaveProperty('options');
    });

    it('should create a proper request with options', () => {
      const snapId = 'test-snap-id';
      const transaction = 'base64-encoded-transaction';
      const scope = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp' as const;
      const accountId = 'test-account-id';
      const options = {
        skipPreflight: true,
        maxRetries: 3,
      };

      const result = signAndSendTransactionRequest(
        snapId,
        transaction,
        scope,
        accountId,
        options,
      );

      expect(result.snapId).toBe(snapId);
      expect(result.origin).toBe('metamask');
      expect(result.handler).toBe('onClientRequest');
      expect(result.request.id).toBe('test-uuid-1234');
      expect(result.request.jsonrpc).toBe('2.0');
      expect(result.request.method).toBe(
        'ClientRequest:signAndSendTransaction',
      );
      expect(result.request.params.transaction).toBe(transaction);
      expect(result.request.params.scope).toBe(scope);
      expect(result.request.params.accountId).toBe(accountId);
      expect(result.request.params.options).toStrictEqual(options);
    });

    it('should handle different chain scopes', () => {
      const snapId = 'test-snap-id';
      const transaction = 'base64-encoded-transaction';
      const tronScope = 'tron:0x2b6653dc' as const;
      const accountId = 'test-account-id';

      const result = signAndSendTransactionRequest(
        snapId,
        transaction,
        tronScope,
        accountId,
      );

      expect(result.request.params.scope).toBe(tronScope);
    });

    it('should not include options key when options is undefined', () => {
      const snapId = 'test-snap-id';
      const transaction = 'base64-encoded-transaction';
      const scope = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp' as const;
      const accountId = 'test-account-id';

      const result = signAndSendTransactionRequest(
        snapId,
        transaction,
        scope,
        accountId,
        undefined,
      );

      expect(result.request.params).not.toHaveProperty('options');
    });

    it('should not include options key when options is null', () => {
      const snapId = 'test-snap-id';
      const transaction = 'base64-encoded-transaction';
      const scope = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp' as const;
      const accountId = 'test-account-id';

      const result = signAndSendTransactionRequest(
        snapId,
        transaction,
        scope,
        accountId,
        null as unknown as Record<string, unknown>,
      );

      expect(result.request.params).not.toHaveProperty('options');
    });

    it('should include options key when options is empty object', () => {
      const snapId = 'test-snap-id';
      const transaction = 'base64-encoded-transaction';
      const scope = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp' as const;
      const accountId = 'test-account-id';

      const result = signAndSendTransactionRequest(
        snapId,
        transaction,
        scope,
        accountId,
        {},
      );

      expect(result.request.params).toHaveProperty('options');
      expect(result.request.params.options).toStrictEqual({});
    });
  });
});
