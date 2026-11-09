import { encode } from '@metamask/abi-utils';
import type { DelegationResponse } from '@metamask/authenticated-user-storage';
import type {
  ChompMigrationIntentType,
  MigrationStep,
  SendIntentV2Params,
} from '@metamask/chomp-api-service';
import {
  ROOT_AUTHORITY,
  createAllowedCalldataTerms,
  createAllowedTargetsTerms,
  createRedeemerTerms,
  createValueLteTerms,
  hashDelegation,
} from '@metamask/delegation-core';
import { add0x, bytesToHex, hexToBigInt, remove0x } from '@metamask/utils';
import type { Hex } from '@metamask/utils';
import { keccak_256 as keccak256 } from '@noble/hashes/sha3';

import type { MoneyAccountUpgradeControllerMessenger } from '../MoneyAccountUpgradeController.js';
import { equalsIgnoreCase } from './delegation-matchers.js';
import type { Step, StepContext } from './step.js';

const MAX_UINT256_HEX: Hex = add0x((2n ** 256n - 1n).toString(16));

/**
 * The delegate of an open delegation, which any redeemer may redeem.
 */
const ANY_BENEFICIARY: Hex = '0x0000000000000000000000000000000000000a11';

const ERC20_TRANSFER_SELECTOR = 'a9059cbb';

type Caveat = DelegationResponse['signedDelegation']['caveats'][number];

/**
 * A delegation the predecessor signs to complete one migration step.
 */
type MigrationDelegation = {
  step: MigrationStep;
  delegate: Hex;
  caveats: Caveat[];
  tokenAddress: Hex;
  tokenSymbol: string;
} & (
  | {
      type: Exclude<
        ChompMigrationIntentType,
        'cash-migration-premium-transfer'
      >;
    }
  | {
      type: 'cash-migration-premium-transfer';
      vaultMigrationHelperAddress: Hex;
    }
);

/**
 * Builds the terms of an AllowedCalldataEnforcer caveat that only allows
 * `transfer(recipient, amount)`, for any amount.
 *
 * @param recipient - The only allowed recipient.
 * @returns The caveat terms.
 */
const transferCalldataTerms = (recipient: Hex): Hex =>
  createAllowedCalldataTerms({
    startIndex: 0,
    value: add0x(
      `${ERC20_TRANSFER_SELECTOR}${remove0x(recipient).padStart(64, '0')}`,
    ),
  });

/**
 * Lists the delegations the predecessor signs during a migration, keyed by
 * the step each completes, in the caveat shapes CHOMP validates.
 *
 * @param context - The step context.
 * @param successor - The address the Money Account migrates to.
 * @param vaultMigrationHelperAddress - The VaultMigrationHelper contract
 * from the CHOMP service details, when served.
 * @returns The delegations, with the premium transfer only when the premium
 * vault and the vault migration helper are configured.
 */
function getMigrationDelegations(
  context: StepContext,
  successor: Hex,
  vaultMigrationHelperAddress: Hex | undefined,
): MigrationDelegation[] {
  const {
    allowedCalldataEnforcer,
    allowedTargetsEnforcer,
    boringVaultAddress,
    delegateAddress,
    musdTokenAddress,
    premiumVault,
    redeemerEnforcer,
    valueLteEnforcer,
  } = context;

  const transfer = (
    step: MigrationStep,
    tokenAddress: Hex,
    tokenSymbol: string,
  ): MigrationDelegation => ({
    step,
    type: 'cash-migration-transfer',
    delegate: ANY_BENEFICIARY,
    caveats: [
      {
        enforcer: allowedTargetsEnforcer,
        terms: createAllowedTargetsTerms({ targets: [tokenAddress] }),
        args: '0x',
      },
      {
        enforcer: allowedCalldataEnforcer,
        terms: transferCalldataTerms(successor),
        args: '0x',
      },
      {
        enforcer: valueLteEnforcer,
        terms: createValueLteTerms({ maxValue: 0n }),
        args: '0x',
      },
    ],
    tokenAddress,
    tokenSymbol,
  });

  return [
    {
      step: 'ROOT_DELEGATION',
      type: 'cash-migration-root',
      delegate: successor,
      caveats: [
        {
          enforcer: redeemerEnforcer,
          terms: createRedeemerTerms({ redeemers: [successor] }),
          args: '0x',
        },
      ],
      tokenAddress: musdTokenAddress,
      tokenSymbol: 'mUSD',
    },
    transfer('TRANSFER_INTENT_MUSD', musdTokenAddress, 'mUSD'),
    transfer('TRANSFER_INTENT_VMUSD', boringVaultAddress, 'vmUSD'),
    ...(premiumVault && vaultMigrationHelperAddress
      ? [
          {
            step: 'TRANSFER_INTENT_PVMUSD' as const,
            type: 'cash-migration-premium-transfer' as const,
            delegate: delegateAddress,
            caveats: [
              {
                enforcer: redeemerEnforcer,
                terms: createRedeemerTerms({
                  redeemers: [vaultMigrationHelperAddress],
                }),
                args: '0x' as Hex,
              },
              {
                enforcer: allowedCalldataEnforcer,
                terms: transferCalldataTerms(vaultMigrationHelperAddress),
                args: '0x' as Hex,
              },
              {
                enforcer: allowedTargetsEnforcer,
                terms: createAllowedTargetsTerms({
                  targets: [premiumVault.boringVaultAddress],
                }),
                args: '0x' as Hex,
              },
            ],
            tokenAddress: premiumVault.boringVaultAddress,
            tokenSymbol: 'pvmUSD',
            vaultMigrationHelperAddress,
          },
        ]
      : []),
  ];
}

