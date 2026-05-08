import type { DelegationResponse } from '@metamask/authenticated-user-storage';
import { SignTypedDataVersion } from '@metamask/keyring-controller';
import {
  createDelegation,
  getSmartAccountsEnvironment,
} from '@metamask/smart-accounts-kit';
import {
  SIGNABLE_DELEGATION_TYPED_DATA,
  toDelegationStruct,
} from '@metamask/smart-accounts-kit/utils';
import { hexToNumber, bytesToHex } from '@metamask/utils';
import type { Hex } from '@metamask/utils';
import { webcrypto } from 'node:crypto';

import type { Step } from './step';

const MAX_UINT256 = 2n ** 256n - 1n;

const equalsIgnoreCase = (a: Hex, b: Hex): boolean =>
  a.toLowerCase() === b.toLowerCase();

export const buildDelegationStep: Step = {
  name: 'build-delegation',
  async run({
    messenger,
    address,
    chainId,
    delegateAddress,
    erc20TransferAmountEnforcer,
    musdTokenAddress,
    redeemerEnforcer,
    valueLteEnforcer,
    vedaVaultAdapterAddress,
  }) {
    const existingDelegations = await messenger.call(
      'AuthenticatedUserStorageService:listDelegations',
    );
    const matchesConfig = (entry: DelegationResponse): boolean =>
      equalsIgnoreCase(entry.signedDelegation.delegator, address) &&
      equalsIgnoreCase(entry.signedDelegation.delegate, delegateAddress) &&
      equalsIgnoreCase(entry.metadata.chainIdHex, chainId) &&
      equalsIgnoreCase(entry.metadata.tokenAddress, musdTokenAddress);
    if (existingDelegations.some(matchesConfig)) {
      return 'already-done';
    }

    const saltBytes = webcrypto.getRandomValues(new Uint8Array(32));
    const salt = bytesToHex(saltBytes);
    const chainIdDecimal = hexToNumber(chainId);
    const baseEnvironment = getSmartAccountsEnvironment(chainIdDecimal);
    // Pin enforcer addresses to the values supplied at init() rather than
    // letting the SDK resolve them from its own deployment registry.
    const environment = {
      ...baseEnvironment,
      caveatEnforcers: {
        ...baseEnvironment.caveatEnforcers,
        ERC20TransferAmountEnforcer: erc20TransferAmountEnforcer,
        RedeemerEnforcer: redeemerEnforcer,
        ValueLteEnforcer: valueLteEnforcer,
      },
    };

    const delegation = createDelegation({
      environment,
      scope: {
        type: 'erc20TransferAmount',
        tokenAddress: musdTokenAddress,
        maxAmount: MAX_UINT256,
      },
      from: address,
      to: delegateAddress,
      caveats: [
        { type: 'redeemer', redeemers: [vedaVaultAdapterAddress] },
        { type: 'valueLte', maxValue: 0n },
      ],
      salt,
    });

    const typedData = {
      domain: {
        name: 'DelegationManager',
        version: '1',
        chainId: chainIdDecimal,
        verifyingContract: environment.DelegationManager,
      },
      types: SIGNABLE_DELEGATION_TYPED_DATA,
      primaryType: 'Delegation' as const,
      message: toDelegationStruct({ ...delegation, signature: '0x' }),
    };

    const signature = (await messenger.call(
      'KeyringController:signTypedMessage',
      { from: address, data: typedData },
      SignTypedDataVersion.V4,
    )) as Hex;

    const result = await messenger.call('ChompApiService:verifyDelegation', {
      signedDelegation: { ...delegation, signature },
      chainId,
    });

    if (!result.valid) {
      throw new Error(
        `CHOMP rejected delegation: ${result.errors?.join(', ') ?? 'unknown error'}`,
      );
    }

    return 'completed';
  },
};
