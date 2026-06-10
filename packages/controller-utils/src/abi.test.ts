import { Interface } from '@ethersproject/abi';
import { Hex } from '@metamask/utils';

import { encodeFunctionData, decodeFunctionResult } from './abi';

const ERC20_ABI = [
  {
    constant: true,
    inputs: [{ name: '_owner', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: 'balance', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    constant: false,
    inputs: [
      { name: '_to', type: 'address' },
      { name: '_value', type: 'uint256' },
    ],
    name: 'transfer',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    constant: true,
    inputs: [],
    name: 'owner',
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

const ACCOUNT_ADDRESS = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';

describe('encodeFunctionData', () => {
  describe('with the ERC-20 ABI', () => {
    const erc20Interface = new Interface(ERC20_ABI);

    it('encodes a function with a single address parameter', () => {
      const result = encodeFunctionData(erc20Interface, 'balanceOf', [
        ACCOUNT_ADDRESS,
      ]);

      expect(result).toBe(
        erc20Interface.encodeFunctionData('balanceOf', [ACCOUNT_ADDRESS]),
      );
    });

    it('encodes a function with multiple parameters', () => {
      const result = encodeFunctionData(erc20Interface, 'transfer', [
        ACCOUNT_ADDRESS,
        '1000000000000000000',
      ]);

      expect(result).toBe(
        erc20Interface.encodeFunctionData('transfer', [
          ACCOUNT_ADDRESS,
          '1000000000000000000',
        ]),
      );
    });

    it('encodes addresses that are not checksummed', () => {
      const lowercaseAddress = ACCOUNT_ADDRESS.toLowerCase();

      const result = encodeFunctionData(erc20Interface, 'balanceOf', [
        lowercaseAddress,
      ]);

      expect(result).toBe(
        erc20Interface.encodeFunctionData('balanceOf', [ACCOUNT_ADDRESS]),
      );
    });

    it('throws when the function does not exist', () => {
      expect(() =>
        encodeFunctionData(erc20Interface, 'nonExistentFunction', []),
      ).toThrow(
        'no matching function (argument="name", value="nonExistentFunction", code=INVALID_ARGUMENT, version=abi/5.7.0)',
      );
    });
  });
});

describe('decodeFunctionResult', () => {
  describe('with the ERC-20 ABI', () => {
    const erc20Interface = new Interface(ERC20_ABI);

    it('decodes a single uint256 output', () => {
      const data = erc20Interface.encodeFunctionResult('balanceOf', [
        '1000000000000000000',
      ]) as Hex;

      const result = decodeFunctionResult(erc20Interface, 'balanceOf', data);

      expect(result[0].toString()).toBe('1000000000000000000');
      expect(result).toStrictEqual(
        erc20Interface.decodeFunctionResult('balanceOf', data),
      );
    });

    it('decodes an address output and returns it checksummed', () => {
      const data = erc20Interface.encodeFunctionResult('owner', [
        ACCOUNT_ADDRESS.toLowerCase(),
      ]) as Hex;

      const result = decodeFunctionResult(erc20Interface, 'owner', data);

      expect(result[0]).toBe(ACCOUNT_ADDRESS);
      expect(result).toStrictEqual(
        erc20Interface.decodeFunctionResult('owner', data),
      );
    });

    it('decodes a boolean output', () => {
      const data = erc20Interface.encodeFunctionResult('transfer', [
        true,
      ]) as Hex;

      const result = decodeFunctionResult(erc20Interface, 'transfer', data);

      expect(result[0]).toBe(true);
      expect(result).toStrictEqual(
        erc20Interface.decodeFunctionResult('transfer', data),
      );
    });

    it('throws when the function does not exist', () => {
      expect(() =>
        decodeFunctionResult(erc20Interface, 'nonExistentFunction', '0x'),
      ).toThrow(
        'no matching function (argument="name", value="nonExistentFunction", code=INVALID_ARGUMENT, version=abi/5.7.0)',
      );
    });
  });
});