/**
 * Reads the VaultMigrationHelper contract from the CHOMP service details
 * when it is needed, rather than from the config armed at bootstrap, so a
 * helper CHOMP starts serving or moves later is used.
 *
 * @param context - The step context.
 * @param context.messenger - The controller messenger.
 * @param context.chainId - The chain of the migration.
 * @returns The helper address, or `undefined` when CHOMP does not serve one.
 */
async function getVaultMigrationHelperAddress({
  messenger,
  chainId,
}: StepContext): Promise<Hex | undefined> {
  const { chains } = await messenger.call('ChompApiService:getServiceDetails', [
    chainId,
  ]);
  return chains[chainId]?.vaultMigrationHelperAddress;
}

/**
 * Builds a predicate that matches a stored delegation from the predecessor
 * that has exactly the delegate, caveats, token and type of `delegation`, in
 * any caveat order.
 *
 * @param address - The predecessor.
 * @param chainId - The chain of the delegation.
 * @param delegation - The migration delegation to match.
 * @returns A predicate over `DelegationResponse`.
 */
const makeMatchesMigrationDelegation =
  (
    address: Hex,
    chainId: Hex,
    delegation: MigrationDelegation,
  ): ((entry: DelegationResponse) => boolean) =>
  ({ signedDelegation, metadata }) =>
    equalsIgnoreCase(signedDelegation.delegator, address) &&
    equalsIgnoreCase(signedDelegation.delegate, delegation.delegate) &&
    equalsIgnoreCase(metadata.chainIdHex, chainId) &&
    equalsIgnoreCase(metadata.tokenAddress, delegation.tokenAddress) &&
    metadata.type === delegation.type &&
    signedDelegation.caveats.length === delegation.caveats.length &&
    delegation.caveats.every((expected) =>
      signedDelegation.caveats.some(
        (caveat) =>
          equalsIgnoreCase(caveat.enforcer, expected.enforcer) &&
          equalsIgnoreCase(caveat.terms, expected.terms),
      ),
    );

/**
 * Signs `delegation` as the predecessor and saves it to the authenticated
 * user storage, where CHOMP reads it from when the intent is registered.
 *
 * The delegation is not verified with CHOMP first: its verify endpoint does
 * not know the successor, so it rejects every migration delegation.
 * Registering the intent validates it instead.
 *
 * @param messenger - The messenger.
 * @param address - The predecessor.
 * @param chainId - The chain to scope the delegation to.
 * @param delegation - The migration delegation to sign.
 * @returns The hash of the stored delegation.
 */
async function signAndStoreDelegation(
  messenger: MoneyAccountUpgradeControllerMessenger,
  address: Hex,
  chainId: Hex,
  delegation: MigrationDelegation,
): Promise<Hex> {
  const unsignedDelegation = {
    delegate: delegation.delegate,
    delegator: address,
    authority: ROOT_AUTHORITY,
    caveats: delegation.caveats,
    salt: bytesToHex(globalThis.crypto.getRandomValues(new Uint8Array(32))),
  };

  const signature = (await messenger.call(
    'DelegationController:signDelegation',
    { delegation: unsignedDelegation, chainId },
  )) as Hex;

  const delegationHash = hashDelegation({
    ...unsignedDelegation,
    salt: hexToBigInt(unsignedDelegation.salt),
    signature,
  });

  await messenger.call('AuthenticatedUserStorageService:createDelegation', {
    signedDelegation: { ...unsignedDelegation, signature },
    metadata: {
      delegationHash,
      chainIdHex: chainId,
      allowance: MAX_UINT256_HEX,
      tokenSymbol: delegation.tokenSymbol,
      tokenAddress: delegation.tokenAddress,
      type: delegation.type,
    },
  });

  return delegationHash;
}

/**
 * Has the predecessor sign the digest the vault migration helper checks
 * before it moves pvmUSD, which binds the successor as the destination of
 * the premium transfer delegation.
 *
 * @param params - The parameters.
 * @param params.messenger - The messenger.
 * @param params.address - The predecessor.
 * @param params.chainId - The chain of the delegation.
 * @param params.successor - The address the Money Account migrates to.
 * @param params.vaultMigrationHelperAddress - The vault migration helper.
 * @param params.delegationHash - The hash of the premium transfer delegation.
 * @returns The `personal_sign` signature of the digest.
 */
