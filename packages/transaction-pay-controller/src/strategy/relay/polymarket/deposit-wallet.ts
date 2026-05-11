import { defaultAbiCoder } from '@ethersproject/abi';
import { getCreate2Address } from '@ethersproject/address';
import { hexConcat, hexZeroPad } from '@ethersproject/bytes';
import { keccak256 } from '@ethersproject/keccak256';
import type { Hex } from '@metamask/utils';

import {
  DEPOSIT_WALLET_FACTORY_ADDRESS_POLYGON,
  DEPOSIT_WALLET_IMPLEMENTATION_POLYGON,
} from './constants';

// Solady v0.1.26 LibClone.initCodeHashERC1967 byte constants.
const ERC1967_CONST1 =
  '0xcc3735a920a3ca505d382bbc545af43d6000803e6038573d6000fd5b3d6000f3';
const ERC1967_CONST2 =
  '0x5155f3363d3d373d3d363d7f360894a13ba1a3210667c828492db98dca3e2076';
const ERC1967_PREFIX = 0x61003d3d8160233d3973n;

/**
 * Compute the deterministic Polymarket deposit-wallet address for an EOA.
 *
 * Uses CREATE2 with the Solady ERC-1967 proxy init-code pattern, matching
 * the reference implementation in Polymarket's builder-relayer-client.
 *
 * @param ownerAddress - The EOA that owns the deposit wallet.
 * @returns The deterministic deposit wallet address on Polygon.
 */
export function computeDepositWalletAddress(ownerAddress: string): Hex {
  const walletId = hexZeroPad(ownerAddress.toLowerCase(), 32);

  const args = defaultAbiCoder.encode(
    ['address', 'bytes32'],
    [DEPOSIT_WALLET_FACTORY_ADDRESS_POLYGON, walletId],
  );

  const salt = keccak256(args);
  const initCodeHash = computeSoladyERC1967InitCodeHash(
    DEPOSIT_WALLET_IMPLEMENTATION_POLYGON,
    args,
  );

  return getCreate2Address(
    DEPOSIT_WALLET_FACTORY_ADDRESS_POLYGON,
    salt,
    initCodeHash,
  ) as Hex;
}

function computeSoladyERC1967InitCodeHash(
  implementation: string,
  args: string,
): string {
  const argByteLength = BigInt((args.length - 2) / 2);
  const prefixWithLength = ERC1967_PREFIX + (argByteLength << 56n);

  return keccak256(
    hexConcat([
      `0x${prefixWithLength.toString(16).padStart(20, '0')}`,
      implementation,
      '0x6009',
      ERC1967_CONST2,
      ERC1967_CONST1,
      args,
    ]),
  );
}
