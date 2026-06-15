import type {
  Caveat,
} from '@metamask/delegation-core';
import {
  CHAIN_ID,
  DELEGATOR_CONTRACTS,
} from '@metamask/delegation-deployments';
import { getChecksumAddress } from '@metamask/utils';
import type { Hex } from '@metamask/utils';

import { getChecksumEnforcersByChainId } from '../utils';

import { makePermissionDecoder } from './makePermissionDecoder';
import { PermissionType, RuleDecoder } from '../types';
import { randomBytes } from 'crypto';
import { Rule } from '@metamask/7715-permission-types';

const randomAddress = () => `0x${randomBytes(20).toString('hex')}` as const;

describe('makePermissionDecoder', () => {
  const permissionType = 'specified-permission-type' as PermissionType;
  
  const contracts = DELEGATOR_CONTRACTS['1.3.0'][CHAIN_ID.sepolia];
  const contractAddresses = getChecksumEnforcersByChainId(contracts);

  describe('factory function', () => {
    it('returns the specified permission type', () => {
      const decoder = makePermissionDecoder({
        permissionType,
        contractAddresses,
        optionalEnforcers: [],
        requiredEnforcers: {},
        rules: [],
        validateAndDecodeData: jest.fn()
      });

      expect(decoder.permissionType).toStrictEqual(permissionType);
    });

    it('returns a set of checksummed optional enforcers', () => {
      const optionalEnforcers: Hex[] = [
        randomAddress(),
        randomAddress(),
        randomAddress()
      ];

      const decoder = makePermissionDecoder({
        permissionType,
        contractAddresses,
        optionalEnforcers,
        requiredEnforcers: {},
        rules: [],
        validateAndDecodeData: jest.fn()
      });

      expect(decoder.optionalEnforcers).toStrictEqual(
        new Set(optionalEnforcers.map(getChecksumAddress)),
      );
    });

    it ('returns a Map of checksummed required enforcers to their required count', () => {
      const requiredEnforcers = {
        [randomAddress()]: 1,
        [randomAddress()]: 2,
        [randomAddress()]: 3,
      };

      const decoder = makePermissionDecoder({
        permissionType,
        contractAddresses,
        optionalEnforcers: [],
        requiredEnforcers,
        rules: [],
        validateAndDecodeData: jest.fn()
      });

      const requiredEnforcersMap = new Map(
        Object.entries(requiredEnforcers).map(([enforcer, count]) => [
          getChecksumAddress(enforcer as Hex),
          count,
        ]),
      );

      expect(decoder.requiredEnforcers).toStrictEqual(requiredEnforcersMap);
    });
  });

  describe('caveatAddressesMatch', () => {
    it('returns true when the specified addresses match the required enforcers', () => {
      const enforcer1 = randomAddress();
      const enforcer2 = randomAddress();
      const enforcer3 = randomAddress();

      const requiredEnforcers = {
        [enforcer1]: 1,
        [enforcer2]: 1,
        [enforcer3]: 1,
      };

      const decoder = makePermissionDecoder({
        permissionType,
        contractAddresses,
        optionalEnforcers: [],
        requiredEnforcers,
        rules: [],
        validateAndDecodeData: jest.fn(),
      });

      const specifiedCaveats = [
        enforcer1,
        enforcer2,
        enforcer3,
      ];

      expect(decoder.caveatAddressesMatch(specifiedCaveats)).toBe(true);
    });

    it('returns true when the specified addresses include required addresses with the correct multiplicity', () => {
      const enforcer1 = randomAddress();
      const enforcer2 = randomAddress();
      const enforcer3 = randomAddress();

      const requiredEnforcers = {
        [enforcer1]: 1,
        [enforcer2]: 2,
        [enforcer3]: 3,
      };

      const decoder = makePermissionDecoder({
        permissionType,
        contractAddresses,
        optionalEnforcers: [],
        requiredEnforcers,
        rules: [],
        validateAndDecodeData: jest.fn(),
      });

      const specifiedCaveats = [
        enforcer1,
        enforcer2,
        enforcer2,
        enforcer3,
        enforcer3,
        enforcer3,
      ];

      expect(decoder.caveatAddressesMatch(specifiedCaveats)).toBe(true);
    });

    it('returns true when the specified addresses include optional enforcers', () => {
      const requiredEnforcer = randomAddress();
      const optionalEnforcer1 = randomAddress();
      const optionalEnforcer2 = randomAddress();

      const requiredEnforcers = {
        [getChecksumAddress(requiredEnforcer)]: 1,
      };

      const optionalEnforcers = [
        getChecksumAddress(optionalEnforcer1),
        getChecksumAddress(optionalEnforcer2),
      ];

      const decoder = makePermissionDecoder({
        permissionType,
        contractAddresses,
        optionalEnforcers,
        requiredEnforcers,
        rules: [],
        validateAndDecodeData: jest.fn(),
      });

      const specifiedCaveats = [
        requiredEnforcer,
        optionalEnforcer1,
        optionalEnforcer2,
      ];

      expect(decoder.caveatAddressesMatch(specifiedCaveats)).toBe(true);
    });

    it('returns true when the specified addresses include only a subset of declared optional enforcers', () => {
      const requiredEnforcer = randomAddress();
      const optionalEnforcer1 = randomAddress();
      const optionalEnforcer2 = randomAddress();
      const optionalEnforcer3 = randomAddress();

      const requiredEnforcers = {
        [getChecksumAddress(requiredEnforcer)]: 1,
      };

      const optionalEnforcers = [
        getChecksumAddress(optionalEnforcer1),
        getChecksumAddress(optionalEnforcer2),
        getChecksumAddress(optionalEnforcer3),
      ];

      const decoder = makePermissionDecoder({
        permissionType,
        contractAddresses,
        optionalEnforcers,
        requiredEnforcers,
        rules: [],
        validateAndDecodeData: jest.fn(),
      });

      const specifiedCaveats = [requiredEnforcer, optionalEnforcer2];

      expect(decoder.caveatAddressesMatch(specifiedCaveats)).toBe(true);
    });

    it('returns false when the specified addresses include addresses that are neither required or optional enforcers', () => {
      const requiredEnforcer = randomAddress();
      const optionalEnforcer = randomAddress();
      const unknownEnforcer = randomAddress();

      const requiredEnforcers = {
        [getChecksumAddress(requiredEnforcer)]: 1,
      };

      const optionalEnforcers = [getChecksumAddress(optionalEnforcer)];

      const decoder = makePermissionDecoder({
        permissionType,
        contractAddresses,
        optionalEnforcers,
        requiredEnforcers,
        rules: [],
        validateAndDecodeData: jest.fn(),
      });

      const specifiedCaveats = [
        requiredEnforcer,
        optionalEnforcer,
        unknownEnforcer,
      ];

      expect(decoder.caveatAddressesMatch(specifiedCaveats)).toBe(false);
    });

    it('returns false when the specified addresses do not include all required enforcers', () => {
      const requiredEnforcer1 = randomAddress();
      const requiredEnforcer2 = randomAddress();
      const optionalEnforcer = randomAddress();

      const requiredEnforcers = {
        [getChecksumAddress(requiredEnforcer1)]: 1,
        [getChecksumAddress(requiredEnforcer2)]: 1,
      };

      const optionalEnforcers = [getChecksumAddress(optionalEnforcer)];

      const decoder = makePermissionDecoder({
        permissionType,
        contractAddresses,
        optionalEnforcers,
        requiredEnforcers,
        rules: [],
        validateAndDecodeData: jest.fn(),
      });

      const specifiedCaveats = [requiredEnforcer1, optionalEnforcer];

      expect(decoder.caveatAddressesMatch(specifiedCaveats)).toBe(false);
    });

    it('returns false when the specified addresses include required addresses with the incorrect multiplicity (less than required)', () => {
      const enforcer1 = randomAddress();

      const requiredEnforcers = {
        [getChecksumAddress(enforcer1)]: 2,
      };

      const decoder = makePermissionDecoder({
        permissionType,
        contractAddresses,
        optionalEnforcers: [],
        requiredEnforcers,
        rules: [],
        validateAndDecodeData: jest.fn(),
      });

      const specifiedCaveats = [enforcer1];

      expect(decoder.caveatAddressesMatch(specifiedCaveats)).toBe(false);
    });

    it('returns false when the specified addresses include required addresses with the incorrect multiplicity (more than required)', () => {
      const enforcer1 = randomAddress();

      const requiredEnforcers = {
        [getChecksumAddress(enforcer1)]: 1,
      };

      const decoder = makePermissionDecoder({
        permissionType,
        contractAddresses,
        optionalEnforcers: [],
        requiredEnforcers,
        rules: [],
        validateAndDecodeData: jest.fn(),
      });

      const specifiedCaveats = [enforcer1, enforcer1];

      expect(decoder.caveatAddressesMatch(specifiedCaveats)).toBe(false);
    });

    // todo: we could consider tightening this up to require optional enforcers to be singular
    it('returns true when the specified addresses include duplicates of optional enforcers', () => {
      const requiredEnforcer = randomAddress();
      const optionalEnforcer = randomAddress();

      const requiredEnforcers = {
        [getChecksumAddress(requiredEnforcer)]: 1,
      };

      const optionalEnforcers = [getChecksumAddress(optionalEnforcer)];

      const decoder = makePermissionDecoder({
        permissionType,
        contractAddresses,
        optionalEnforcers,
        requiredEnforcers,
        rules: [],
        validateAndDecodeData: jest.fn(),
      });

      const specifiedCaveats = [
        requiredEnforcer,
        optionalEnforcer,
        optionalEnforcer,
      ];

      expect(decoder.caveatAddressesMatch(specifiedCaveats)).toBe(true);
    });

    it('matches when decoder config address casing mismatches specified caveat addresses', () => {
      const toUpperCaseHex = (address: Hex) => `0x${address.slice(2).toUpperCase()}` as const;
      const requiredEnforcer = randomAddress().toLowerCase() as Hex;
      const optionalEnforcer = randomAddress().toLowerCase() as Hex;

      const decoder = makePermissionDecoder({
        permissionType,
        contractAddresses,
        optionalEnforcers: [optionalEnforcer],
        requiredEnforcers: {
          [requiredEnforcer]: 1,
        },
        rules: [],
        validateAndDecodeData: jest.fn(),
      });

      expect(
        decoder.caveatAddressesMatch([
          toUpperCaseHex(requiredEnforcer),
          toUpperCaseHex(optionalEnforcer),
        ]),
      ).toBe(true);
    });
  });

  describe('validateAndDecodePermission', () => {
    it('returns a valid result when the specified validation and decoding succeeds', () => {
      const data = { result: 'success' };
      const validateAndDecodeData = jest.fn().mockReturnValue(data);
      const decoder = makePermissionDecoder({
        permissionType,
        contractAddresses,
        optionalEnforcers: [],
        requiredEnforcers: {},
        rules: [],
        validateAndDecodeData,
      });

      const result = decoder.validateAndDecodePermission([]);

      expect(validateAndDecodeData).toHaveBeenCalled();
      expect(result.isValid).toBe(true);
      expect((result as {data: Record<string, unknown>}).data).toStrictEqual(data);
    });

    it ('calls the validation and decoding function with the correct arguments', () => {
      const validateAndDecodeData = jest.fn();
      const decoder = makePermissionDecoder({
        permissionType,
        contractAddresses,
        optionalEnforcers: [],
        requiredEnforcers: {},
        rules: [],
        validateAndDecodeData,
      });

      const caveats: Caveat<Hex>[] = [
        {
          enforcer: randomAddress(),
          terms: '0x123456',
          args: '0x',
        },
        {
          enforcer: randomAddress(),
          terms: '0x987654',
          args: '0x',
        }
      ];

      const checksumCaveats = caveats.map((caveat) => ({
        ...caveat,
        enforcer: getChecksumAddress(caveat.enforcer),
      }));

      decoder.validateAndDecodePermission(caveats);

      expect(validateAndDecodeData).toHaveBeenCalledWith(checksumCaveats, contractAddresses);
    });

    it('returns an invalid result, with thrown error when the specified validation and decoding throws', () => {
      const validationError = new Error('test error');
      const validateAndDecodeData = jest.fn().mockImplementation(() => { throw validationError; });
      const decoder = makePermissionDecoder({
        permissionType,
        contractAddresses,
        optionalEnforcers: [],
        requiredEnforcers: {},
        rules: [],
        validateAndDecodeData,
      });

      const result = decoder.validateAndDecodePermission([]);

      expect(validateAndDecodeData).toHaveBeenCalled();
      expect(result.isValid).toBe(false);
      expect((result as {error: Error}).error).toBe(validationError);
    });

    it('returns an invalid result, with appropriate error if any of the terms is not valid hex', () => {
      const data = { result: 'success' };
      const validateAndDecodeData = jest.fn().mockReturnValue(data);
      const decoder = makePermissionDecoder({
        permissionType,
        contractAddresses,
        optionalEnforcers: [],
        requiredEnforcers: {},
        rules: [],
        validateAndDecodeData,
      });

      const result = decoder.validateAndDecodePermission([{
        enforcer: randomAddress(),
        terms: '0xNOTHEX',
        args: '0x',
      }]);

      expect(validateAndDecodeData).not.toHaveBeenCalled();
      expect(result.isValid).toBe(false);
      expect((result as {error: Error}).error.message).toBe('Invalid terms: must be a hex string');
    });

    it('calls decode on each of the specified rules', () => {
      const rules: RuleDecoder[] = [
        jest.fn().mockReturnValue(null),
        jest.fn().mockReturnValue(null),
        jest.fn().mockReturnValue(null),
      ];
      
      const decoder = makePermissionDecoder({
        permissionType,
        contractAddresses,
        optionalEnforcers: [],
        requiredEnforcers: {},
        rules,
        validateAndDecodeData: jest.fn(),
      });

      const caveats: Caveat<Hex>[] = [
        {
          enforcer: randomAddress(),
          terms: '0x123456',
          args: '0x',
        },
        {
          enforcer: randomAddress(),
          terms: '0x987654',
          args: '0x',
        }
      ];

      const checksumCaveats = caveats.map((caveat) => ({
        ...caveat,
        enforcer: getChecksumAddress(caveat.enforcer),
      }));

      decoder.validateAndDecodePermission(caveats);

      const ruleDecoderExpectedArgs = {
        contractAddresses,
        caveats: checksumCaveats,
        requiredEnforcers: new Map()
      };

      expect(rules[0]).toHaveBeenCalledWith(ruleDecoderExpectedArgs);
      expect(rules[1]).toHaveBeenCalledWith(ruleDecoderExpectedArgs);
      expect(rules[2]).toHaveBeenCalledWith(ruleDecoderExpectedArgs);
    });

    it('returns an invalid result, with thrown error when a rule decoder throws', () => {
      const ruleDecoderError = new Error('test error');
      const ruleDecoder = jest.fn().mockImplementation(() => { throw ruleDecoderError; });
      const decoder = makePermissionDecoder({
        permissionType,
        contractAddresses,
        optionalEnforcers: [],
        requiredEnforcers: {},
        rules: [ruleDecoder],
        validateAndDecodeData: jest.fn(),
      });

      const result = decoder.validateAndDecodePermission([]);

      expect(ruleDecoder).toHaveBeenCalled();
      expect(result.isValid).toBe(false);
      expect((result as {error: Error}).error).toBe(ruleDecoderError);
    });

    it('returns an undefined rules when no rules are decoded', () => {
      const decoder = makePermissionDecoder({
        permissionType,
        contractAddresses,
        optionalEnforcers: [],
        requiredEnforcers: {},
        rules: [],
        validateAndDecodeData: jest.fn(),
      });

      const result = decoder.validateAndDecodePermission([]);

      expect(result.isValid).toBe(true);
      expect((result as { rules: Rule[] }).rules ).toBeUndefined();
    });

    it('returns a null expiry when no expiry rule is decoded', () => {
      const decoder = makePermissionDecoder({
        permissionType,
        contractAddresses,
        optionalEnforcers: [],
        requiredEnforcers: {},
        rules: [],
        validateAndDecodeData: jest.fn(),
      });

      const result = decoder.validateAndDecodePermission([]);

      expect(result.isValid).toBe(true);
      expect((result as { expiry: number | null }).expiry ).toBeNull();
    });

    it('applies decoded rules to the result', () => {
      const mockRule1 = {
        type: 'mock-rule',
        data: {}
      };
      const mockRule2 = {
        type: 'mock-rule-2',
        data: {
          value: 1
        }
      };
      
      const rules: RuleDecoder[] = [
        jest.fn().mockReturnValue(mockRule1),
        jest.fn().mockReturnValue(null),
        jest.fn().mockReturnValue(mockRule2),
      ];
      
      const decoder = makePermissionDecoder({
        permissionType,
        contractAddresses,
        optionalEnforcers: [],
        requiredEnforcers: {},
        rules,
        validateAndDecodeData: jest.fn(),
      });

      const result = decoder.validateAndDecodePermission([]);

      expect(result.isValid).toBe(true);
      expect((result as { rules: Rule[] }).rules ).toStrictEqual([mockRule1, mockRule2]);
    });

    it('hoists expiry rule to the top-level expiry field, as well as including it in the rules array', () => {
      const timestamp = 1720000;
      const expiryRule = {
        type: 'expiry',
        data: {
          timestamp,
        },
      };

      const rules: RuleDecoder[] = [
        jest.fn().mockReturnValue(expiryRule),
      ];

      const decoder = makePermissionDecoder({
        permissionType,
        contractAddresses,
        optionalEnforcers: [],
        requiredEnforcers: {},
        rules,
        validateAndDecodeData: jest.fn(),
      });

      const result = decoder.validateAndDecodePermission([]);

      expect(result.isValid).toBe(true);
      expect((result as { expiry: number }).expiry ).toStrictEqual(timestamp);
      expect((result as { rules: Rule[] }).rules ).toStrictEqual([expiryRule]);
    });
  });
});