async function signPremiumTransferDestination({
  messenger,
  address,
  chainId,
  successor,
  vaultMigrationHelperAddress,
  delegationHash,
}: {
  messenger: MoneyAccountUpgradeControllerMessenger;
  address: Hex;
  chainId: Hex;
  successor: Hex;
  vaultMigrationHelperAddress: Hex;
  delegationHash: Hex;
}): Promise<Hex> {
  const digest = keccak256(
    encode(
      ['address', 'uint256', 'address', 'address', 'bytes32'],
      [
        vaultMigrationHelperAddress,
        hexToBigInt(chainId),
        address,
        successor,
        delegationHash,
      ],
    ),
  );
  return (await messenger.call('KeyringController:signPersonalMessage', {
    data: bytesToHex(digest),
    from: address,
  })) as Hex;
}

/**
 * Registers the CHOMP intents that the predecessor of a Money Account
 * migration signs: the root delegation to the successor, the open mUSD and
 * vmUSD transfers to the successor and, for a premium migration, the pvmUSD
 * transfer through the vault migration helper.
 *
 * `address` is the predecessor. The missing steps are read from CHOMP, so
 * only the delegations for incomplete steps are handled, and the step can be
 * re-run to resume a migration. Nothing is signed unless CHOMP reports the
 * expected `successorAddress` as the successor. Delegations already in the
 * authenticated user storage are registered again rather than signed anew.
 * Every intent is registered in a single `POST /v2/intent`, after all the
 * delegations are stored.
 *
 * The steps signed by the successor, and `FUNDS_TRANSFERRED`, are left to
 * other flows. Reports `'already-done'` when no predecessor step is missing.
 *
 * @throws If `address` is not the predecessor of a migration to
 * `successorAddress`, or if a premium migration is missing the premium vault
 * or the vault migration helper.
 */
export const registerMigrationIntentsStep: Step = {
  name: 'register-migration-intents',
  async run(context) {
    const { messenger, address, successorAddress, chainId } = context;
    if (!successorAddress) {
      throw new Error(
        'Registering the migration intents requires the expected successor',
      );
    }

    const response = await messenger.call(
      'ChompApiService:getDerivedIdentityByAddress',
      address,
    );
    const migration = response?.identity.migration;
    if (!migration || !equalsIgnoreCase(migration.from, address)) {
      throw new Error(
        `${address} is not the predecessor of a Money Account migration`,
      );
    }
    if (!equalsIgnoreCase(migration.to, successorAddress)) {
      throw new Error(
        `${address} is migrating to ${migration.to}, not to ${successorAddress}`,
      );
    }

    const missingSteps = new Set(
      migration.steps
        .filter(({ completed }) => !completed)
        .map(({ step }) => step),
    );
    const vaultMigrationHelperAddress = missingSteps.has(
      'TRANSFER_INTENT_PVMUSD',
    )
      ? await getVaultMigrationHelperAddress(context)
      : undefined;
    const delegations = getMigrationDelegations(
      context,
      migration.to,
      vaultMigrationHelperAddress,
    ).filter(({ step }) => missingSteps.has(step));

    if (
      missingSteps.has('TRANSFER_INTENT_PVMUSD') &&
      !delegations.some(({ step }) => step === 'TRANSFER_INTENT_PVMUSD')
    ) {
      throw new Error(
        'A premium Money Account migration requires the premium vault and the vault migration helper',
      );
    }

    if (delegations.length === 0) {
      return 'already-done';
    }

    const storedDelegations = await messenger.call(
      'AuthenticatedUserStorageService:listDelegations',
    );

    const intents: SendIntentV2Params[] = [];
    for (const delegation of delegations) {
      const stored = storedDelegations.find(
        makeMatchesMigrationDelegation(address, chainId, delegation),
      );
      const delegationHash =
        stored?.metadata.delegationHash ??
        (await signAndStoreDelegation(messenger, address, chainId, delegation));

      const data = {
        allowance: MAX_UINT256_HEX,
        tokenSymbol: delegation.tokenSymbol,
        tokenAddress: delegation.tokenAddress,
      };
      intents.push({
        account: address,
        delegationHash,
        chainId,
        intent:
          delegation.type === 'cash-migration-premium-transfer'
            ? {
                type: delegation.type,
                data: {
                  ...data,
                  userSignature: await signPremiumTransferDestination({
                    messenger,
                    address,
                    chainId,
                    successor: migration.to,
                    vaultMigrationHelperAddress:
                      delegation.vaultMigrationHelperAddress,
                    delegationHash,
                  }),
                },
              }
            : { type: delegation.type, data },
      });
    }

    await messenger.call('ChompApiService:createIntentsV2', intents);
    return 'completed';
  },
};
