import {
  createNativeTokenStreamingTerms,
  createTimestampTerms,
  Delegation,
  encodeDelegations,
  ROOT_AUTHORITY,
} from '@metamask/delegation-core';
import {
  CHAIN_ID,
  DELEGATOR_CONTRACTS,
} from '@metamask/delegation-deployments';
import { hexToBigInt, numberToHex } from '@metamask/utils';
import type { Hex } from '@metamask/utils';

import { DELEGATION_FRAMEWORK_VERSION } from './constants';
import {
  encodeDisabledDelegationsCalldata,
  getExpiryFromDelegation,
  readDelegationDisabledOnChain,
  readLatestBlockTimestampSeconds,
  resolveGrantedPermissionOnChainStatus,
  updateGrantedPermissionsStatus,
} from './permissionOnChainStatus';
import type { PermissionInfoWithMetadata } from './types';

const contracts =
  DELEGATOR_CONTRACTS[DELEGATION_FRAMEWORK_VERSION][CHAIN_ID.sepolia];

const { TimestampEnforcer, NativeTokenStreamingEnforcer } = contracts;

describe('permissionOnChainStatus', () => {
  describe('encodeDisabledDelegationsCalldata', () => {
    it('prefixes calldata with disabledDelegations(bytes32) selector', () => {
      const hash =
        '0x1111111111111111111111111111111111111111111111111111111111111111';
      const data = encodeDisabledDelegationsCalldata(hash);
      expect(data.startsWith('0x2d40d052')).toBe(true);
      expect(data).toHaveLength(2 + 8 + 64);
    });
  });

  describe('getExpiryFromDelegation', () => {
    it('returns expiry from TimestampEnforcer caveat terms', () => {
      const expirySeconds = 1893456000;
      const terms = createTimestampTerms({
        timestampAfterThreshold: 0,
        timestampBeforeThreshold: expirySeconds,
      });
      const delegation: Delegation<Hex> = {
        delegate: '0x4f71DA06987BfeDE90aF0b33E1e3e4ffDCEE7a63',
        delegator: '0xB68c70159E9892DdF5659ec42ff9BD2bbC23e778',
        authority: ROOT_AUTHORITY,
        caveats: [
          {
            enforcer: NativeTokenStreamingEnforcer,
            terms: createNativeTokenStreamingTerms({
              initialAmount: hexToBigInt('0x6f05b59d3b20000'),
              maxAmount: hexToBigInt('0x22b1c8c1227a0000'),
              amountPerSecond: hexToBigInt('0x6f05b59d3b20000'),
              startTime: 1747699200,
            }),
            args: '0x',
          },
          {
            enforcer: TimestampEnforcer,
            terms,
            args: '0x',
          },
        ],
        salt: 0n,
        signature: '0x' as const,
      };
      const result = getExpiryFromDelegation(delegation, contracts);
      expect(result).toBe(expirySeconds);
    });

    it('returns null when no timestamp caveat matches', () => {
      const delegation: Delegation<Hex> = {
        delegate: '0x4f71DA06987BfeDE90aF0b33E1e3e4ffDCEE7a63',
        delegator: '0xB68c70159E9892DdF5659ec42ff9BD2bbC23e778',
        authority: ROOT_AUTHORITY,
        caveats: [
          {
            enforcer: NativeTokenStreamingEnforcer,
            terms: createNativeTokenStreamingTerms({
              initialAmount: hexToBigInt('0x6f05b59d3b20000'),
              maxAmount: hexToBigInt('0x22b1c8c1227a0000'),
              amountPerSecond: hexToBigInt('0x6f05b59d3b20000'),
              startTime: 1747699200,
            }),
            args: '0x',
          },
        ],
        salt: 0n,
        signature: '0x' as const,
      };
      expect(getExpiryFromDelegation(delegation, contracts)).toBeNull();
    });

    it('returns null when TimestampEnforcer terms fail to decode', () => {
      const invalidTerms: Hex = `0x${'01'.repeat(32)}`;
      const delegation: Delegation<Hex> = {
        delegate: '0x4f71DA06987BfeDE90aF0b33E1e3e4ffDCEE7a63',
        delegator: '0xB68c70159E9892DdF5659ec42ff9BD2bbC23e778',
        authority: ROOT_AUTHORITY,
        caveats: [
          {
            enforcer: TimestampEnforcer,
            terms: invalidTerms,
            args: '0x',
          },
        ],
        salt: 0n,
        signature: '0x' as const,
      };
      expect(getExpiryFromDelegation(delegation, contracts)).toBeNull();
    });
  });

  describe('readDelegationDisabledOnChain', () => {
    it('returns true when eth_call result is bool true', async () => {
      const provider = {
        request: jest
          .fn()
          .mockResolvedValue(
            '0x0000000000000000000000000000000000000000000000000000000000000001',
          ),
      };
      expect(
        await readDelegationDisabledOnChain({
          provider,
          delegationManager: contracts.DelegationManager,
          delegationHash:
            '0x1111111111111111111111111111111111111111111111111111111111111111',
        }),
      ).toBe(true);
    });
  });

  describe('readLatestBlockTimestampSeconds', () => {
    it('returns the block timestamp in seconds', async () => {
      const timestamp = 1_700_000_000;
      const provider = {
        request: jest.fn().mockResolvedValue({
          timestamp: numberToHex(timestamp),
        }),
      };
      expect(await readLatestBlockTimestampSeconds(provider)).toBe(timestamp);
    });

    it('throws when the block payload has no timestamp', async () => {
      const provider = {
        request: jest.fn().mockResolvedValue({}),
      };
      await expect(readLatestBlockTimestampSeconds(provider)).rejects.toThrow(
        'Latest block missing timestamp',
      );
    });
  });

  describe('resolveGrantedPermissionOnChainStatus', () => {
    const contractsByChainId =
      DELEGATOR_CONTRACTS[DELEGATION_FRAMEWORK_VERSION];

    it('returns Revoked when revocationMetadata is present without calling the network', async () => {
      const getProviderForChainId = jest.fn();
      const entry: PermissionInfoWithMetadata = {
        permissionResponse: {
          chainId: numberToHex(CHAIN_ID.sepolia),
          from: '0xB68c70159E9892DdF5659ec42ff9BD2bbC23e778',
          permission: {
            type: 'native-token-stream',
            isAdjustmentAllowed: true,
            data: {
              maxAmount: '0x1',
              initialAmount: '0x1',
              amountPerSecond: '0x1',
              startTime: 1,
              justification: 'j',
            },
          },
          context: '0x00000000',
          delegationManager: contracts.DelegationManager,
        },
        siteOrigin: 'https://example.org',
        status: 'Active',
        revocationMetadata: { recordedAt: 1 },
      };

      const result = await resolveGrantedPermissionOnChainStatus(entry, {
        getProviderForChainId,
        contractsByChainId,
      });

      expect(result.status).toBe('Revoked');
      expect(getProviderForChainId).not.toHaveBeenCalled();
    });

    it('preserves prior status when decoded context does not contain exactly one delegation', async () => {
      const getProviderForChainId = jest.fn();
      const entry: PermissionInfoWithMetadata = {
        permissionResponse: {
          chainId: numberToHex(CHAIN_ID.sepolia),
          from: '0xB68c70159E9892DdF5659ec42ff9BD2bbC23e778',
          permission: {
            type: 'native-token-stream',
            isAdjustmentAllowed: true,
            data: {
              maxAmount: '0x1',
              initialAmount: '0x1',
              amountPerSecond: '0x1',
              startTime: 1,
              justification: 'j',
            },
          },
          context: '0x00000000',
          delegationManager: contracts.DelegationManager,
        },
        siteOrigin: 'https://example.org',
        status: 'Expired',
      };

      const result = await resolveGrantedPermissionOnChainStatus(entry, {
        getProviderForChainId,
        contractsByChainId,
      });

      expect(result.status).toBe('Expired');
      expect(getProviderForChainId).not.toHaveBeenCalled();
    });

    it('defaults missing entry status to Active when preserving after a resolution error', async () => {
      const getProviderForChainId = jest.fn();
      const entry = {
        permissionResponse: {
          chainId: numberToHex(CHAIN_ID.sepolia),
          from: '0xB68c70159E9892DdF5659ec42ff9BD2bbC23e778',
          permission: {
            type: 'native-token-stream',
            isAdjustmentAllowed: true,
            data: {
              maxAmount: '0x1',
              initialAmount: '0x1',
              amountPerSecond: '0x1',
              startTime: 1,
              justification: 'j',
            },
          },
          context: '0x00000000',
          delegationManager: contracts.DelegationManager,
        },
        siteOrigin: 'https://example.org',
        // status is missing, so we must add type assertion
      } as unknown as PermissionInfoWithMetadata;

      const result = await resolveGrantedPermissionOnChainStatus(entry, {
        getProviderForChainId,
        contractsByChainId,
      });

      expect(result.status).toBe('Active');
      expect(getProviderForChainId).not.toHaveBeenCalled();
    });

    it('sets Active when a single delegation is not disabled and has no timestamp expiry caveat', async () => {
      const delegation: Delegation<Hex> = {
        delegate: '0x4f71DA06987BfeDE90aF0b33E1e3e4ffDCEE7a63',
        delegator: '0xB68c70159E9892DdF5659ec42ff9BD2bbC23e778',
        authority: ROOT_AUTHORITY,
        caveats: [
          {
            enforcer: NativeTokenStreamingEnforcer,
            terms: createNativeTokenStreamingTerms({
              initialAmount: hexToBigInt('0x6f05b59d3b20000'),
              maxAmount: hexToBigInt('0x22b1c8c1227a0000'),
              amountPerSecond: hexToBigInt('0x6f05b59d3b20000'),
              startTime: 1747699200,
            }),
            args: '0x',
          },
        ],
        salt: 0n,
        signature: '0x',
      };
      const context = encodeDelegations([delegation]);
      const entry: PermissionInfoWithMetadata = {
        permissionResponse: {
          chainId: numberToHex(CHAIN_ID.sepolia),
          from: delegation.delegator,
          permission: {
            type: 'native-token-stream',
            isAdjustmentAllowed: true,
            data: {
              maxAmount: '0x22b1c8c1227a0000',
              initialAmount: '0x6f05b59d3b20000',
              amountPerSecond: '0x6f05b59d3b20000',
              startTime: 1747699200,
              justification: 'j',
            },
          },
          context,
          delegationManager: contracts.DelegationManager,
        },
        siteOrigin: 'https://example.org',
        status: 'Expired',
      };

      const getProviderForChainId = jest.fn().mockResolvedValue({
        request: jest.fn(async (req) => {
          if (req.method === 'eth_call') {
            return '0x0000000000000000000000000000000000000000000000000000000000000000';
          }
          if (req.method === 'eth_getBlockByNumber') {
            return { timestamp: numberToHex(2_000_000_000) };
          }
          throw new Error(`Unexpected RPC: ${req.method}`);
        }),
      });

      const result = await resolveGrantedPermissionOnChainStatus(entry, {
        getProviderForChainId,
        contractsByChainId,
      });

      expect(result.status).toBe('Active');
      expect(getProviderForChainId).toHaveBeenCalledTimes(1);
    });

    it('sets Expired when latest block time is at or past timestamp caveat expiry', async () => {
      const expirySeconds = 1_000_000_000;
      const terms = createTimestampTerms({
        timestampAfterThreshold: 0,
        timestampBeforeThreshold: expirySeconds,
      });
      const delegation: Delegation<Hex> = {
        delegate: '0x4f71DA06987BfeDE90aF0b33E1e3e4ffDCEE7a63',
        delegator: '0xB68c70159E9892DdF5659ec42ff9BD2bbC23e778',
        authority: ROOT_AUTHORITY,
        caveats: [
          {
            enforcer: NativeTokenStreamingEnforcer,
            terms: createNativeTokenStreamingTerms({
              initialAmount: hexToBigInt('0x6f05b59d3b20000'),
              maxAmount: hexToBigInt('0x22b1c8c1227a0000'),
              amountPerSecond: hexToBigInt('0x6f05b59d3b20000'),
              startTime: 1747699200,
            }),
            args: '0x',
          },
          {
            enforcer: TimestampEnforcer,
            terms,
            args: '0x',
          },
        ],
        salt: 0n,
        signature: '0x',
      };
      const context = encodeDelegations([delegation]);
      const entry: PermissionInfoWithMetadata = {
        permissionResponse: {
          chainId: numberToHex(CHAIN_ID.sepolia),
          from: delegation.delegator,
          permission: {
            type: 'native-token-stream',
            isAdjustmentAllowed: true,
            data: {
              maxAmount: '0x22b1c8c1227a0000',
              initialAmount: '0x6f05b59d3b20000',
              amountPerSecond: '0x6f05b59d3b20000',
              startTime: 1747699200,
              justification: 'j',
            },
          },
          context,
          delegationManager: contracts.DelegationManager,
        },
        siteOrigin: 'https://example.org',
        status: 'Active',
      };

      const getProviderForChainId = jest.fn().mockResolvedValue({
        request: jest.fn(async (req) => {
          if (req.method === 'eth_call') {
            return '0x0000000000000000000000000000000000000000000000000000000000000000';
          }
          if (req.method === 'eth_getBlockByNumber') {
            return { timestamp: numberToHex(expirySeconds) };
          }
          throw new Error(`Unexpected RPC: ${req.method}`);
        }),
      });

      const result = await resolveGrantedPermissionOnChainStatus(entry, {
        getProviderForChainId,
        contractsByChainId,
      });

      expect(result.status).toBe('Expired');
    });

    it('sets Revoked when disabledDelegations returns true', async () => {
      const delegation: Delegation<Hex> = {
        delegate: '0x4f71DA06987BfeDE90aF0b33E1e3e4ffDCEE7a63',
        delegator: '0xB68c70159E9892DdF5659ec42ff9BD2bbC23e778',
        authority: ROOT_AUTHORITY,
        caveats: [
          {
            enforcer: NativeTokenStreamingEnforcer,
            terms: createNativeTokenStreamingTerms({
              initialAmount: hexToBigInt('0x6f05b59d3b20000'),
              maxAmount: hexToBigInt('0x22b1c8c1227a0000'),
              amountPerSecond: hexToBigInt('0x6f05b59d3b20000'),
              startTime: 1747699200,
            }),
            args: '0x',
          },
        ],
        salt: 0n,
        signature: '0x',
      };
      const context = encodeDelegations([delegation]);
      const entry: PermissionInfoWithMetadata = {
        permissionResponse: {
          chainId: numberToHex(CHAIN_ID.sepolia),
          from: delegation.delegator,
          permission: {
            type: 'native-token-stream',
            isAdjustmentAllowed: true,
            data: {
              maxAmount: '0x22b1c8c1227a0000',
              initialAmount: '0x6f05b59d3b20000',
              amountPerSecond: '0x6f05b59d3b20000',
              startTime: 1747699200,
              justification: 'j',
            },
          },
          context,
          delegationManager: contracts.DelegationManager,
        },
        siteOrigin: 'https://example.org',
        status: 'Active',
      };

      const getProviderForChainId = jest.fn().mockResolvedValue({
        request: jest.fn(async (req) => {
          if (req.method === 'eth_call') {
            return '0x0000000000000000000000000000000000000000000000000000000000000001';
          }
          throw new Error(`Unexpected RPC: ${req.method}`);
        }),
      });

      const result = await resolveGrantedPermissionOnChainStatus(entry, {
        getProviderForChainId,
        contractsByChainId,
      });

      expect(result.status).toBe('Revoked');
    });

    it('preserves prior status when deployment contracts are missing for the chain', async () => {
      const delegation: Delegation<Hex> = {
        delegate: '0x4f71DA06987BfeDE90aF0b33E1e3e4ffDCEE7a63',
        delegator: '0xB68c70159E9892DdF5659ec42ff9BD2bbC23e778',
        authority: ROOT_AUTHORITY,
        caveats: [
          {
            enforcer: NativeTokenStreamingEnforcer,
            terms: createNativeTokenStreamingTerms({
              initialAmount: hexToBigInt('0x6f05b59d3b20000'),
              maxAmount: hexToBigInt('0x22b1c8c1227a0000'),
              amountPerSecond: hexToBigInt('0x6f05b59d3b20000'),
              startTime: 1747699200,
            }),
            args: '0x',
          },
        ],
        salt: 0n,
        signature: '0x',
      };
      const context = encodeDelegations([delegation]);
      const entry: PermissionInfoWithMetadata = {
        permissionResponse: {
          chainId: numberToHex(CHAIN_ID.sepolia),
          from: delegation.delegator,
          permission: {
            type: 'native-token-stream',
            isAdjustmentAllowed: true,
            data: {
              maxAmount: '0x22b1c8c1227a0000',
              initialAmount: '0x6f05b59d3b20000',
              amountPerSecond: '0x6f05b59d3b20000',
              startTime: 1747699200,
              justification: 'j',
            },
          },
          context,
          delegationManager: contracts.DelegationManager,
        },
        siteOrigin: 'https://example.org',
        status: 'Expired',
      };

      const getProviderForChainId = jest.fn().mockResolvedValue({
        request: jest.fn(async (req) => {
          if (req.method === 'eth_call') {
            return '0x0000000000000000000000000000000000000000000000000000000000000000';
          }
          throw new Error(`Unexpected RPC: ${req.method}`);
        }),
      });

      const result = await resolveGrantedPermissionOnChainStatus(entry, {
        getProviderForChainId,
        contractsByChainId: {},
      });

      expect(result.status).toBe('Expired');
    });

    it('sets Active when latest block is strictly before timestamp caveat expiry', async () => {
      const expirySeconds = 2_500_000_000;
      const blockSeconds = expirySeconds - 10_000;
      const terms = createTimestampTerms({
        timestampAfterThreshold: 0,
        timestampBeforeThreshold: expirySeconds,
      });
      const delegation: Delegation<Hex> = {
        delegate: '0x4f71DA06987BfeDE90aF0b33E1e3e4ffDCEE7a63',
        delegator: '0xB68c70159E9892DdF5659ec42ff9BD2bbC23e778',
        authority: ROOT_AUTHORITY,
        caveats: [
          {
            enforcer: NativeTokenStreamingEnforcer,
            terms: createNativeTokenStreamingTerms({
              initialAmount: hexToBigInt('0x6f05b59d3b20000'),
              maxAmount: hexToBigInt('0x22b1c8c1227a0000'),
              amountPerSecond: hexToBigInt('0x6f05b59d3b20000'),
              startTime: 1747699200,
            }),
            args: '0x',
          },
          {
            enforcer: TimestampEnforcer,
            terms,
            args: '0x',
          },
        ],
        salt: 0n,
        signature: '0x',
      };
      const context = encodeDelegations([delegation]);
      const entry: PermissionInfoWithMetadata = {
        permissionResponse: {
          chainId: numberToHex(CHAIN_ID.sepolia),
          from: delegation.delegator,
          permission: {
            type: 'native-token-stream',
            isAdjustmentAllowed: true,
            data: {
              maxAmount: '0x22b1c8c1227a0000',
              initialAmount: '0x6f05b59d3b20000',
              amountPerSecond: '0x6f05b59d3b20000',
              startTime: 1747699200,
              justification: 'j',
            },
          },
          context,
          delegationManager: contracts.DelegationManager,
        },
        siteOrigin: 'https://example.org',
        status: 'Expired',
      };

      const getProviderForChainId = jest.fn().mockResolvedValue({
        request: jest.fn(async (req) => {
          if (req.method === 'eth_call') {
            return '0x0000000000000000000000000000000000000000000000000000000000000000';
          }
          if (req.method === 'eth_getBlockByNumber') {
            return { timestamp: numberToHex(blockSeconds) };
          }
          throw new Error(`Unexpected RPC: ${req.method}`);
        }),
      });

      const result = await resolveGrantedPermissionOnChainStatus(entry, {
        getProviderForChainId,
        contractsByChainId,
      });

      expect(result.status).toBe('Active');
    });
  });

  describe('updateGrantedPermissionsStatus', () => {
    it('resolves each permission entry', async () => {
      const getProviderForChainId = jest.fn();
      const contractsByChainId =
        DELEGATOR_CONTRACTS[DELEGATION_FRAMEWORK_VERSION];

      const entry: PermissionInfoWithMetadata = {
        permissionResponse: {
          chainId: numberToHex(CHAIN_ID.sepolia),
          from: '0xB68c70159E9892DdF5659ec42ff9BD2bbC23e778',
          permission: {
            type: 'native-token-stream',
            isAdjustmentAllowed: true,
            data: {
              maxAmount: '0x1',
              initialAmount: '0x1',
              amountPerSecond: '0x1',
              startTime: 1,
              justification: 'j',
            },
          },
          context: '0x00000000',
          delegationManager: contracts.DelegationManager,
        },
        siteOrigin: 'https://a.example',
        status: 'Active',
        revocationMetadata: { recordedAt: 1 },
      };

      const results = await updateGrantedPermissionsStatus(
        [entry, { ...entry, siteOrigin: 'https://b.example' }],
        { getProviderForChainId, contractsByChainId },
      );

      expect(results).toHaveLength(2);
      expect(results[0].status).toBe('Revoked');
      expect(results[1].status).toBe('Revoked');
      expect(getProviderForChainId).not.toHaveBeenCalled();
    });
  });
});
