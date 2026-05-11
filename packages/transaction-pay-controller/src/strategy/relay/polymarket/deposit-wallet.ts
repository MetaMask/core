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

  const args = abiEncode(
    ['address', 'bytes32'],
    [DEPOSIT_WALLET_FACTORY_ADDRESS_POLYGON, walletId],
  );

  const salt = keccak256(args);
  const bytecodeHash = initCodeHashERC1967(
    DEPOSIT_WALLET_IMPLEMENTATION_POLYGON,
    args,
  );

  return getCreate2Address(
    DEPOSIT_WALLET_FACTORY_ADDRESS_POLYGON,
    salt,
    bytecodeHash,
  );
}

function initCodeHashERC1967(implementation: string, args: string): string {
  const n = BigInt((args.length - 2) / 2);
  const combined = ERC1967_PREFIX + (n << 56n);

  return keccak256(
    hexConcat([
      bigintToHex(combined, 10),
      implementation,
      '0x6009',
      ERC1967_CONST2,
      ERC1967_CONST1,
      args,
    ]),
  );
}

function bigintToHex(value: bigint, byteLength: number): string {
  const hex = value.toString(16).padStart(byteLength * 2, '0');
  return `0x${hex}`;
}

function hexZeroPad(value: string, length: number): string {
  const stripped = value.startsWith('0x') ? value.slice(2) : value;
  return `0x${stripped.padStart(length * 2, '0')}`;
}

function abiEncode(types: string[], values: string[]): string {
  const encoded = types.map((type, i) => {
    const val = values[i];
    if (type === 'address') {
      return hexZeroPad(val, 32);
    }
    if (type === 'bytes32') {
      return val.startsWith('0x') ? val : `0x${val}`;
    }
    throw new Error(`Unsupported ABI type: ${type}`);
  });

  return `0x${encoded.map((e) => e.slice(2)).join('')}`;
}

function keccak256(data: string): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
  const { keccak256: k } = require('@ethersproject/keccak256');
  return k(data) as string;
}

function hexConcat(items: string[]): string {
  return `0x${items.map((item) => (item.startsWith('0x') ? item.slice(2) : item)).join('')}`;
}

function getCreate2Address(
  deployer: string,
  salt: string,
  bytecodeHash: string,
): Hex {
  const data = hexConcat([
    '0xff',
    hexZeroPad(deployer, 20),
    salt,
    bytecodeHash,
  ]);

  const hash = keccak256(data);
  return `0x${hash.slice(26)}` as Hex;
}
