import { add0x, remove0x } from '@metamask/utils';

// ERC-20 transfer function selector: keccak256('transfer(address,uint256)').slice(0, 10)
const TRANSFER_FUNCTION_SELECTOR = '0xa9059cbb';

/**
 * Generate ERC-20 transfer call data.
 *
 * Encodes the function selector and parameters for an ERC-20 transfer(address,uint256) call.
 * This is equivalent to the mobile implementation using ethereumjs-abi rawEncode.
 *
 * @param type - The transfer type (only 'transfer' supported).
 * @param opts - Options containing toAddress and amount.
 * @param opts.toAddress - The recipient address (20 bytes, with or without 0x prefix).
 * @param opts.amount - The amount as hex string (with or without 0x prefix).
 * @returns Encoded transfer data as hex string with 0x prefix.
 */
export function generateTransferData(
  type: 'transfer',
  opts: { toAddress: string; amount: string },
): string {
  // Type guard - this function only supports 'transfer' type
  // The type parameter is kept for API compatibility with mobile's version
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _type: 'transfer' = type;

  // Pad address to 32 bytes (64 hex chars)
  // Remove 0x prefix, lowercase, then left-pad with zeros
  const paddedAddress = remove0x(opts.toAddress)
    .toLowerCase()
    .padStart(64, '0');

  // Pad amount to 32 bytes (64 hex chars)
  // Remove 0x prefix, then left-pad with zeros
  const paddedAmount = remove0x(opts.amount).padStart(64, '0');

  // Combine: selector (4 bytes) + address (32 bytes) + amount (32 bytes)
  return add0x(
    `${remove0x(TRANSFER_FUNCTION_SELECTOR)}${paddedAddress}${paddedAmount}`,
  );
}
