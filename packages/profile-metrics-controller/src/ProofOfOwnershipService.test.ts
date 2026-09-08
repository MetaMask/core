import type { InternalAccount } from '@metamask/keyring-internal-api';
import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MockAnyNamespace,
  MessengerActions,
  MessengerEvents,
} from '@metamask/messenger';

import { ProofOfOwnershipService } from './index.js';
import type { ProofOfOwnershipServiceMessenger } from './index.js';
import {
  SNAP_SIGN_PROOF_OF_OWNERSHIP_BATCH_METHOD,
  SNAP_SIGN_PROOF_OF_OWNERSHIP_METHOD,
} from './ProofOfOwnershipService.js';
import { ProofUnsupportedNamespaceError } from './utils/canonicalize.js';

/**
 * Creates a mock InternalAccount with the given scopes. EVM accounts are
 * built with no `metadata.snap`; non-EVM accounts get a snap entry so the
 * service can route to `SnapController:handleRequest`.
 *
 * @param overrides - Partial overrides for the account fields. Provide
 * `scopes` to control namespace dispatch, `address` to control the canonical
 * address used in the signed message, and `metadata.snap.id` to override
 * the default `'npm:@metamask/test-wallet-snap'`.
 * @returns A mock InternalAccount.
 */
function createMockAccount(
  overrides: Partial<InternalAccount> = {},
): InternalAccount {
  const scopes = overrides.scopes ?? ['eip155:1'];
  const isEvm = scopes[0]?.startsWith('eip155');
  const baseMetadata = {
    keyring: { type: 'Test Keyring' },
    name: 'Mock Account',
    importTime: 0,
  };
  const metadata = isEvm
    ? baseMetadata
    : {
        ...baseMetadata,
        snap: {
          id: 'npm:@metamask/test-wallet-snap',
          name: 'Test Wallet Snap',
          enabled: true,
        },
      };

  return {
    id: 'mock-account-id',
    address: '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed',
    type: 'eip155:eoa',
    options: {},
    methods: [],
    scopes,
    ...overrides,
    // When the caller passes `metadata`, take it verbatim (full replacement)
    // so tests can express "no snap" / "snap-with-no-id" / etc. without
    // having to fight a merge.
    metadata: overrides.metadata ?? metadata,
  } as InternalAccount;
}

