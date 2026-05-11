import type { Hex } from '@metamask/utils';

const ERC20_TRANSFER_SELECTOR = '0xa9059cbb';

export function encodeApprove(spender: Hex, amount: bigint): Hex {
  return `0x095ea7b3${padAddress(spender)}${padUint256(amount)}` as Hex;
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
  return `0x8cc7104f${padAddress(asset)}${padAddress(recipient)}${padUint256(amount)}` as Hex;
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
  return `0x62355638${padAddress(asset)}${padAddress(recipient)}${padUint256(amount)}` as Hex;
}

export function extractErc20TransferRecipient(data: Hex): Hex {
  if (!data.startsWith(ERC20_TRANSFER_SELECTOR)) {
    throw new Error(
      `Expected ERC-20 transfer calldata, got selector ${data.slice(0, 10)}`,
    );
  }
  return `0x${data.slice(34, 74)}` as Hex;
}

function padAddress(address: Hex): string {
  return address.slice(2).toLowerCase().padStart(64, '0');
}

function padUint256(value: bigint): string {
  return value.toString(16).padStart(64, '0');
}
