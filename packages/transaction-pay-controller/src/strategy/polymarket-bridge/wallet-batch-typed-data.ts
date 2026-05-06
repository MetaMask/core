import type { Hex } from '@metamask/utils';

import {
  POLYMARKET_WALLET_DOMAIN_NAME,
  POLYMARKET_WALLET_DOMAIN_VERSION,
} from './constants';

type EIP712DomainField = { name: string; type: string };

const DOMAIN_FIELD_MAP: Record<string, EIP712DomainField> = {
  name: { name: 'name', type: 'string' },
  version: { name: 'version', type: 'string' },
  chainId: { name: 'chainId', type: 'uint256' },
  verifyingContract: { name: 'verifyingContract', type: 'address' },
  salt: { name: 'salt', type: 'bytes32' },
};

/**
 * Build EIP-712 typed data for a Polymarket DepositWallet Batch.
 *
 * The typed data follows Polymarket's spec:
 * - Domain: { name: 'DepositWallet', version: '1', chainId, verifyingContract: wallet }
 * - Types: Call[] = [{ target: address, value: uint256, data: bytes }]
 *          Batch = [{ nonce: uint256, deadline: uint256, calls: Call[] }]
 * - PrimaryType: 'Batch'
 * - Message: { nonce, deadline, calls: [{ target, value, data }] }
 *
 * @param options - The options for building the typed data.
 * @param options.wallet - The verifying contract address (the user's DepositWallet).
 * @param options.nonce - The nonce for the batch.
 * @param options.deadline - The expiration timestamp for the batch.
 * @param options.calls - The list of calls to execute.
 * @param options.chainId - The chain ID where the wallet is deployed.
 * @returns The EIP-712 typed data object.
 */
export function buildWalletBatchTypedData({
  wallet,
  nonce,
  deadline,
  calls,
  chainId,
}: {
  wallet: Hex;
  nonce: string;
  deadline: number;
  calls: { target: Hex; value: bigint; data: Hex }[];
  chainId: number;
}): {
  domain: Record<string, unknown>;
  types: Record<string, EIP712DomainField[]>;
  primaryType: 'Batch';
  message: Record<string, unknown>;
} {
  const domain = {
    name: POLYMARKET_WALLET_DOMAIN_NAME,
    version: POLYMARKET_WALLET_DOMAIN_VERSION,
    chainId,
    verifyingContract: wallet,
  };

  const types = {
    EIP712Domain: deriveEIP712DomainType(domain),
    Batch: [
      { name: 'wallet', type: 'address' },
      { name: 'nonce', type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
      { name: 'calls', type: 'Call[]' },
    ],
    Call: [
      { name: 'target', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'data', type: 'bytes' },
    ],
  };

  const message = {
    wallet,
    nonce,
    deadline,
    calls: calls.map((call) => ({
      target: call.target,
      value: call.value.toString(),
      data: call.data,
    })),
  };

  return {
    domain,
    types,
    primaryType: 'Batch' as const,
    message,
  };
}

/**
 * Derive the EIP712Domain type array from a domain object.
 * eth-sig-util defaults to EIP712Domain: [] when absent, breaking
 * the domain separator hash. This ensures it matches ethers.js behavior.
 *
 * @param domain - The EIP-712 domain object.
 * @returns The EIP712Domain type array in canonical order.
 */
function deriveEIP712DomainType(
  domain: Record<string, unknown>,
): EIP712DomainField[] {
  return Object.keys(DOMAIN_FIELD_MAP)
    .filter((key) => Object.prototype.hasOwnProperty.call(domain, key))
    .map((key) => DOMAIN_FIELD_MAP[key]);
}
