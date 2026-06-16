import { Interface } from '@ethersproject/abi';
import type { Hex } from '@metamask/utils';

const TOKEN_TRANSFER_INTERFACE = new Interface([
  'function transfer(address to, uint256 amount)',
]);

/**
 * Build ERC-20 `transfer(address,uint256)` calldata.
 *
 * @param recipient - Recipient address.
 * @param amountRaw - Amount in raw token units.
 * @returns Token transfer calldata.
 */
export function buildTokenTransferData(recipient: Hex, amountRaw: string): Hex {
  return TOKEN_TRANSFER_INTERFACE.encodeFunctionData('transfer', [
    recipient,
    amountRaw,
  ]) as Hex;
}
