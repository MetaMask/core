import { Interface } from '@ethersproject/abi';
import type { Hex } from '@metamask/utils';

const iface = new Interface([
  'function approve(address spender, uint256 amount)',
  'function unwrap(address asset, address recipient, uint256 amount)',
  'function wrap(address asset, address recipient, uint256 amount)',
  'function transfer(address recipient, uint256 amount)',
]);

export function encodeApprove(spender: Hex, amount: bigint): Hex {
  return iface.encodeFunctionData('approve', [spender, amount]) as Hex;
}

export function encodeUnwrap({
  asset,
  recipient,
  amount,
}: {
  asset: Hex;
  recipient: Hex;
  amount: bigint;
}): Hex {
  return iface.encodeFunctionData('unwrap', [asset, recipient, amount]) as Hex;
}

export function encodeWrap({
  asset,
  recipient,
  amount,
}: {
  asset: Hex;
  recipient: Hex;
  amount: bigint;
}): Hex {
  return iface.encodeFunctionData('wrap', [asset, recipient, amount]) as Hex;
}

export function extractErc20TransferRecipient(data: Hex): Hex {
  const [recipient] = iface.decodeFunctionData('transfer', data);
  return recipient as Hex;
}
