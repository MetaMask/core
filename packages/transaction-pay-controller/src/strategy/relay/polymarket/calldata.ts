import type { Hex } from '@metamask/utils';

const ERC20_TRANSFER_SELECTOR = '0xa9059cbb';
const ERC20_APPROVE_SELECTOR = '095ea7b3';
const POLYMARKET_UNWRAP_SELECTOR = '8cc7104f';
const POLYMARKET_WRAP_SELECTOR = '62355638';

export function encodeApprove(spender: Hex, amount: bigint): Hex {
  return encodeTwoArg(ERC20_APPROVE_SELECTOR, spender, amount);
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
  return encodeThreeArg(POLYMARKET_UNWRAP_SELECTOR, asset, recipient, amount);
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
  return encodeThreeArg(POLYMARKET_WRAP_SELECTOR, asset, recipient, amount);
}

export function extractErc20TransferRecipient(data: Hex): Hex {
  if (!data.startsWith(ERC20_TRANSFER_SELECTOR)) {
    throw new Error(
      `Expected ERC-20 transfer calldata, got selector ${data.slice(0, 10)}`,
    );
  }
  return `0x${data.slice(34, 74)}` as Hex;
}

function encodeTwoArg(selector: string, address: Hex, amount: bigint): Hex {
  return `0x${selector}${padAddress(address)}${padUint256(amount)}` as Hex;
}

function encodeThreeArg(
  selector: string,
  asset: Hex,
  recipient: Hex,
  amount: bigint,
): Hex {
  return `0x${selector}${padAddress(asset)}${padAddress(recipient)}${padUint256(amount)}` as Hex;
}

function padAddress(address: Hex): string {
  return address.slice(2).toLowerCase().padStart(64, '0');
}

function padUint256(value: bigint): string {
  return value.toString(16).padStart(64, '0');
}
