import type { Hex } from '@metamask/utils';

/** The default `maxMessageAge` of the whitelist config: five minutes. */
export const DEFAULT_MAX_MESSAGE_AGE = 5 * 60 * 1000;

/**
 * How far past `maxMessageAge` a Rewards claim proof's expiry may be, for
 * clock skew between the Rewards backend, which sets the expiry, and the
 * signer: one minute. The expiry is set by the Rewards money service's
 * `CLAIM_PROOF_CHALLENGE_TTL_SECONDS` (default 300), which must stay at or
 * below `maxMessageAge` plus this skew, or every claim proof requires MFA.
 */
export const CLAIM_PROOF_CLOCK_SKEW = 60 * 1000;

export const ZERO_ADDRESS: Hex = '0x0000000000000000000000000000000000000000';

/** `approve(address,uint256)` */
export const ERC20_APPROVE_SELECTOR: Hex = '0x095ea7b3';

/**
 * `receiveWithAuthorization(address,address,uint256,uint256,uint256,bytes32,bytes)`
 * from EIP-3009, the overload Mobile's Rewards claim calls on mUSD.
 */
export const RECEIVE_WITH_AUTHORIZATION_SELECTOR: Hex = '0x88b7ab63';

/** `deposit(address,uint256,uint256,address)` on the vault teller. */
export const TELLER_DEPOSIT_SELECTOR: Hex = '0x8b6099db';

/** `execute(bytes32,bytes)` from ERC-7821. */
export const ERC7821_EXECUTE_SELECTOR: Hex = '0xe9ae5c53';

/**
 * The ERC-7579 mode of an atomic batch (call type batch, exec type default),
 * which reverts every call if one fails.
 */
export const ERC7579_BATCH_DEFAULT_MODE: Hex = `0x01${'00'.repeat(31)}`;

/** The EIP-712 types every delegation is signed with. */
export const DELEGATION_TYPES = {
  EIP712Domain: [
    { name: 'name', type: 'string' },
    { name: 'version', type: 'string' },
    { name: 'chainId', type: 'uint256' },
    { name: 'verifyingContract', type: 'address' },
  ],
  Delegation: [
    { name: 'delegate', type: 'address' },
    { name: 'delegator', type: 'address' },
    { name: 'authority', type: 'bytes32' },
    { name: 'caveats', type: 'Caveat[]' },
    { name: 'salt', type: 'uint256' },
  ],
  Caveat: [
    { name: 'enforcer', type: 'address' },
    { name: 'terms', type: 'bytes' },
  ],
} as const;
