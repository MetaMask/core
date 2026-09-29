import type { Hex } from '@metamask/utils';

import type { PerpsTypedDataPayload } from '../../src/types/index.js';
import { createMockEvmAccount } from './serviceMocks.js';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as const;

// The payloads below spell out the SDK's domain names, primary types and fee
// rate instead of reading HYPERLIQUID_L1_ACTION_DOMAIN_NAME,
// HYPERLIQUID_L1_ACTION_PRIMARY_TYPE or BUILDER_FEE_CONFIG, so the routing
// tests fail if one of those constants drifts from what the SDK signs.

// The SDK adds the domain type to every payload it signs.
const EIP712_DOMAIN_TYPE = [
  { name: 'name', type: 'string' },
  { name: 'version', type: 'string' },
  { name: 'chainId', type: 'uint256' },
  { name: 'verifyingContract', type: 'address' },
];

/** A second main account, for account-switch and scoping cases. */
export const OTHER_MAIN_ADDRESS =
  '0x00000000000000000000000000000000000b0b01' as const;

/** An agent address that is not the mock main account. */
export const AGENT_ADDRESS =
  '0x00000000000000000000000000000000000a9e17' as const;

/** A second agent address, for rebinding and rejection cases. */
export const OTHER_AGENT_ADDRESS =
  '0x00000000000000000000000000000000000b0a7d' as const;

/** A signature from the main account. */
export const MAIN_SIGNATURE = `0x${'cd'.repeat(65)}` as const;

/** A signature from an agent. */
export const AGENT_SIGNATURE = `0x${'ef'.repeat(65)}` as const;

/** A signature from the second agent. */
export const OTHER_AGENT_SIGNATURE = `0x${'0b'.repeat(65)}` as const;

/**
 * A user-signed action as the HyperLiquid SDK builds it (the
 * HyperliquidSignTransaction domain), for the mock main account.
 */
export const USER_SIGNED_PAYLOAD: PerpsTypedDataPayload = {
  domain: {
    name: 'HyperliquidSignTransaction',
    version: '1',
    chainId: 1,
    verifyingContract: ZERO_ADDRESS,
  },
  types: {
    EIP712Domain: EIP712_DOMAIN_TYPE,
    'HyperliquidTransaction:UserSetAbstraction': [
      { name: 'hyperliquidChain', type: 'string' },
      { name: 'user', type: 'address' },
      { name: 'abstraction', type: 'string' },
      { name: 'nonce', type: 'uint64' },
    ],
  },
  primaryType: 'HyperliquidTransaction:UserSetAbstraction',
  message: {
    hyperliquidChain: 'Mainnet',
    user: createMockEvmAccount().address,
    abstraction: 'unifiedAccount',
    nonce: 1,
  },
};

/**
 * A builder fee approval as the HyperLiquid SDK builds it: user-signed, like
 * the migration, but a different action.
 */
export const APPROVE_BUILDER_FEE_PAYLOAD: PerpsTypedDataPayload = {
  domain: USER_SIGNED_PAYLOAD.domain,
  types: {
    EIP712Domain: EIP712_DOMAIN_TYPE,
    'HyperliquidTransaction:ApproveBuilderFee': [
      { name: 'hyperliquidChain', type: 'string' },
      { name: 'maxFeeRate', type: 'string' },
      { name: 'builder', type: 'address' },
      { name: 'nonce', type: 'uint64' },
    ],
  },
  primaryType: 'HyperliquidTransaction:ApproveBuilderFee',
  message: {
    hyperliquidChain: 'Mainnet',
    maxFeeRate: '0.1%',
    builder: ZERO_ADDRESS,
    nonce: 1,
  },
};

/** An L1 action as the HyperLiquid SDK builds it (the Exchange domain). */
export const L1_PAYLOAD: PerpsTypedDataPayload = {
  domain: {
    name: 'Exchange',
    version: '1',
    chainId: 1337,
    verifyingContract: ZERO_ADDRESS,
  },
  types: {
    EIP712Domain: EIP712_DOMAIN_TYPE,
    Agent: [
      { name: 'source', type: 'string' },
      { name: 'connectionId', type: 'bytes32' },
    ],
  },
  primaryType: 'Agent',
  message: { source: 'a', connectionId: `0x${'22'.repeat(32)}` },
};

/**
 * The error the HyperLiquid SDK throws when the wallet fails to sign, with
 * the wallet's error as its cause.
 *
 * @param cause - The wallet's error.
 * @returns The SDK error.
 */
export function sdkSigningError(cause: unknown): Error {
  return new Error('Failed to sign the typed data using the wallet', {
    cause,
  });
}

/**
 * HyperLiquid's rejection of a signer it does not know: a revoked or expired
 * agent, or a wallet with no account yet.
 *
 * @param address - The signer the venue names.
 * @returns The venue error.
 */
export function unknownWalletError(address: string): Error {
  return new Error(`User or API Wallet ${address} does not exist.`);
}

/**
 * Sign through a wallet the way the HyperLiquid SDK does: a failure is
 * wrapped with the wallet's error as its cause.
 *
 * @param wallet - The wallet the SDK was built with.
 * @param wallet.signTypedData - Signs a typed-data payload.
 * @param payload - The payload to sign.
 * @returns The signature.
 */
export async function signThroughWallet(
  wallet: { signTypedData: (payload: PerpsTypedDataPayload) => Promise<Hex> },
  payload: PerpsTypedDataPayload,
): Promise<Hex> {
  try {
    return await wallet.signTypedData(payload);
  } catch (error) {
    throw sdkSigningError(error);
  }
}
