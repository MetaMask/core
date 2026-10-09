import { DelegationController } from '@metamask/delegation-controller';
import type { DelegationControllerMessenger } from '@metamask/delegation-controller';
import {
  ANY_BENEFICIARY,
  ROOT_AUTHORITY,
  createERC20TransferAmountTerms,
  createExactExecutionBatchTerms,
  createExactExecutionTerms,
  createLimitedCallsTerms,
  createRedeemerTerms,
  createValueLteTerms,
} from '@metamask/delegation-core';
import { DELEGATOR_CONTRACTS } from '@metamask/delegation-deployments';
import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MessengerActions,
  MessengerEvents,
  MockAnyNamespace,
} from '@metamask/messenger';
import { TELLER_ABI } from '@metamask/money-account-utils';
import { generateEIP7702BatchTransaction } from '@metamask/transaction-controller';
import { bytesToHex, stringToBytes } from '@metamask/utils';
import type { Hex } from '@metamask/utils';
import {
  Interface,
  TypedDataEncoder,
  getBytes,
  hashAuthorization,
  hashMessage,
} from 'ethers';
import type { TypedDataField } from 'ethers';

import type {
  DelegationFrameworkContracts,
  MfaWhitelistConfig,
  MoneyAccountSignatureRequest,
} from '../src/types.js';

export const CHAIN_ID: Hex = '0x8f';

const MONAD_CONTRACTS = DELEGATOR_CONTRACTS['1.3.0'][143] as Record<
  keyof DelegationFrameworkContracts,
  Hex
>;

export const CONTRACTS: DelegationFrameworkContracts = {
  DelegationManager: MONAD_CONTRACTS.DelegationManager,
  EIP7702StatelessDeleGatorImpl: MONAD_CONTRACTS.EIP7702StatelessDeleGatorImpl,
  ERC20TransferAmountEnforcer: MONAD_CONTRACTS.ERC20TransferAmountEnforcer,
  ExactExecutionBatchEnforcer: MONAD_CONTRACTS.ExactExecutionBatchEnforcer,
  ExactExecutionEnforcer: MONAD_CONTRACTS.ExactExecutionEnforcer,
  LimitedCallsEnforcer: MONAD_CONTRACTS.LimitedCallsEnforcer,
  RedeemerEnforcer: MONAD_CONTRACTS.RedeemerEnforcer,
  ValueLteEnforcer: MONAD_CONTRACTS.ValueLteEnforcer,
};

export const MONEY_ACCOUNT: Hex = '0x1111111111111111111111111111111111111111';
export const RECIPIENT: Hex = '0x2222222222222222222222222222222222222222';
export const MUSD: Hex = '0xacA92E438df0B2401fF60dA7E4337B687a2435DA';
export const CHOMP_DELEGATE: Hex = '0x3333333333333333333333333333333333333333';

export const VAULT = {
  boringVault: '0x4444444444444444444444444444444444444444',
  tellerAddress: '0x5555555555555555555555555555555555555555',
  vedaVaultAdapterAddress: '0x6666666666666666666666666666666666666666',
} as const;

export const PREMIUM_VAULT = {
  boringVault: '0x7777777777777777777777777777777777777777',
  tellerAddress: '0x8888888888888888888888888888888888888888',
  vedaVaultAdapterAddress: '0x9999999999999999999999999999999999999999',
} as const;

export const CARD_SIGN_IN_DOMAIN = 'link.metamask.io';

export const NOW = Date.parse('2026-10-09T12:00:00.000Z');

export const CONFIG: MfaWhitelistConfig = {
  chainId: CHAIN_ID,
  contracts: CONTRACTS,
  musdTokenAddress: MUSD,
  chompDelegateAddress: CHOMP_DELEGATE,
  vaults: [VAULT, PREMIUM_VAULT],
  cardSignInDomain: CARD_SIGN_IN_DOMAIN,
};

export const MAX_UINT256 = 2n ** 256n - 1n;

export type Execution = { target: Hex; value: bigint; callData: Hex };

export type UnsignedDelegation = {
  delegate: Hex;
  delegator: Hex;
  authority: Hex;
  caveats: { enforcer: Hex; terms: Hex; args: Hex }[];
  salt: Hex;
};

/**
 * Encodes a string as hex-encoded UTF-8, as passed to `signPersonalMessage`.
 *
 * @param message - The message.
 * @returns The hex-encoded message.
 */
export function toHexMessage(message: string): Hex {
  return bytesToHex(stringToBytes(message));
}

