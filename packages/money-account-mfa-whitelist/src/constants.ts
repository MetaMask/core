import type { Hex } from '@metamask/utils';

/** The default `maxMessageAge` of the whitelist config: five minutes. */
export const DEFAULT_MAX_MESSAGE_AGE = 5 * 60 * 1000;

export const ZERO_ADDRESS: Hex = '0x0000000000000000000000000000000000000000';

/** `approve(address,uint256)` */
export const ERC20_APPROVE_SELECTOR: Hex = '0x095ea7b3';

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
