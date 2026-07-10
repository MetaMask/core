import { Interface } from '@ethersproject/abi';
import type { CaipChainId, Hex } from '@metamask/utils';

import { formatAddressToAssetId } from '../src/mappers/helpers/caip';
import type { KnownTokenMetadata } from '../src/mappers/helpers/token-metadata';

const knownTokens: Record<
  string,
  Record<string, { symbol?: string; decimals?: number }>
> = {
  'eip155:1': {
    '0xdac17f958d2ee523a2206206994597c13d831ec7': {
      symbol: 'USDT',
      decimals: 6,
    },
  },
  'eip155:8453': {
    '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913': {
      symbol: 'USDC',
      decimals: 6,
    },
  },
  'eip155:59144': {
    '0xaca92e438df0b2401ff60da7e4337b687a2435da': {
      symbol: 'mUSD',
      decimals: 6,
    },
  },
};

/**
 * Mock of the package's `getKnownTokenMetadata`. Returns metadata plus the
 * encoded CAIP asset id for the small set of tokens the adapter tests rely on.
 *
 * @param chainId - CAIP-2 (or hex) chain id.
 * @param contractAddress - The token contract address.
 * @returns The known token metadata, or `undefined`.
 */
export function getKnownTokenMetadata(
  chainId: CaipChainId | Hex,
  contractAddress?: string,
): KnownTokenMetadata | undefined {
  if (!contractAddress) {
    return undefined;
  }

  const entry = knownTokens[chainId]?.[contractAddress.toLowerCase()];

  if (!entry) {
    return undefined;
  }

  const assetId = formatAddressToAssetId(contractAddress, chainId);

  return { ...entry, ...(assetId ? { assetId } : {}) };
}

/**
 * Encodes ERC-20 `approve(spender, amountOrTokenId)` calldata.
 *
 * @param address - The spender address.
 * @param amountOrTokenId - The approved amount or token id.
 * @returns The encoded calldata.
 */
export function buildApproveTransactionData(
  address: string,
  amountOrTokenId: number,
): Hex {
  return new Interface([
    'function approve(address spender, uint256 amountOrTokenId)',
  ]).encodeFunctionData('approve', [address, amountOrTokenId]) as Hex;
}

/**
 * Encodes Permit2 `approve(token, spender, amount, nonce)` calldata.
 *
 * @param token - The token contract address.
 * @param spender - The spender address.
 * @param amount - The approved amount.
 * @param expiration - The approval expiration / nonce.
 * @returns The encoded calldata.
 */
export function buildPermit2ApproveTransactionData(
  token: string,
  spender: string,
  amount: number,
  expiration: number,
): Hex {
  return new Interface([
    'function approve(address token, address spender, uint160 amount, uint48 nonce)',
  ]).encodeFunctionData('approve', [token, spender, amount, expiration]) as Hex;
}

const merklClaimAbi = [
  'function claim(address[] calldata users, address[] calldata tokens, uint256[] calldata amounts, bytes32[][] calldata proofs)',
];

/**
 * Encodes Merkl `claim(...)` calldata used to exercise the mUSD claim path.
 *
 * @param args - The claim arguments.
 * @param args.users - The claiming user addresses.
 * @param args.tokens - The claimed token addresses.
 * @param args.amounts - The claimed amounts.
 * @param args.proofs - The Merkle proofs.
 * @returns The encoded calldata.
 */
export function encodeMerklClaimCalldata({
  users,
  tokens,
  amounts,
  proofs,
}: {
  users: string[];
  tokens: string[];
  amounts: string[];
  proofs: string[][];
}): Hex {
  return new Interface(merklClaimAbi).encodeFunctionData('claim', [
    users,
    tokens,
    amounts,
    proofs,
  ]) as Hex;
}