/** A hash no test request hashes to. */
export const UNRELATED_HASH: Hex = `0x${'ab'.repeat(32)}`;

/**
 * Computes the hash a keyring signs for a request, using ethers as a
 * reference implementation independent of the package.
 *
 * @param request - The signature request.
 * @returns The hash, or {@link UNRELATED_HASH} if ethers can't hash the
 * request.
 */
export function hashRequest(request: MoneyAccountSignatureRequest): Hex {
  try {
    switch (request.method) {
      case 'signPersonalMessage':
        return hashMessage(getBytes(request.message)) as Hex;
      case 'signTypedData': {
        const { types, domain, message } = (
          typeof request.data === 'string'
            ? JSON.parse(request.data)
            : request.data
        ) as {
          types: Record<string, TypedDataField[]>;
          domain: Record<string, unknown>;
          message: Record<string, unknown>;
        };
        const { EIP712Domain: _, ...structTypes } = types;
        return TypedDataEncoder.hash(domain, structTypes, message) as Hex;
      }
      default: {
        const [chainId, address, nonce] = request.authorization;
        return hashAuthorization({ chainId, address, nonce }) as Hex;
      }
    }
  } catch {
    return UNRELATED_HASH;
  }
}

const ZERO: Hex = '0x0000000000000000000000000000000000000000';

const ERC20 = new Interface([
  'function approve(address spender, uint256 amount)',
  'function transfer(address to, uint256 amount)',
]);
const TELLER = new Interface(TELLER_ABI);

/**
 * Builds the vault deposit calls with the same ABI as
 * `buildMoneyAccountDepositBatch` in `@metamask/money-account-utils`.
 *
 * @param options - Options.
 * @param options.amount - The deposit amount.
 * @param options.vault - The vault.
 * @returns The approve and deposit calls.
 */
export function buildDepositCalls({
  amount = 1_000_000n,
  vault = VAULT,
}: {
  amount?: bigint;
  vault?: { boringVault: Hex; tellerAddress: Hex };
} = {}): Execution[] {
  return [
    {
      target: MUSD,
      value: 0n,
      callData: ERC20.encodeFunctionData('approve', [
        vault.boringVault,
        amount,
      ]) as Hex,
    },
    {
      target: vault.tellerAddress,
      value: 0n,
      callData: TELLER.encodeFunctionData('deposit', [
        MUSD,
        amount,
        (amount * 998n) / 1000n,
        ZERO,
      ]) as Hex,
    },
  ];
}

/**
 * Builds the vault withdraw calls with the same ABI as
 * `buildMoneyAccountWithdrawBatch` in `@metamask/money-account-utils`.
 *
 * @param amount - The withdrawal amount.
 * @returns The withdraw and transfer calls.
 */
export function buildWithdrawCalls(amount = 1_000_000n): Execution[] {
  return [
    {
      target: VAULT.tellerAddress,
      value: 0n,
      callData: TELLER.encodeFunctionData('withdraw', [
        MUSD,
        amount,
        amount - 1n,
        MONEY_ACCOUNT,
      ]) as Hex,
    },
    {
      target: MUSD,
      value: 0n,
      callData: ERC20.encodeFunctionData('transfer', [
        RECIPIENT,
        amount,
      ]) as Hex,
    },
  ];
}

/**
 * Builds a single ERC-20 `approve` call, as Mobile's Card link and unlink
 * approvals are.
 *
 * @param token - The token.
 * @param spender - The spender.
 * @param amount - The allowance.
 * @returns The approve call.
 */
export function buildApproveCall(
  token: Hex,
  spender: Hex,
  amount: bigint,
): Execution {
  return {
    target: token,
    value: 0n,
    callData: ERC20.encodeFunctionData('approve', [spender, amount]) as Hex,
  };
}

/**
 * Wraps calls in the account's own ERC-7821 `execute()`, as
 * `Delegation7702PublishHook` signs them.
 *
 * @param calls - The calls.
 * @returns The single execution of `execute()`.
 */
export function wrapInExecute(calls: Execution[]): Execution {
  const { data } = generateEIP7702BatchTransaction(
    MONEY_ACCOUNT,
    calls.map(({ target, value, callData }) => ({
      to: target,
      value: `0x${value.toString(16)}`,
      data: callData,
    })),
  );
  return { target: MONEY_ACCOUNT, value: 0n, callData: data as Hex };
}

/**
 * Builds a single-use delegation pinning the given executions, as the
 * clients do for every Money Account transaction.
 *
 * @param executions - The executions to pin. One execution uses
 * `ExactExecution`, more use `ExactExecutionBatch`.
 * @param options - Options.
 * @param options.mobileOrder - Put the exact-execution caveat first, as
 * Mobile does, instead of `LimitedCalls` first, as the extension does.
 * @returns The unsigned delegation.
 */