describe('ProofOfOwnershipService', () => {
  describe('constructor', () => {
    it('registers the sign messenger action on construction', async () => {
      const { rootMessenger } = getService();

      // The service is reachable only if the constructor registered the
      // `sign` action on its messenger; if it hadn't, this call would
      // throw "Action handler not found" before any of the test stubs ran.
      const proof = await rootMessenger.call('ProofOfOwnershipService:sign', {
        account: createMockAccount(),
        nonce: 'n0',
      });

      expect(proof).toStrictEqual({
        nonce: 'n0',
        signature: '0xdefaultsig',
      });
    });

    it('registers the signBatch messenger action on construction', async () => {
      const { rootMessenger } = getService();

      const response = await rootMessenger.call(
        'ProofOfOwnershipService:signBatch',
        {
          items: [{ account: createMockAccount(), nonce: 'n0' }],
        },
      );

      expect(response).toStrictEqual({
        results: [{ proof: { nonce: 'n0', signature: '0xdefaultsig' } }],
      });
    });
  });

  describe('eip155 dispatch', () => {
    it('routes EVM accounts through KeyringController:signPersonalMessage with the canonical message', async () => {
      const signPersonalMessage = jest
        .fn<Promise<string>, [{ data: string; from: string }]>()
        .mockResolvedValue('0xevmsignature');
      const { rootMessenger } = getService({ signPersonalMessage });

      // Lowercase address on input — service must canonicalize to EIP-55 in
      // the signed message even when the keyring is asked to sign as the
      // raw account address.
      const account = createMockAccount({
        address: '0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed',
        scopes: ['eip155:1'],
      });

      const proof = await rootMessenger.call('ProofOfOwnershipService:sign', {
        account,
        nonce: 'abc123',
      });

      expect(signPersonalMessage).toHaveBeenCalledTimes(1);
      expect(signPersonalMessage).toHaveBeenCalledWith({
        data: 'metamask:proof-of-ownership:abc123:0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed',
        from: '0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed',
      });
      expect(proof).toStrictEqual({
        nonce: 'abc123',
        signature: '0xevmsignature',
      });
    });

    it('surfaces errors thrown by the keyring without wrapping them', async () => {
      const signPersonalMessage = jest
        .fn<Promise<string>, [{ data: string; from: string }]>()
        .mockRejectedValue(new Error('keyring locked'));
      const { rootMessenger } = getService({ signPersonalMessage });

      await expect(
        rootMessenger.call('ProofOfOwnershipService:sign', {
          account: createMockAccount(),
          nonce: 'n',
        }),
      ).rejects.toThrow('keyring locked');
    });
  });

  describe('snap dispatch', () => {
    it.each([
      {
        namespace: 'solana',
        scope: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
        address: '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM',
      },
      {
        namespace: 'tron',
        scope: 'tron:0x2b6653dc',
        address: 'TRX9Yg4yFqyKBcXBSc1nKMpHsfYVgKvN3p',
      },
      {
        namespace: 'bip122',
        scope: 'bip122:000000000019d6689c085ae165831e93',
        address: 'BC1QW508D6QEJXTDG4Y5R3ZARVARY0C5XW7KV8F3T4',
      },
    ])(
      'routes $namespace accounts through SnapController:handleRequest with the canonical message',
      async ({ address, scope }) => {
        const snapHandle = jest
          .fn<Promise<unknown>, [unknown]>()
          .mockResolvedValue({ signature: '0xsnapsig' });
        const { rootMessenger } = getService({
          snapHandle,
        });
        const account = createMockAccount({
          id: 'snap-account-id',
          address,
          scopes: [scope as `${string}:${string}`],
        });

        const proof = await rootMessenger.call('ProofOfOwnershipService:sign', {
          account,
          nonce: 'n42',
        });

        expect(snapHandle).toHaveBeenCalledTimes(1);
        const [request] = snapHandle.mock.calls[0] as [
          {
            snapId: string;
            origin: string;
            handler: string;
            request: {
              jsonrpc: string;
              method: string;
              params: { accountId: string; message: string };
            };
          },
        ];
        expect(request.snapId).toBe('npm:@metamask/test-wallet-snap');
        expect(request.origin).toBe('metamask');
        expect(request.handler).toBe('onClientRequest');
        expect(request.request.jsonrpc).toBe('2.0');
        expect(request.request.method).toBe(
          SNAP_SIGN_PROOF_OF_OWNERSHIP_METHOD,
        );
        expect(request.request.params.accountId).toBe('snap-account-id');
        // The message payload uses the canonical address — bech32 lowercased
        // for BIP-122, base58 verbatim for Solana/Tron.
        expect(request.request.params.message).toMatch(
          /^metamask:proof-of-ownership:n42:/u,
        );
        expect(proof).toStrictEqual({ nonce: 'n42', signature: '0xsnapsig' });
      },
    );

    it('throws a descriptive error when the account has no snap metadata', async () => {
      const { rootMessenger } = getService();
      const account = createMockAccount({
        id: 'orphan',
        scopes: ['solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp'],
        address: '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM',
        metadata: {
          keyring: { type: 'Test Keyring' },
          name: 'Orphan',
          importTime: 0,
        },
      });

      await expect(
        rootMessenger.call('ProofOfOwnershipService:sign', {
          account,
          nonce: 'n',
        }),
      ).rejects.toThrow(
        "ProofOfOwnershipService: account 'orphan' has no snap to sign a proof of ownership.",
      );
    });

    it('throws when the snap returns a malformed response (missing signature)', async () => {
      const snapHandle = jest
        .fn<Promise<unknown>, [unknown]>()
        .mockResolvedValue({ notSignature: true });
      const { rootMessenger } = getService({ snapHandle });
      const account = createMockAccount({
        scopes: ['solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp'],
        address: '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM',
      });

      await expect(
        rootMessenger.call('ProofOfOwnershipService:sign', {
          account,
          nonce: 'n',
        }),
      ).rejects.toThrow(
        `ProofOfOwnershipService: snap 'npm:@metamask/test-wallet-snap' returned a malformed response to '${SNAP_SIGN_PROOF_OF_OWNERSHIP_METHOD}'.`,
      );
    });

    it('throws when the snap returns a non-string signature', async () => {
      const snapHandle = jest
        .fn<Promise<unknown>, [unknown]>()
        .mockResolvedValue({ signature: 12345 });
      const { rootMessenger } = getService({ snapHandle });
      const account = createMockAccount({
        scopes: ['solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp'],
        address: '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM',
      });

      await expect(
        rootMessenger.call('ProofOfOwnershipService:sign', {
          account,
          nonce: 'n',
        }),
      ).rejects.toThrow(/returned a malformed response/u);
    });

    it('tolerates additional fields in the snap response (forward-compatible schema)', async () => {
      const snapHandle = jest
        .fn<Promise<unknown>, [unknown]>()
        .mockResolvedValue({
          signature: '0xsnapsig',
          publicKey: '0xpub',
          algorithm: 'ed25519',
        });
      const { rootMessenger } = getService({ snapHandle });
      const account = createMockAccount({
        scopes: ['solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp'],
        address: '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM',
      });

      const proof = await rootMessenger.call('ProofOfOwnershipService:sign', {
        account,
        nonce: 'n',
      });

      expect(proof.signature).toBe('0xsnapsig');
    });

    it('surfaces errors thrown by the snap without wrapping them', async () => {
      const snapHandle = jest
        .fn<Promise<unknown>, [unknown]>()
        .mockRejectedValue(new Error('snap unavailable'));
      const { rootMessenger } = getService({ snapHandle });
      const account = createMockAccount({
        scopes: ['solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp'],
        address: '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM',
      });

      await expect(
        rootMessenger.call('ProofOfOwnershipService:sign', {
          account,
          nonce: 'n',
        }),
      ).rejects.toThrow('snap unavailable');
    });
  });

  describe('batch dispatch', () => {
    it('routes EVM accounts through KeyringController:signPersonalMessage in input order', async () => {
      const signPersonalMessage = jest
        .fn<Promise<string>, [{ data: string; from: string }]>()
        .mockResolvedValueOnce('0xsig1')
        .mockResolvedValueOnce('0xsig2');
      const { rootMessenger } = getService({ signPersonalMessage });
      const account1 = createMockAccount({
        id: 'evm-1',
        address: '0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed',
      });
      const account2 = createMockAccount({
        id: 'evm-2',
        address: '0xfb6916095ca1df60bb79ce92ce3ea74c37c5d359',
      });

      const response = await rootMessenger.call(
        'ProofOfOwnershipService:signBatch',
        {
          items: [
            { account: account1, nonce: 'n1' },
            { account: account2, nonce: 'n2' },
          ],
        },
      );

      expect(signPersonalMessage).toHaveBeenCalledTimes(2);
      expect(signPersonalMessage).toHaveBeenNthCalledWith(1, {
        data: 'metamask:proof-of-ownership:n1:0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed',
        from: account1.address,
      });
      expect(signPersonalMessage).toHaveBeenNthCalledWith(2, {
        data: 'metamask:proof-of-ownership:n2:0xfB6916095ca1df60bB79Ce92cE3Ea74c37c5d359',
        from: account2.address,
      });
      expect(response).toStrictEqual({
        results: [
          { proof: { nonce: 'n1', signature: '0xsig1' } },
          { proof: { nonce: 'n2', signature: '0xsig2' } },
        ],
      });
    });

    it('returns item-level errors for EVM signing failures', async () => {
      const signPersonalMessage = jest
        .fn<Promise<string>, [{ data: string; from: string }]>()
        .mockRejectedValue(new Error('keyring locked'));
      const { rootMessenger } = getService({ signPersonalMessage });

      const response = await rootMessenger.call(
        'ProofOfOwnershipService:signBatch',
        {
          items: [{ account: createMockAccount(), nonce: 'n' }],
        },
      );

      expect(response).toStrictEqual({
        results: [{ error: 'keyring locked' }],
      });
    });

    it('stringifies non-Error values thrown while signing batch requests', async () => {
      const signPersonalMessage = jest
        .fn<Promise<string>, [{ data: string; from: string }]>()
        .mockRejectedValue('keyring locked');
      const { rootMessenger } = getService({ signPersonalMessage });

      const response = await rootMessenger.call(
        'ProofOfOwnershipService:signBatch',
        {
          items: [{ account: createMockAccount(), nonce: 'n' }],
        },
      );

      expect(response).toStrictEqual({
        results: [{ error: 'keyring locked' }],
      });
    });

    it('returns an item-level error when a snap account has no snap metadata', async () => {
      const snapHandle = jest.fn<Promise<unknown>, [unknown]>();
      const { rootMessenger } = getService({ snapHandle });
      const account = createMockAccount({
        id: 'orphan',
        scopes: ['solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp'],
        address: '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM',
        metadata: {
          keyring: { type: 'Test Keyring' },
          name: 'Orphan',
          importTime: 0,
        },
      });

      const response = await rootMessenger.call(
        'ProofOfOwnershipService:signBatch',
        {
          items: [{ account, nonce: 'n' }],
        },
      );

      expect(response).toStrictEqual({
        results: [
          {
            error:
              "ProofOfOwnershipService: account 'orphan' has no snap to sign a proof of ownership.",
          },
        ],
      });
      expect(snapHandle).not.toHaveBeenCalled();
    });

    it('returns an item-level error when an account namespace is unsupported', async () => {
      const snapHandle = jest.fn<Promise<unknown>, [unknown]>();
      const { rootMessenger } = getService({ snapHandle });
      const account = createMockAccount({
        scopes: ['cosmos:cosmoshub-4'],
        address: 'cosmos1abc',
      });

      const response = await rootMessenger.call(
        'ProofOfOwnershipService:signBatch',
        {
          items: [{ account, nonce: 'n' }],
        },
      );

      expect(response).toStrictEqual({
        results: [
          {
            error:
              "Proof of ownership is not supported for namespace 'cosmos'.",
          },
        ],
      });
      expect(snapHandle).not.toHaveBeenCalled();
    });

    it('groups snap accounts by snap ID and preserves per-item results', async () => {
      const snapHandle = jest
        .fn<Promise<unknown>, [unknown]>()
        .mockImplementation(async ({ snapId }: { snapId: string }) => {
          if (snapId === 'npm:@metamask/solana-wallet-snap') {
            return {
              results: [
                { accountId: 'solana-1', signature: '0xsolanasig' },
                { accountId: 'solana-2', error: 'account not found' },
              ],
            };
          }
          return {
            results: [{ accountId: 'tron-1', signature: '0xtronsig' }],
          };
        });
      const { rootMessenger } = getService({ snapHandle });
      const solanaMetadata = {
        keyring: { type: 'Snap Keyring' },
        name: 'Solana',
        importTime: 0,
        snap: {
          id: 'npm:@metamask/solana-wallet-snap',
          name: 'Solana Wallet Snap',
          enabled: true,
        },
      };
      const tronMetadata = {
        keyring: { type: 'Snap Keyring' },
        name: 'Tron',
        importTime: 0,
        snap: {
          id: 'npm:@metamask/tron-wallet-snap',
          name: 'Tron Wallet Snap',
          enabled: true,
        },
      };
      const solana1 = createMockAccount({
        id: 'solana-1',
        address: '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM',
        scopes: ['solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp'],
        metadata: solanaMetadata,
      });
      const tron = createMockAccount({
        id: 'tron-1',
        address: 'TRX9Yg4yFqyKBcXBSc1nKMpHsfYVgKvN3p',
        scopes: ['tron:0x2b6653dc'],
        metadata: tronMetadata,
      });
      const solana2 = createMockAccount({
        id: 'solana-2',
        address: 'ANotherSolanaAddress',
        scopes: ['solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp'],
        metadata: solanaMetadata,
      });

      const response = await rootMessenger.call(
        'ProofOfOwnershipService:signBatch',
        {
          items: [
            { account: solana1, nonce: 'n-sol-1' },
            { account: tron, nonce: 'n-tron' },
            { account: solana2, nonce: 'n-sol-2' },
          ],
        },
      );

      expect(snapHandle).toHaveBeenCalledTimes(2);
      expect(snapHandle).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          snapId: 'npm:@metamask/solana-wallet-snap',
          origin: 'metamask',
          handler: 'onClientRequest',
          request: expect.objectContaining({
            method: SNAP_SIGN_PROOF_OF_OWNERSHIP_BATCH_METHOD,
            params: {
              items: [
                {
                  accountId: 'solana-1',
                  message:
                    'metamask:proof-of-ownership:n-sol-1:9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM',
                },
                {
                  accountId: 'solana-2',
                  message:
                    'metamask:proof-of-ownership:n-sol-2:ANotherSolanaAddress',
                },
              ],
            },
          }),
        }),
      );
      expect(snapHandle).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          snapId: 'npm:@metamask/tron-wallet-snap',
          request: expect.objectContaining({
            method: SNAP_SIGN_PROOF_OF_OWNERSHIP_BATCH_METHOD,
            params: {
              items: [
                {
                  accountId: 'tron-1',
                  message:
                    'metamask:proof-of-ownership:n-tron:TRX9Yg4yFqyKBcXBSc1nKMpHsfYVgKvN3p',
                },
              ],
            },
          }),
        }),
      );
      expect(response).toStrictEqual({
        results: [
          { proof: { nonce: 'n-sol-1', signature: '0xsolanasig' } },
          { proof: { nonce: 'n-tron', signature: '0xtronsig' } },
          { error: 'account not found' },
        ],
      });
    });

    it('throws when a snap batch response is malformed', async () => {
      const snapHandle = jest
        .fn<Promise<unknown>, [unknown]>()
        .mockResolvedValue({ results: [{ accountId: 'snap-1' }] });
      const { rootMessenger } = getService({ snapHandle });
      const account = createMockAccount({
        id: 'snap-1',
        scopes: ['solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp'],
        address: '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM',
      });

      await expect(
        rootMessenger.call('ProofOfOwnershipService:signBatch', {
          items: [{ account, nonce: 'n' }],
        }),
      ).rejects.toThrow(
        `ProofOfOwnershipService: snap 'npm:@metamask/test-wallet-snap' returned a malformed response to '${SNAP_SIGN_PROOF_OF_OWNERSHIP_BATCH_METHOD}'.`,
      );
    });

    it('throws when a snap batch response result count does not match the request count', async () => {
      const snapHandle = jest
        .fn<Promise<unknown>, [unknown]>()
        .mockResolvedValue({ results: [] });
      const { rootMessenger } = getService({ snapHandle });
      const account = createMockAccount({
        id: 'snap-1',
        scopes: ['solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp'],
        address: '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM',
      });

      await expect(
        rootMessenger.call('ProofOfOwnershipService:signBatch', {
          items: [{ account, nonce: 'n' }],
        }),
      ).rejects.toThrow(
        `ProofOfOwnershipService: snap 'npm:@metamask/test-wallet-snap' returned 0 results for 1 '${SNAP_SIGN_PROOF_OF_OWNERSHIP_BATCH_METHOD}' requests.`,
      );
    });

    it('throws when a snap batch response does not preserve account order', async () => {
      const snapHandle = jest
        .fn<Promise<unknown>, [unknown]>()
        .mockResolvedValue({
          results: [{ accountId: 'wrong-account', signature: '0xsig' }],
        });
      const { rootMessenger } = getService({ snapHandle });
      const account = createMockAccount({
        id: 'snap-1',
        scopes: ['solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp'],
        address: '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM',
      });

      await expect(
        rootMessenger.call('ProofOfOwnershipService:signBatch', {
          items: [{ account, nonce: 'n' }],
        }),
      ).rejects.toThrow(
        "ProofOfOwnershipService: snap 'npm:@metamask/test-wallet-snap' returned a result for account 'wrong-account' at index 0, expected 'snap-1'.",
      );
    });

    it('surfaces snap batch request errors without singleton fallback', async () => {
      const snapHandle = jest
        .fn<Promise<unknown>, [unknown]>()
        .mockRejectedValue(new Error('batch unavailable'));
      const { rootMessenger } = getService({ snapHandle });
      const account = createMockAccount({
        scopes: ['solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp'],
        address: '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM',
      });

      await expect(
        rootMessenger.call('ProofOfOwnershipService:signBatch', {
          items: [{ account, nonce: 'n' }],
        }),
      ).rejects.toThrow('batch unavailable');
    });
  });

  describe('namespace handling', () => {
    it('throws ProofUnsupportedNamespaceError for unrecognized namespaces', async () => {
      const { rootMessenger } = getService();
      const account = createMockAccount({
        scopes: ['cosmos:cosmoshub-4'],
        address: 'cosmos1abc',
      });

      await expect(
        rootMessenger.call('ProofOfOwnershipService:sign', {
          account,
          nonce: 'n',
        }),
      ).rejects.toThrow(ProofUnsupportedNamespaceError);
    });

    it('throws ProofUnsupportedNamespaceError when the account has no scopes', async () => {
      const { rootMessenger } = getService();
      const account = createMockAccount({ scopes: [] });

      await expect(
        rootMessenger.call('ProofOfOwnershipService:sign', {
          account,
          nonce: 'n',
        }),
      ).rejects.toThrow(ProofUnsupportedNamespaceError);
    });

    it('throws ProofUnsupportedNamespaceError when the first scope is not a parseable CAIP-2 chain ID', async () => {
      const { rootMessenger } = getService();
      const account = createMockAccount({
        scopes: ['not-a-caip-chain-id' as `${string}:${string}`],
      });

      await expect(
        rootMessenger.call('ProofOfOwnershipService:sign', {
          account,
          nonce: 'n',
        }),
      ).rejects.toThrow(ProofUnsupportedNamespaceError);
    });

    it('dispatches based on the first scope when an account carries multiple scopes from the same namespace', async () => {
      const signPersonalMessage = jest
        .fn<Promise<string>, [{ data: string; from: string }]>()
        .mockResolvedValue('0xsig');
      const { rootMessenger } = getService({ signPersonalMessage });

      // Realistic case: multi-chain EVM account scoped to mainnet + polygon.
      const account = createMockAccount({
        scopes: ['eip155:1', 'eip155:137'],
      });

      await rootMessenger.call('ProofOfOwnershipService:sign', {
        account,
        nonce: 'n',
      });

      expect(signPersonalMessage).toHaveBeenCalledTimes(1);
    });
  });
});

