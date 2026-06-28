import { defaultAbiCoder } from '@ethersproject/abi';
import { SignTypedDataVersion } from '@metamask/keyring-controller';
import type { Hex } from '@metamask/utils';
import { createModuleLogger } from '@metamask/utils';
import { BigNumber } from 'bignumber.js';

import { projectLogger } from '../../../logger';
import type { TransactionPayControllerMessenger } from '../../../types';

const log = createModuleLogger(projectLogger, 'subsidized-delegation');

/** ROOT_AUTHORITY: indicates this is a root (not re-)delegation. */
const ROOT_AUTHORITY =
  '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';

/** ANY_BENEFICIARY: open delegate — any address can redeem. */
const ANY_BENEFICIARY =
  '0x0000000000000000000000000000000000000a11' as const;

/**
 * DelegationManager contract address (same across all supported chains,
 * version 1.3.0 of the MetaMask delegation framework).
 */
export const DELEGATION_MANAGER_ADDRESS =
  '0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3' as Hex;

/**
 * ERC20BalanceChangeEnforcer contract address (version 1.3.0, all supported
 * chains). Enforces that the delegator's ERC20 balance decreases by at most
 * the specified amount during execution.
 */
export const ERC20_BALANCE_CHANGE_ENFORCER_ADDRESS =
  '0xcdF6aB796408598Cea671d79506d7D48E97a5437' as Hex;

/**
 * LimitedCallsEnforcer contract address (version 1.3.0, all supported chains).
 * Restricts the delegation to a single execution, preventing replay.
 */
export const LIMITED_CALLS_ENFORCER_ADDRESS =
  '0x04658B29F6b82ed55274221a06Fc97D318E25416' as Hex;

/**
 * Amount buffer applied on top of the preview source amount before signing.
 * 2000 BPS = 20% — matches the server's expected slippage tolerance.
 */
export const SUBSIDIZED_AMOUNT_BUFFER_BPS = 2000;

/** EIP-712 type definitions for delegation signing (without EIP712Domain). */
const DELEGATION_EIP712_TYPES = {
  Caveat: [
    { name: 'enforcer', type: 'address' },
    { name: 'terms', type: 'bytes' },
  ],
  Delegation: [
    { name: 'delegate', type: 'address' },
    { name: 'delegator', type: 'address' },
    { name: 'authority', type: 'bytes32' },
    { name: 'caveats', type: 'Caveat[]' },
    { name: 'salt', type: 'uint256' },
  ],
} as const;

type Caveat = {
  enforcer: Hex;
  terms: Hex;
  args: Hex;
};

type SubsidizedDelegation = {
  delegate: Hex;
  delegator: Hex;
  authority: string;
  caveats: Caveat[];
  salt: bigint;
  signature: Hex;
};

/**
 * Encode the terms for an ERC20BalanceChangeEnforcer caveat.
 *
 * Uses `solidityPack` (tight packing) to encode:
 *   `(bool enforceDecrease=true, address token, address recipient, uint256 amount)`
 *
 * The bool is always `true` (spending cap: the delegator's balance of `token`
 * must not decrease by more than `amount` during execution).
 *
 * @param token - ERC20 token address.
 * @param recipient - Address whose balance is monitored (typically `from`).
 * @param amount - Maximum allowed balance decrease in atomic units.
 * @returns Hex-encoded packed caveat terms.
 */
function encodeERC20BalanceChangeTerms(
  token: Hex,
  recipient: Hex,
  amount: bigint,
): Hex {
  // Tight-packed: bool=true (1 byte) + address (20 bytes) + address (20 bytes) + uint256 (32 bytes) = 73 bytes
  const tokenHex = token.replace('0x', '').toLowerCase().padStart(40, '0');
  const recipientHex = recipient
    .replace('0x', '')
    .toLowerCase()
    .padStart(40, '0');
  const amountHex = amount.toString(16).padStart(64, '0');

  return `0x01${tokenHex}${recipientHex}${amountHex}` as Hex;
}

/**
 * Build an ERC20BalanceChangeEnforcer caveat that caps how much of `token`
 * the delegator (identified by `recipient`) can spend in a single execution.
 *
 * @param token - ERC20 token address.
 * @param recipient - Address whose balance is monitored (use `from` to cap user spending).
 * @param amount - Maximum allowed decrease in atomic units.
 * @returns Caveat object ready for inclusion in a delegation.
 */
function buildERC20BalanceChangeCaveat(
  token: Hex,
  recipient: Hex,
  amount: bigint,
): Caveat {
  return {
    enforcer: ERC20_BALANCE_CHANGE_ENFORCER_ADDRESS,
    terms: encodeERC20BalanceChangeTerms(token, recipient, amount),
    args: '0x',
  };
}

/**
 * Build a LimitedCallsEnforcer caveat restricting execution to a given count.
 *
 * @param count - Maximum number of times the delegation may be redeemed.
 * @returns Caveat object ready for inclusion in a delegation.
 */
function buildLimitedCallsCaveat(count: number): Caveat {
  const terms = defaultAbiCoder.encode(['uint256'], [count]) as Hex;
  return {
    enforcer: LIMITED_CALLS_ENFORCER_ADDRESS,
    terms,
    args: '0x',
  };
}

