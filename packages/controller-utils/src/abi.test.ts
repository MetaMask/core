import { Interface } from '@ethersproject/abi';

import { encodeFunctionData } from './abi.js';

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