/**
 * The type of the messenger populated with all external actions and events
 * required by the service under test.
 */
type RootMessenger = Messenger<
  MockAnyNamespace,
  MessengerActions<ProofOfOwnershipServiceMessenger>,
  MessengerEvents<ProofOfOwnershipServiceMessenger>
>;

/**
 * Constructs the messenger populated with all external actions and events
 * required by the service under test.
 *
 * @returns The root messenger.
 */
function getRootMessenger(): RootMessenger {
  return new Messenger({ namespace: MOCK_ANY_NAMESPACE });
}

/**
 * Constructs the messenger for the service under test, delegating the two
 * external actions it needs.
 *
 * @param rootMessenger - The root messenger, with all external actions and
 * events registered.
 * @returns The service-specific messenger.
 */
function getMessenger(
  rootMessenger: RootMessenger,
): ProofOfOwnershipServiceMessenger {
  const serviceMessenger: ProofOfOwnershipServiceMessenger = new Messenger({
    namespace: 'ProofOfOwnershipService',
    parent: rootMessenger,
  });
  rootMessenger.delegate({
    messenger: serviceMessenger,
    actions: [
      'KeyringController:signPersonalMessage',
      'SnapController:handleRequest',
    ],
  });
  return serviceMessenger;
}

/**
 * Constructs the service under test with the two external handlers wired up
 * (defaulting to inert stubs that can be overridden per test).
 *
 * @param args - Optional handler overrides.
 * @param args.signPersonalMessage - Stub for
 * `KeyringController:signPersonalMessage`. Defaults to a stub that resolves
 * to `'0xdefaultsig'`.
 * @param args.snapHandle - Stub for `SnapController:handleRequest`. Defaults
 * to a stub that resolves to `{ signature: '0xdefaultsnapsig' }`.
 * @returns The new service, the root messenger, and the service messenger.
 */
function getService({
  signPersonalMessage,
  snapHandle,
}: {
  signPersonalMessage?: (args: {
    data: string;
    from: string;
  }) => Promise<string>;
  snapHandle?: (args: unknown) => Promise<unknown>;
} = {}): {
  service: ProofOfOwnershipService;
  rootMessenger: RootMessenger;
  messenger: ProofOfOwnershipServiceMessenger;
} {
  const rootMessenger = getRootMessenger();
  rootMessenger.registerActionHandler(
    'KeyringController:signPersonalMessage',
    signPersonalMessage ?? (async (): Promise<string> => '0xdefaultsig'),
  );
  rootMessenger.registerActionHandler(
    'SnapController:handleRequest',
    (snapHandle ??
      (async (): Promise<{ signature: string }> => ({
        signature: '0xdefaultsnapsig',
      }))) as never,
  );

  const messenger = getMessenger(rootMessenger);
  const service = new ProofOfOwnershipService({ messenger });

  return { service, rootMessenger, messenger };
}