/**
 * ABI-encode a signed delegation as a permission context (bytes).
 *
 * The permission context format matches what `redeemDelegations` expects:
 * ABI encoding of `Delegation[]` where each delegation is the struct tuple
 * `(address,address,bytes32,(address,bytes,bytes)[],uint256,bytes)`.
 *
 * @param delegation - Fully signed delegation struct.
 * @returns Hex-encoded ABI bytes (permission context).
 */
function encodeDelegationAsPermissionContext(
  delegation: SubsidizedDelegation,
): Hex {
  const encoded = defaultAbiCoder.encode(
    ['(address,address,bytes32,(address,bytes,bytes)[],uint256,bytes)[]'],
    [
      [
        [
          delegation.delegate,
          delegation.delegator,
          delegation.authority,
          delegation.caveats.map((c) => [c.enforcer, c.terms, c.args]),
          delegation.salt,
          delegation.signature,
        ],
      ],
    ],
  );

  return encoded as Hex;
}

/**
 * Generate a random salt for a delegation (uint256 packed as a bigint).
 *
 * @returns A random bigint salt.
 */
function generateDelegationSalt(): bigint {
  const randomHex = Math.random().toString(16).slice(2, 10);
  return BigInt(`0x${randomHex}`);
}

/**
 * Build and sign a subsidized delegation.
 *
 * Produces a delegation bound to ERC20BalanceChangeEnforcer and
 * LimitedCallsEnforcer caveats. The ERC20BalanceChangeEnforcer caps how
 * much of `sourceTokenAddress` can leave the user's 7702 account in a
 * single execution; LimitedCallsEnforcer prevents replay.
 *
 * Unlike the exact-execution delegation used by the standard Relay execute
 * path, this delegation does NOT commit to specific Relay calldata. The
 * intents-api server builds the actual `redeemDelegations` calldata from its
 * own JIT Relay quote using the signed permission context returned here.
 *
 * @param params.from - Delegator / 7702 account address.
 * @param params.sourceChainId - Hex chain ID of the source chain.
 * @param params.sourceTokenAddress - ERC20 token being spent.
 * @param params.sourceAmountRaw - Atomic source amount from the preview quote.
 * @param params.messenger - Controller messenger (provides KeyringController).
 * @returns ABI-encoded signed delegation bytes (permission context).
 */
export async function buildAndSignSubsidizedDelegation(params: {
  from: Hex;
  sourceChainId: Hex;
  sourceTokenAddress: Hex;
  sourceAmountRaw: string;
  messenger: TransactionPayControllerMessenger;
}): Promise<Hex> {
  const { from, sourceChainId, sourceTokenAddress, sourceAmountRaw, messenger } =
    params;

  // Apply amount buffer so the server's JIT quote doesn't exceed the cap
  // even if the price moves slightly between preview and submit.
  const amountWithBuffer = new BigNumber(sourceAmountRaw)
    .multipliedBy(1 + SUBSIDIZED_AMOUNT_BUFFER_BPS / 10_000)
    .integerValue(BigNumber.ROUND_CEIL)
    .toFixed(0);

  log('Building subsidized delegation', {
    from,
    sourceChainId,
    sourceTokenAddress,
    sourceAmountRaw,
    amountWithBuffer,
  });

  const caveats: Caveat[] = [
    buildERC20BalanceChangeCaveat(
      sourceTokenAddress,
      from, // track the delegator's own balance decrease (spending cap)
      BigInt(amountWithBuffer),
    ),
    buildLimitedCallsCaveat(1),
  ];

  const salt = generateDelegationSalt();

  const chainIdNumber = parseInt(sourceChainId, 16);

  const typedData = {
    domain: {
      chainId: chainIdNumber,
      name: 'DelegationManager',
      version: '1',
      verifyingContract: DELEGATION_MANAGER_ADDRESS,
    },
    types: {
      EIP712Domain: [
        { name: 'name', type: 'string' },
        { name: 'version', type: 'string' },
        { name: 'chainId', type: 'uint256' },
        { name: 'verifyingContract', type: 'address' },
      ],
      ...DELEGATION_EIP712_TYPES,
    },
    primaryType: 'Delegation',
    message: {
      delegate: ANY_BENEFICIARY,
      delegator: from,
      authority: ROOT_AUTHORITY,
      // EIP-712 Caveat type omits 'args' (runtime argument)
      caveats: caveats.map((c) => ({
        enforcer: c.enforcer,
        terms: c.terms,
      })),
      // Convert to decimal string so JSON.stringify doesn't throw on BigInt.
      // eth-sig-util interprets decimal-string uint256 correctly when signing.
      salt: salt.toString(),
    },
  };

  log('Signing delegation via KeyringController:signTypedMessage');

  const signature = (await messenger.call(
    'KeyringController:signTypedMessage',
    { from, data: JSON.stringify(typedData) },
    SignTypedDataVersion.V4,
  )) as Hex;

  log('Delegation signed', { signature });

  const delegation: SubsidizedDelegation = {
    delegate: ANY_BENEFICIARY as Hex,
    delegator: from,
    authority: ROOT_AUTHORITY,
    caveats,
    salt,
    signature,
  };

  const permissionContext = encodeDelegationAsPermissionContext(delegation);

  log('Delegation encoded as permission context', {
    permissionContext: permissionContext.slice(0, 66) + '...',
  });

  return permissionContext;
}
