import { createTimestampTerms } from '@metamask/delegation-core';
import {
  CHAIN_ID,
  DELEGATOR_CONTRACTS,
} from '@metamask/delegation-deployments';
import type { Hex } from '@metamask/utils';

import { makePermissionRule } from './makePermissionRule';
import type { DecodedPermission } from '../types';

describe('makePermissionRule', () => {
  const contracts = DELEGATOR_CONTRACTS['1.3.0'][CHAIN_ID.sepolia];
  const timestampEnforcer = contracts.TimestampEnforcer;
  const requiredEnforcer = contracts.NonceEnforcer;

  it('calls optional validate callback when provided and decoding succeeds', () => {
    const validate = jest.fn<
      void,
      [DecodedPermission['permission']['data'], number | null]
    >();
    const decodeData = jest.fn().mockReturnValue({});

    const rule = makePermissionRule({
      permissionType: 'native-token-stream',
      timestampEnforcer,
      optionalEnforcers: [],
      requiredEnforcers: new Map([[requiredEnforcer, 1]]),
      decodeData,
      validate,
    });

    const caveats = [
      {
        enforcer: timestampEnforcer,
        terms: createTimestampTerms({
          timestampAfterThreshold: 0,
          timestampBeforeThreshold: 1720000,
        }),
        args: '0x' as Hex,
      },
      {
        enforcer: requiredEnforcer,
        terms: '0x' as Hex,
        args: '0x' as Hex,
      },
    ];

    const result = rule.validateAndDecodePermission(caveats);

    expect(result.isValid).toBe(true);
    if (!result.isValid) {
      throw new Error('Expected valid result');
    }
    expect(result.expiry).toBe(1720000);
    expect(result.data).toStrictEqual({});
    expect(decodeData).toHaveBeenCalled();
    expect(validate).toHaveBeenCalledWith({}, 1720000);
  });
});
