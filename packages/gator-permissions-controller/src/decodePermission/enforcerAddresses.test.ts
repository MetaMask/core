import { makePermissionDecoderConfigs } from '@metamask/7715-permission-types';
import type { EnforcerAddressesByName } from '@metamask/7715-permission-types';
import { getChecksumAddress, isStrictHexString } from '@metamask/utils';

import { buildMockDelegationEnforcerContracts } from '../../tests/mocks';
import type { DelegationDeploymentsEnforcerAddressesByName } from '../types';
import {
  toEnforcerAddressesByName,
  delegationContractsByChainId,
} from './enforcerAddresses';

const ENFORCER_ADDRESS_KEYS = [
  'allowedCalldataEnforcer',
  'allowedTargetsEnforcer',
  'redeemerEnforcer',
  'erc20StreamingEnforcer',
  'erc20PeriodTransferEnforcer',
  'nativeTokenStreamingEnforcer',
  'nativeTokenPeriodTransferEnforcer',
  'approvalRevocationEnforcer',
  'exactCalldataEnforcer',
  'valueLteEnforcer',
  'timestampEnforcer',
  'nonceEnforcer',
] as const satisfies readonly (keyof EnforcerAddressesByName)[];

const DEPLOYMENT_TO_ENFORCER_KEY = {
  AllowedCalldataEnforcer: 'allowedCalldataEnforcer',
  AllowedTargetsEnforcer: 'allowedTargetsEnforcer',
  RedeemerEnforcer: 'redeemerEnforcer',
  ERC20StreamingEnforcer: 'erc20StreamingEnforcer',
  ERC20PeriodTransferEnforcer: 'erc20PeriodTransferEnforcer',
  NativeTokenStreamingEnforcer: 'nativeTokenStreamingEnforcer',
  NativeTokenPeriodTransferEnforcer: 'nativeTokenPeriodTransferEnforcer',
  ApprovalRevocationEnforcer: 'approvalRevocationEnforcer',
  ExactCalldataEnforcer: 'exactCalldataEnforcer',
  ValueLteEnforcer: 'valueLteEnforcer',
  TimestampEnforcer: 'timestampEnforcer',
  NonceEnforcer: 'nonceEnforcer',
} as const satisfies Record<
  keyof DelegationDeploymentsEnforcerAddressesByName,
  keyof EnforcerAddressesByName
>;

const DEPLOYMENT_CONTRACT_NAMES = Object.keys(
  DEPLOYMENT_TO_ENFORCER_KEY,
) as (keyof DelegationDeploymentsEnforcerAddressesByName)[];

const expectValidEnforcerAddresses = (
  contracts: DelegationDeploymentsEnforcerAddressesByName,
  result: EnforcerAddressesByName,
): void => {
  expect(Object.keys(result).sort()).toStrictEqual(
    [...ENFORCER_ADDRESS_KEYS].sort(),
  );

  for (const deploymentName of DEPLOYMENT_CONTRACT_NAMES) {
    const enforcerKey = DEPLOYMENT_TO_ENFORCER_KEY[deploymentName];
    const sourceAddress = contracts[deploymentName];
    const resolvedAddress = result[enforcerKey];

    expect(resolvedAddress).toBe(getChecksumAddress(sourceAddress));
    expect(isStrictHexString(resolvedAddress)).toBe(true);
    expect(resolvedAddress).toBe(getChecksumAddress(resolvedAddress));
  }
};

describe('toEnforcerAddressesByName', () => {
  describe('unit tests', () => {
    it('maps deployment contract names to EnforcerAddressesByName keys with checksummed values', () => {
      const contracts = buildMockDelegationEnforcerContracts();
      const result = toEnforcerAddressesByName(contracts);

      expect(result).toBeDefined();
      expectValidEnforcerAddresses(contracts, result);
    });

    it('checksums mixed-case deployment addresses', () => {
      const contracts = buildMockDelegationEnforcerContracts();
      const mixedCaseContracts: DelegationDeploymentsEnforcerAddressesByName = {
        ...contracts,
        TimestampEnforcer: '0xAbCdEf0123456789AbCdEf0123456789AbCdEf01',
        ERC20StreamingEnforcer: '0x0123456789abcdef0123456789abcdef01234567',
      };

      const result = toEnforcerAddressesByName(mixedCaseContracts);

      expect(result.timestampEnforcer).toBe(
        getChecksumAddress(mixedCaseContracts.TimestampEnforcer),
      );
      expect(result.erc20StreamingEnforcer).toBe(
        getChecksumAddress(mixedCaseContracts.ERC20StreamingEnforcer),
      );
      expect(result.timestampEnforcer).not.toBe(
        mixedCaseContracts.TimestampEnforcer,
      );
    });

    it.each(DEPLOYMENT_CONTRACT_NAMES)(
      'throws when %s is missing',
      (missingContractName) => {
        const contracts = buildMockDelegationEnforcerContracts();
        const { [missingContractName]: _removed, ...incompleteContracts } =
          contracts;

        expect(() =>
          toEnforcerAddressesByName(
            incompleteContracts as DelegationDeploymentsEnforcerAddressesByName,
          ),
        ).toThrow(`Contract not found: ${missingContractName}`);
      },
    );
  });

  describe('integration with @metamask/delegation-deployments', () => {
    it('resolves every deployed chain to a valid EnforcerAddressesByName', () => {
      for (const [chainId, contracts] of Object.entries(
        delegationContractsByChainId,
      )) {
        const result = toEnforcerAddressesByName(contracts);

        expectValidEnforcerAddresses(contracts, result);
        expect(Number(chainId)).toBeGreaterThan(0);
      }
    });

    it('produces addresses accepted by makePermissionDecoderConfigs for every deployed chain', () => {
      for (const contracts of Object.values(delegationContractsByChainId)) {
        const enforcerAddresses = toEnforcerAddressesByName(contracts);
        const decoderConfigs = makePermissionDecoderConfigs(enforcerAddresses);

        expect(decoderConfigs.length).toBeGreaterThan(0);
        for (const config of decoderConfigs) {
          expect(config.contractAddresses).toStrictEqual(enforcerAddresses);
        }
      }
    });

    it('resolves sepolia deployment addresses to the expected canonical enforcers', () => {
      const sepoliaChainId = 11155111;
      const contracts = delegationContractsByChainId[sepoliaChainId];
      const result = toEnforcerAddressesByName(contracts);

      expect(result.timestampEnforcer).toBe(
        getChecksumAddress(contracts.TimestampEnforcer),
      );
      expect(result.nativeTokenStreamingEnforcer).toBe(
        getChecksumAddress(contracts.NativeTokenStreamingEnforcer),
      );
      expect(result.redeemerEnforcer).toBe(
        getChecksumAddress(contracts.RedeemerEnforcer),
      );
    });
  });
});
