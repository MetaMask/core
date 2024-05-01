/**
 * Converts a chain ID string to a compliant CAIP-2 chain ID reference for EIP-155 chains.
 *
 * @param chainId - Chain ID string
 * @returns An CAIP-2 chain ID reference for EIP-155 chains.
 */
export function toEip155ChainId(chainId: string): string {
  const chainIdNumber = Number(chainId);

  // If for some reason the chainId isn't convertible to a decimal integer representation, we fallback
  // to the initial `chainId`.
  return Number.isInteger(chainIdNumber) ? chainIdNumber.toString() : chainId;
}
