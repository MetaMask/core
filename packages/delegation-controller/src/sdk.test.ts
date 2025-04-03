import type { Caveats } from '@metamask-private/delegator-core-viem';
import * as sdk from '@metamask-private/delegator-core-viem';
import type { Address, Hex } from 'viem';

import {
  createCaveatBuilder,
  createDelegation,
  encodeRedeemDelegations,
  getDelegationHash,
} from './sdk';
import type { Delegation } from './types';

const DELEGATION_MOCK: Delegation = {
  delegator: '0x1234567890123456789012345678901234567890' as Address,
  delegate: '0x2234567890123456789012345678901234567890' as Address,
  authority:
    '0x3234567890123456789012345678901234567890000000000000000000000000' as Hex,
  caveats: [],
  salt: '0x0' as Hex,
  signature: '0x',
};

describe('sdk', () => {
  describe('createDelegation', () => {
    const delegator = '0x1234567890123456789012345678901234567890' as Address;
    const delegate = '0x2234567890123456789012345678901234567890' as Address;
    const authority =
      '0x3234567890123456789012345678901234567890000000000000000000000000' as Hex;
    const caveats: Caveats = [];
    const salt = '0x0' as Hex;

    it('creates a delegation with authority and delegate', () => {
      const delegation = createDelegation({
        delegator,
        delegate,
        authority,
        caveats,
        salt,
      });

      expect(delegation).toStrictEqual({
        delegator,
        delegate,
        authority,
        caveats,
        salt,
        signature: '0x',
      });
    });

    it('creates an open delegation with authority but no delegate', () => {
      const delegation = createDelegation({
        delegator,
        authority,
        caveats,
        salt,
      });

      expect(delegation).toStrictEqual({
        delegator,
        delegate: sdk.ANY_BENEFICIARY,
        authority,
        caveats,
        salt,
        signature: '0x',
      });
    });

    it('creates a root delegation with delegate but no authority', () => {
      const delegation = createDelegation({
        delegator,
        delegate,
        caveats,
        salt,
      });

      expect(delegation).toStrictEqual({
        delegator,
        delegate,
        authority: sdk.ROOT_AUTHORITY,
        caveats,
        salt,
        signature: '0x',
      });
    });

    it('creates an open root delegation with no authority and no delegate', () => {
      const delegation = createDelegation({
        delegator,
        caveats,
        salt,
      });

      expect(delegation).toStrictEqual({
        delegator,
        delegate: sdk.ANY_BENEFICIARY,
        authority: sdk.ROOT_AUTHORITY,
        caveats,
        salt,
        signature: '0x',
      });
    });

    it('creates a delegation with undefined salt', () => {
      const delegation = createDelegation({
        delegator,
        delegate,
        authority,
        caveats,
      });

      expect(delegation).toStrictEqual({
        delegator,
        delegate,
        authority,
        caveats,
        salt: '0x0' as Hex,
        signature: '0x',
      });
    });
  });

  describe('createCaveatBuilder', () => {
    it('creates a caveat builder for a given chain ID', () => {
      const chainId = 11155111; // sepolia
      const builder = createCaveatBuilder(chainId);
      expect(builder).toBeDefined();
      // Note: We can't test the internal implementation as it's from the SDK
      // but we can verify the function returns something
    });
  });

  describe('encodeRedeemDelegations', () => {
    it('encodes redeem delegations with modes and executions', () => {
      const delegations = [[DELEGATION_MOCK]];
      const modes: sdk.ExecutionMode[] = [
        '0x0000000000000000000000000000000000000000000000000000000000000000',
      ];
      const executions: sdk.ExecutionStruct[][] = [
        [
          {
            target: '0x1234567890123456789012345678901234567890' as Address,
            value: BigInt(0),
            callData: '0x',
          },
        ],
      ];

      const result = encodeRedeemDelegations({
        delegations,
        modes,
        executions,
      });

      expect(result).toBeDefined();
    });

    it('handles multiple delegations in a single group', () => {
      const delegation2 = {
        ...DELEGATION_MOCK,
        delegator: '0x9234567890123456789012345678901234567890' as Address,
      };
      const delegations = [[DELEGATION_MOCK, delegation2]];
      const modes: sdk.ExecutionMode[] = [
        '0x0000000000000000000000000000000000000000000000000000000000000000',
      ];
      const executions: sdk.ExecutionStruct[][] = [
        [
          {
            target: '0x1234567890123456789012345678901234567890' as Address,
            value: BigInt(0),
            callData: '0x',
          },
        ],
      ];

      const result = encodeRedeemDelegations({
        delegations,
        modes,
        executions,
      });

      expect(result).toBeDefined();
    });

    it('handles multiple delegation groups', () => {
      const delegation2 = {
        ...DELEGATION_MOCK,
        delegator: '0x9234567890123456789012345678901234567890' as Address,
      };
      const delegations = [[DELEGATION_MOCK], [delegation2]];
      const modes: sdk.ExecutionMode[] = [
        '0x0000000000000000000000000000000000000000000000000000000000000000',
      ];
      const executions: sdk.ExecutionStruct[][] = [
        [
          {
            target: '0x1234567890123456789012345678901234567890' as Address,
            value: BigInt(0),
            callData: '0x',
          },
        ],
        [
          {
            target: '0x1234567890123456789012345678901234567890' as Address,
            value: BigInt(0),
            callData: '0x',
          },
        ],
      ];

      const result = encodeRedeemDelegations({
        delegations,
        modes,
        executions,
      });

      expect(result).toBeDefined();
    });
  });

  describe('getDelegationHash', () => {
    it('generates a hash for a delegation', () => {
      const hash = getDelegationHash(DELEGATION_MOCK);
      expect(hash).toBeDefined();
      expect(typeof hash).toBe('string');
      expect(hash.startsWith('0x')).toBe(true);
    });
  });
});