export function buildSingleUseDelegation(
  executions: Execution[],
  { mobileOrder = false }: { mobileOrder?: boolean } = {},
): UnsignedDelegation {
  const limitedCalls = {
    enforcer: CONTRACTS.LimitedCallsEnforcer,
    terms: createLimitedCallsTerms({ limit: 1 }),
    args: '0x' as Hex,
  };
  const exactExecution =
    executions.length > 1
      ? {
          enforcer: CONTRACTS.ExactExecutionBatchEnforcer,
          terms: createExactExecutionBatchTerms({ executions }),
          args: '0x' as Hex,
        }
      : {
          enforcer: CONTRACTS.ExactExecutionEnforcer,
          terms: createExactExecutionTerms({ execution: executions[0] }),
          args: '0x' as Hex,
        };

  return {
    delegate: ANY_BENEFICIARY,
    delegator: MONEY_ACCOUNT,
    authority: ROOT_AUTHORITY,
    caveats: mobileOrder
      ? [exactExecution, limitedCalls]
      : [limitedCalls, exactExecution],
    salt: `0x${'ab'.repeat(32)}`,
  };
}

/**
 * Builds a standing vault delegation, as `MoneyAccountUpgradeController`
 * does in its `build-delegation` step.
 *
 * @param options - Options.
 * @param options.tokenAddress - The token: mUSD or the vault share token.
 * @param options.redeemer - The vault adapter.
 * @returns The unsigned delegation.
 */
export function buildStandingDelegation({
  tokenAddress = MUSD,
  redeemer = VAULT.vedaVaultAdapterAddress,
}: { tokenAddress?: Hex; redeemer?: Hex } = {}): UnsignedDelegation {
  return {
    delegate: CHOMP_DELEGATE,
    delegator: MONEY_ACCOUNT,
    authority: ROOT_AUTHORITY,
    caveats: [
      {
        enforcer: CONTRACTS.ValueLteEnforcer,
        terms: createValueLteTerms({ maxValue: 0n }),
        args: '0x',
      },
      {
        enforcer: CONTRACTS.ERC20TransferAmountEnforcer,
        terms: createERC20TransferAmountTerms({
          tokenAddress,
          maxAmount: MAX_UINT256,
        }),
        args: '0x',
      },
      {
        enforcer: CONTRACTS.RedeemerEnforcer,
        terms: createRedeemerTerms({ redeemers: [redeemer] }),
        args: '0x',
      },
    ],
    salt: `0x${'cd'.repeat(32)}`,
  };
}

type RootMessenger = Messenger<
  MockAnyNamespace,
  MessengerActions<DelegationControllerMessenger>,
  MessengerEvents<DelegationControllerMessenger>
>;

/**
 * Runs a delegation through the real `DelegationController` and returns the
 * typed data it passes to `KeyringController:signTypedMessage`, i.e. what
 * the Money keyring is asked to sign.
 *
 * @param delegation - The unsigned delegation.
 * @returns The typed data.
 */
export async function getDelegationTypedData(
  delegation: UnsignedDelegation,
): Promise<Record<string, unknown>> {
  const rootMessenger: RootMessenger = new Messenger({
    namespace: MOCK_ANY_NAMESPACE,
  });
  const signTypedMessage = jest.fn().mockResolvedValue('0x');
  rootMessenger.registerActionHandler(
    'KeyringController:signTypedMessage',
    signTypedMessage,
  );

  const messenger: DelegationControllerMessenger = new Messenger({
    namespace: 'DelegationController',
    parent: rootMessenger,
  });
  rootMessenger.delegate({
    messenger,
    actions: ['KeyringController:signTypedMessage'],
  });

  const controller = new DelegationController({
    messenger,
    getDelegationEnvironment: (): DeleGatorEnvironment => ({
      DelegationManager: CONTRACTS.DelegationManager,
      EntryPoint: ZERO,
      SimpleFactory: ZERO,
      implementations: {},
      caveatEnforcers: {},
    }),
  });

  await controller.signDelegation({ delegation, chainId: CHAIN_ID });

  const [[messageParams]] = signTypedMessage.mock.calls as [
    [{ data: Record<string, unknown> }],
  ];
  return messageParams.data;
}

type DeleGatorEnvironment = ReturnType<
  ConstructorParameters<
    typeof DelegationController
  >[0]['getDelegationEnvironment']
>;
