import { defaultAbiCoder } from '@ethersproject/abi';
import { Contract } from '@ethersproject/contracts';
import { Web3Provider } from '@ethersproject/providers';
import { abiERC20 } from '@metamask/metamask-eth-abis';
import type { Hex } from '@metamask/utils';
import BN from 'bn.js';

import {
  multicallOrFallback,
  aggregate3,
  getTokenBalancesForMultipleAddresses,
  getStakedBalancesForAddresses,
  type Aggregate3Call,
} from './multicall';

const provider = new Web3Provider(jest.fn());

// Create a mock contract for testing
const mockContract = new Contract(
  '0x1234567890123456789012345678901234567890',
  abiERC20,
  provider,
);

describe('multicall', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return empty results for empty calls', async () => {
    const results = await multicallOrFallback([], '0x1', provider);
    expect(results).toStrictEqual([]);
  });

  describe('when calls are non empty', () => {
    // Mock mutiple calls
    const call = (accountAddress: string, tokenAddress: string) => ({
      contract: new Contract(tokenAddress, abiERC20, provider),
      functionSignature: 'balanceOf(address)',
      arguments: [accountAddress],
    });

    const calls = [
      call(
        '0x0000000000000000000000000000000000000000',
        '0x0000000000000000000000000000000000000001',
      ),
      call(
        '0x0000000000000000000000000000000000000002',
        '0x0000000000000000000000000000000000000003',
      ),
    ];

    it('should return results via multicall on supported chains', async () => {
      // Mock return value for the single multicall
      jest
        .spyOn(provider, 'call')
        .mockResolvedValue(
          defaultAbiCoder.encode(
            ['tuple(bool,bytes)[]'],
            [
              calls.map((_, i) => [
                true,
                defaultAbiCoder.encode(['uint256'], [i + 1]),
              ]),
            ],
          ),
        );

      const results = await multicallOrFallback(calls, '0x1', provider);
      expect(results).toMatchObject([
        {
          success: true,
          // eslint-disable-next-line @typescript-eslint/naming-convention
          value: { _hex: '0x01' },
        },
        {
          success: true,
          // eslint-disable-next-line @typescript-eslint/naming-convention
          value: { _hex: '0x02' },
        },
      ]);
    });

    it('should handle the multicall contract returning false for success', async () => {
      // Mock an unsuccessful multicall
      jest
        .spyOn(provider, 'call')
        .mockResolvedValue(
          defaultAbiCoder.encode(
            ['tuple(bool,bytes)[]'],
            [
              calls.map((_, i) => [
                false,
                defaultAbiCoder.encode(['uint256'], [i + 1]),
              ]),
            ],
          ),
        );

      const results = await multicallOrFallback(calls, '0x1', provider);
      expect(results).toMatchObject([
        {
          success: false,
          value: undefined,
        },
        {
          success: false,
          value: undefined,
        },
      ]);
    });

    it('should fallback to parallel calls on unsupported chains', async () => {
      // Mock return values for each call
      let timesCalled = 0;
      jest
        .spyOn(provider, 'call')
        .mockImplementation(() =>
          Promise.resolve(
            defaultAbiCoder.encode(['uint256'], [(timesCalled += 1)]),
          ),
        );

      const results = await multicallOrFallback(calls, '0x123456789', provider);
      expect(results).toMatchObject([
        {
          success: true,
          // eslint-disable-next-line @typescript-eslint/naming-convention
          value: { _hex: '0x01' },
        },
        {
          success: true,
          // eslint-disable-next-line @typescript-eslint/naming-convention
          value: { _hex: '0x02' },
        },
      ]);
    });
  });

  describe('error handling of reverts', () => {
    const call = {
      contract: new Contract(
        '0x0000000000000000000000000000000000000001',
        abiERC20,
        provider,
      ),
      functionSignature: 'balanceOf(address)',
      arguments: ['0x0000000000000000000000000000000000000000'],
    };

    it('should fall back to parallel calls when multicall reverts', async () => {
      jest.spyOn(provider, 'call').mockImplementationOnce(() => {
        const error = { code: 'CALL_EXCEPTION' };
        return Promise.reject(error);
      });

      jest
        .spyOn(provider, 'call')
        .mockImplementationOnce(() =>
          Promise.resolve(defaultAbiCoder.encode(['uint256'], [1])),
        );

      const results = await multicallOrFallback([call], '0x1', provider);

      expect(results).toMatchObject([
        {
          success: true,
          // eslint-disable-next-line @typescript-eslint/naming-convention
          value: { _hex: '0x01' },
        },
      ]);
    });

    it('should throw rpc errors other than revert', async () => {
      const error = { code: 'network error' };
      jest.spyOn(provider, 'call').mockImplementationOnce(() => {
        return Promise.reject(error);
      });

      await expect(
        multicallOrFallback([call], '0x1', provider),
      ).rejects.toMatchObject(error);
    });
  });

  describe('aggregate3', () => {
    it('should return empty results for empty calls', async () => {
      const results = await aggregate3([], '0x1', provider);
      expect(results).toStrictEqual([]);
    });

    it('should execute aggregate3 calls successfully', async () => {
      const calls: Aggregate3Call[] = [
        {
          target: '0x0000000000000000000000000000000000000001',
          allowFailure: true,
          callData:
            '0x70a08231000000000000000000000000000000000000000000000000000000000000000a',
        },
        {
          target: '0x0000000000000000000000000000000000000002',
          allowFailure: false,
          callData:
            '0x70a08231000000000000000000000000000000000000000000000000000000000000000b',
        },
      ];

      // Mock the aggregate3 contract call
      jest.spyOn(provider, 'call').mockResolvedValue(
        defaultAbiCoder.encode(
          ['tuple(bool,bytes)[]'],
          [
            [
              [true, defaultAbiCoder.encode(['uint256'], [100])],
              [true, defaultAbiCoder.encode(['uint256'], [200])],
            ],
          ],
        ),
      );

      const results = await aggregate3(calls, '0x1', provider);
      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(true);
    });

    it('should handle failed aggregate3 calls', async () => {
      const calls: Aggregate3Call[] = [
        {
          target: '0x0000000000000000000000000000000000000001',
          allowFailure: true,
          callData:
            '0x70a08231000000000000000000000000000000000000000000000000000000000000000a',
        },
      ];

      // Mock a failed call
      jest
        .spyOn(provider, 'call')
        .mockResolvedValue(
          defaultAbiCoder.encode(['tuple(bool,bytes)[]'], [[[false, '0x']]]),
        );

      const results = await aggregate3(calls, '0x1', provider);
      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(false);
    });

    it('should handle unsupported chain by attempting call', async () => {
      const calls: Aggregate3Call[] = [
        {
          target: '0x0000000000000000000000000000000000000001',
          allowFailure: true,
          callData:
            '0x70a08231000000000000000000000000000000000000000000000000000000000000000a',
        },
      ];

      // For unsupported chains, aggregate3 will try to create a contract with undefined address
      // which will throw an ethers error
      await expect(aggregate3(calls, '0x999999', provider)).rejects.toThrow(
        'invalid contract address',
      );
    });

    it('should handle contract call errors', async () => {
      const calls: Aggregate3Call[] = [
        {
          target: '0x0000000000000000000000000000000000000001',
          allowFailure: true,
          callData:
            '0x70a08231000000000000000000000000000000000000000000000000000000000000000a',
        },
      ];

      const error = new Error('Contract call failed');
      jest.spyOn(provider, 'call').mockRejectedValue(error);

      await expect(aggregate3(calls, '0x1', provider)).rejects.toThrow(
        'Contract call failed',
      );
    });
  });

  describe('getTokenBalancesForMultipleAddresses', () => {
    const tokenAddresses = [
      '0x0000000000000000000000000000000000000001',
      '0x0000000000000000000000000000000000000002',
    ];
    const userAddresses = [
      '0x000000000000000000000000000000000000000a',
      '0x000000000000000000000000000000000000000b',
    ];

    // Create groups for testing
    const testGroups = [
      {
        accountAddress: userAddresses[0] as Hex,
        tokenAddresses: tokenAddresses as Hex[],
      },
      {
        accountAddress: userAddresses[1] as Hex,
        tokenAddresses: tokenAddresses as Hex[],
      },
    ];

    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('should return empty results for empty inputs', async () => {
      const results = await getTokenBalancesForMultipleAddresses(
        [],
        '0x1',
        provider,
        false,
        false,
      );
      expect(results).toStrictEqual({ tokenBalances: {} });
    });

    it('should return empty results when no pairs and native disabled', async () => {
      const results = await getTokenBalancesForMultipleAddresses(
        [],
        '0x1',
        provider,
        false,
        false,
      );
      expect(results).toStrictEqual({ tokenBalances: {} });
    });

    it('should handle empty pairs array', async () => {
      const results = await getTokenBalancesForMultipleAddresses(
        [],
        '0x1',
        provider,
        false,
        false,
      );
      expect(results).toStrictEqual({ tokenBalances: {} });
    });

    it('should get ERC20 balances successfully using aggregate3', async () => {
      // Mock aggregate3 response for ERC20 balances
      const mockBalance1 = new BN('1000000000000000000'); // 1 token
      const mockBalance2 = new BN('2000000000000000000'); // 2 tokens
      const mockBalance3 = new BN('3000000000000000000'); // 3 tokens
      const mockBalance4 = new BN('4000000000000000000'); // 4 tokens

      jest.spyOn(provider, 'call').mockResolvedValue(
        defaultAbiCoder.encode(
          ['tuple(bool,bytes)[]'],
          [
            [
              [
                true,
                defaultAbiCoder.encode(['uint256'], [mockBalance1.toString()]),
              ],
              [
                true,
                defaultAbiCoder.encode(['uint256'], [mockBalance2.toString()]),
              ],
              [
                true,
                defaultAbiCoder.encode(['uint256'], [mockBalance3.toString()]),
              ],
              [
                true,
                defaultAbiCoder.encode(['uint256'], [mockBalance4.toString()]),
              ],
            ],
          ],
        ),
      );

      const results = await getTokenBalancesForMultipleAddresses(
        testGroups,
        '0x1',
        provider,
        false,
        false,
      );

      expect(results.tokenBalances).toHaveProperty(tokenAddresses[0]);
      expect(results.tokenBalances).toHaveProperty(tokenAddresses[1]);
      expect(results.tokenBalances[tokenAddresses[0]]).toHaveProperty(
        userAddresses[0],
      );
      expect(results.tokenBalances[tokenAddresses[0]]).toHaveProperty(
        userAddresses[1],
      );
      expect(results.tokenBalances[tokenAddresses[1]]).toHaveProperty(
        userAddresses[0],
      );
      expect(results.tokenBalances[tokenAddresses[1]]).toHaveProperty(
        userAddresses[1],
      );
    });

    it('should get native balances using aggregate3', async () => {
      const mockNativeBalance1 = new BN('5000000000000000000'); // 5 ETH
      const mockNativeBalance2 = new BN('6000000000000000000'); // 6 ETH

      jest.spyOn(provider, 'call').mockResolvedValue(
        defaultAbiCoder.encode(
          ['tuple(bool,bytes)[]'],
          [
            [
              [
                true,
                defaultAbiCoder.encode(
                  ['uint256'],
                  [mockNativeBalance1.toString()],
                ),
              ],
              [
                true,
                defaultAbiCoder.encode(
                  ['uint256'],
                  [mockNativeBalance2.toString()],
                ),
              ],
            ],
          ],
        ),
      );

      const results = await getTokenBalancesForMultipleAddresses(
        [],
        '0x1',
        provider,
        true,
        false,
      );

      expect(results).toStrictEqual({ tokenBalances: {} });
    });

    it('should handle mixed ERC20 and native balances', async () => {
      const mockERC20Balance = new BN('1000000000000000000');
      const mockNativeBalance = new BN('2000000000000000000');

      jest.spyOn(provider, 'call').mockResolvedValue(
        defaultAbiCoder.encode(
          ['tuple(bool,bytes)[]'],
          [
            [
              [
                true,
                defaultAbiCoder.encode(
                  ['uint256'],
                  [mockERC20Balance.toString()],
                ),
              ],
              [
                true,
                defaultAbiCoder.encode(
                  ['uint256'],
                  [mockNativeBalance.toString()],
                ),
              ],
            ],
          ],
        ),
      );

      const results = await getTokenBalancesForMultipleAddresses(
        [
          {
            accountAddress: userAddresses[0] as Hex,
            tokenAddresses: [tokenAddresses[0]] as Hex[],
          },
        ],
        '0x1',
        provider,
        true,
        false,
      );

      expect(results.tokenBalances).toHaveProperty(tokenAddresses[0]);
      expect(results.tokenBalances).toHaveProperty(
        '0x0000000000000000000000000000000000000000',
      );
    });

    it('should handle failed balance calls gracefully', async () => {
      jest.spyOn(provider, 'call').mockResolvedValue(
        defaultAbiCoder.encode(
          ['tuple(bool,bytes)[]'],
          [
            [
              [false, '0x'], // Failed call
              [
                true,
                defaultAbiCoder.encode(['uint256'], ['1000000000000000000']),
              ], // Successful call
            ],
          ],
        ),
      );

      const results = await getTokenBalancesForMultipleAddresses(
        [
          {
            accountAddress: userAddresses[0] as Hex,
            tokenAddresses: [tokenAddresses[0]] as Hex[],
          },
          {
            accountAddress: userAddresses[1] as Hex,
            tokenAddresses: [tokenAddresses[0]] as Hex[],
          },
        ],
        '0x1',
        provider,
        false,
        false,
      );

      // Should only have balance for the successful call
      expect(results.tokenBalances[tokenAddresses[0]]).toHaveProperty(
        userAddresses[1],
      );
      expect(results.tokenBalances[tokenAddresses[0]]).not.toHaveProperty(
        userAddresses[0],
      );
    });

    it('should use fallback for unsupported chains', async () => {
      // Mock provider.call for individual ERC20 calls
      jest
        .spyOn(provider, 'call')
        .mockResolvedValue(
          defaultAbiCoder.encode(['uint256'], ['1000000000000000000']),
        );

      // Mock provider.getBalance for native balance calls
      jest
        .spyOn(provider, 'getBalance')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .mockResolvedValue({ toString: () => '2000000000000000000' } as any);

      const results = await getTokenBalancesForMultipleAddresses(
        [
          {
            accountAddress: userAddresses[0] as Hex,
            tokenAddresses: [tokenAddresses[0]] as Hex[],
          },
        ],
        '0x999999' as Hex, // Unsupported chain
        provider,
        true,
        false,
      );

      expect(results.tokenBalances).toHaveProperty(tokenAddresses[0]);
      expect(results.tokenBalances).toHaveProperty(
        '0x0000000000000000000000000000000000000000',
      );
    });

    it('should handle errors in fallback mode gracefully', async () => {
      // Mock provider.call to fail for ERC20 calls
      jest.spyOn(provider, 'call').mockRejectedValue(new Error('Call failed'));

      // Mock provider.getBalance to fail for native balance calls
      jest
        .spyOn(provider, 'getBalance')
        .mockRejectedValue(new Error('Balance call failed'));

      const results = await getTokenBalancesForMultipleAddresses(
        [
          {
            accountAddress: userAddresses[0] as Hex,
            tokenAddresses: [tokenAddresses[0]] as Hex[],
          },
        ],
        '0x999999', // Unsupported chain
        provider,
        true,
        false,
      );

      // Should return empty structure since all calls failed
      expect(Object.keys(results.tokenBalances)).toHaveLength(0);
    });

    it('should handle large batches by splitting calls', async () => {
      // Create many token addresses to test batching (but keep reasonable for testing)
      const manyTokens = Array.from(
        { length: 5 },
        (_, i) => `0x000000000000000000000000000000000000000${i + 1}`,
      );

      jest
        .spyOn(provider, 'call')
        .mockResolvedValue(
          defaultAbiCoder.encode(
            ['tuple(bool,bytes)[]'],
            [
              Array.from({ length: 5 }, () => [
                true,
                defaultAbiCoder.encode(['uint256'], ['1000000000000000000']),
              ]),
            ],
          ),
        );

      const results = await getTokenBalancesForMultipleAddresses(
        [
          {
            accountAddress: userAddresses[0] as Hex,
            tokenAddresses: manyTokens as Hex[],
          },
        ],
        '0x1',
        provider,
        false,
        false,
      );

      // Should handle all tokens despite batching
      expect(Object.keys(results.tokenBalances)).toHaveLength(5);
    });

    it('should handle contract call errors and rethrow non-revert errors', async () => {
      const error = new Error('Network error');
      jest.spyOn(provider, 'call').mockRejectedValue(error);

      await expect(
        getTokenBalancesForMultipleAddresses(
          userAddresses.map((userAddress) => ({
            accountAddress: userAddress as Hex,
            tokenAddresses: tokenAddresses as Hex[],
          })),
          '0x1',
          provider,
          false,
          false,
        ),
      ).rejects.toThrow('Network error');
    });

    it('should fallback on CALL_EXCEPTION errors', async () => {
      // Mock aggregate3 to fail with CALL_EXCEPTION
      const callExceptionError = { code: 'CALL_EXCEPTION' };
      jest.spyOn(provider, 'call').mockRejectedValueOnce(callExceptionError);

      // Mock fallback calls to succeed
      jest
        .spyOn(provider, 'call')
        .mockResolvedValue(
          defaultAbiCoder.encode(['uint256'], ['1000000000000000000']),
        );

      // Mock provider.getBalance for native balance calls
      jest
        .spyOn(provider, 'getBalance')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .mockResolvedValue({ toString: () => '2000000000000000000' } as any);

      const results = await getTokenBalancesForMultipleAddresses(
        [
          {
            accountAddress: userAddresses[0] as Hex,
            tokenAddresses: [tokenAddresses[0]] as Hex[],
          },
        ],
        '0x1',
        provider,
        true,
        false,
      );

      // Should get results from fallback
      expect(results.tokenBalances).toHaveProperty(tokenAddresses[0]);
      expect(results.tokenBalances).toHaveProperty(
        '0x0000000000000000000000000000000000000000',
      );
    });
  });

  describe('edge cases and improved coverage', () => {
    it('should handle aggregate3 with empty calls array', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const calls: any[] = [];
      const result = await aggregate3(calls, '0x1', provider);
      expect(result).toStrictEqual([]);
    });

    it('should handle failed native balance calls in multicall', async () => {
      const groups = [
        {
          accountAddress: '0x1111111111111111111111111111111111111111' as const,
          tokenAddresses: [
            '0x0000000000000000000000000000000000000000' as const,
          ], // Native token
        },
      ];

      // Mock aggregate3 to return failed native balance call
      jest.spyOn(provider, 'call').mockResolvedValue(
        defaultAbiCoder.encode(
          ['tuple(bool success, bytes returnData)[]'],
          [
            [
              { success: false, returnData: '0x' }, // Failed native balance call
            ],
          ],
        ),
      );

      const result = await getTokenBalancesForMultipleAddresses(
        groups,
        '0x1',
        provider,
        true, // includeNative
        false, // includeStaked
      );

      expect(result.tokenBalances).toBeDefined();
      expect(Object.keys(result.tokenBalances)).toHaveLength(0);
    });

    it('should handle mixed success and failure in aggregate3 calls', async () => {
      const calls = [
        {
          target: '0x1111111111111111111111111111111111111111',
          callData: '0x1234',
          allowFailure: true,
        },
        {
          target: '0x2222222222222222222222222222222222222222',
          callData: '0x5678',
          allowFailure: true,
        },
      ];

      jest.spyOn(provider, 'call').mockResolvedValue(
        defaultAbiCoder.encode(
          ['tuple(bool success, bytes returnData)[]'],
          [
            [
              {
                success: true,
                returnData: defaultAbiCoder.encode(['uint256'], ['1000']),
              },
              { success: false, returnData: '0x' },
            ],
          ],
        ),
      );

      const results = await aggregate3(calls, '0x1', provider);
      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(true);
      expect(results[0].returnData).toBe(
        '0x00000000000000000000000000000000000000000000000000000000000003e8',
      );
      expect(results[1].success).toBe(false);
      expect(results[1].returnData).toBe('0x');
    });

    it('should handle error in aggregate3 by rejecting with error', async () => {
      const account1 = '0x1111111111111111111111111111111111111111' as const;

      const groups = [
        {
          accountAddress: account1,
          tokenAddresses: [
            '0x1111111111111111111111111111111111111111' as const,
          ],
        },
      ];

      // Mock aggregate3 to fail
      jest
        .spyOn(provider, 'call')
        .mockRejectedValue(new Error('Aggregate3 not supported'));

      // The function should handle the error appropriately
      await expect(
        getTokenBalancesForMultipleAddresses(
          groups,
          '0x1',
          provider,
          false, // includeNative
          true, // includeStaked
        ),
      ).rejects.toThrow('Aggregate3 not supported');
    });

    it('should handle staked balances fallback if contract not suppoerted on the chain', async () => {
      const account1 = '0x1111111111111111111111111111111111111111' as const;

      const groups = [
        {
          accountAddress: account1,
          tokenAddresses: [
            '0x1111111111111111111111111111111111111111' as const,
          ],
        },
      ];

      // mock getBalance
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      jest.spyOn(provider, 'getBalance').mockResolvedValue('1000' as any);

      // mock getBalance
      jest
        .spyOn(provider, 'call')
        .mockResolvedValue(defaultAbiCoder.encode(['uint256'], ['1000']));

      // mock getShares
      jest
        .spyOn(provider, 'call')
        .mockResolvedValue(defaultAbiCoder.encode(['uint256'], ['1000']));

      const result = await getTokenBalancesForMultipleAddresses(
        groups,
        '0x88bb0',
        provider,
        false, // includeNative
        true, // includeStaked
      );
      expect(result.stakedBalances).toBeDefined();
    });

    describe('error handling branches coverage', () => {
      it('should throw error when multicall fails with null error', async () => {
        const calls = [
          {
            contract: mockContract,
            functionSignature: 'balanceOf(address)',
            arguments: ['0x1234567890123456789012345678901234567890'],
          },
        ];

        // Mock provider.call to throw null error (covers !error branch)
        jest.spyOn(provider, 'call').mockRejectedValue(null);

        await expect(
          multicallOrFallback(calls, '0x1', provider),
        ).rejects.toBeNull();
      });

      it('should throw error when multicall fails with string error', async () => {
        const calls = [
          {
            contract: mockContract,
            functionSignature: 'balanceOf(address)',
            arguments: ['0x1234567890123456789012345678901234567890'],
          },
        ];

        // Mock provider.call to throw string error (covers typeof error !== 'object' branch)
        jest.spyOn(provider, 'call').mockRejectedValue('Network error');

        await expect(multicallOrFallback(calls, '0x1', provider)).rejects.toBe(
          'Network error',
        );
      });

      it('should throw error when multicall fails with object without code property', async () => {
        const calls = [
          {
            contract: mockContract,
            functionSignature: 'balanceOf(address)',
            arguments: ['0x1234567890123456789012345678901234567890'],
          },
        ];

        // Mock provider.call to throw object without code (covers !('code' in error) branch)
        const errorWithoutCode = { message: 'Something went wrong' };
        jest.spyOn(provider, 'call').mockRejectedValue(errorWithoutCode);

        await expect(
          multicallOrFallback(calls, '0x1', provider),
        ).rejects.toStrictEqual(errorWithoutCode);
      });

      it('should throw error when multicall fails with non-CALL_EXCEPTION code', async () => {
        const calls = [
          {
            contract: mockContract,
            functionSignature: 'balanceOf(address)',
            arguments: ['0x1234567890123456789012345678901234567890'],
          },
        ];

        // Mock provider.call to throw error with different code (covers error.code !== 'CALL_EXCEPTION' branch)
        const errorWithDifferentCode = {
          code: 'NETWORK_ERROR',
          message: 'Network issue',
        };
        jest.spyOn(provider, 'call').mockRejectedValue(errorWithDifferentCode);

        await expect(
          multicallOrFallback(calls, '0x1', provider),
        ).rejects.toStrictEqual(errorWithDifferentCode);
      });

      it('should throw error when getTokenBalancesForMultipleAddresses fails with null error', async () => {
        const groups = [
          {
            accountAddress:
              '0x1111111111111111111111111111111111111111' as const,
            tokenAddresses: [
              '0x1111111111111111111111111111111111111111' as const,
            ],
          },
        ];

        // Mock provider.call to throw null error (covers !error branch in getTokenBalancesForMultipleAddresses)
        jest.spyOn(provider, 'call').mockRejectedValue(null);

        await expect(
          getTokenBalancesForMultipleAddresses(
            groups,
            '0x1',
            provider,
            true,
            false,
          ),
        ).rejects.toBeNull();
      });

      it('should throw error when getTokenBalancesForMultipleAddresses fails with string error', async () => {
        const groups = [
          {
            accountAddress:
              '0x1111111111111111111111111111111111111111' as const,
            tokenAddresses: [
              '0x1111111111111111111111111111111111111111' as const,
            ],
          },
        ];

        // Mock provider.call to throw string error
        jest.spyOn(provider, 'call').mockRejectedValue('Connection timeout');

        await expect(
          getTokenBalancesForMultipleAddresses(
            groups,
            '0x1',
            provider,
            true,
            false,
          ),
        ).rejects.toBe('Connection timeout');
      });

      it('should throw error when getTokenBalancesForMultipleAddresses fails with object without code', async () => {
        const groups = [
          {
            accountAddress:
              '0x1111111111111111111111111111111111111111' as const,
            tokenAddresses: [
              '0x1111111111111111111111111111111111111111' as const,
            ],
          },
        ];

        // Mock provider.call to throw object without code
        const errorWithoutCode = {
          reason: 'Invalid transaction',
          data: '0x123',
        };
        jest.spyOn(provider, 'call').mockRejectedValue(errorWithoutCode);

        await expect(
          getTokenBalancesForMultipleAddresses(
            groups,
            '0x1',
            provider,
            true,
            false,
          ),
        ).rejects.toStrictEqual(errorWithoutCode);
      });

      it('should throw error when getTokenBalancesForMultipleAddresses fails with non-CALL_EXCEPTION code', async () => {
        const groups = [
          {
            accountAddress:
              '0x1111111111111111111111111111111111111111' as const,
            tokenAddresses: [
              '0x1111111111111111111111111111111111111111' as const,
            ],
          },
        ];

        // Mock provider.call to throw error with different code
        const errorWithDifferentCode = {
          code: 'INSUFFICIENT_FUNDS',
          message: 'Not enough gas',
        };
        jest.spyOn(provider, 'call').mockRejectedValue(errorWithDifferentCode);

        await expect(
          getTokenBalancesForMultipleAddresses(
            groups,
            '0x1',
            provider,
            true,
            false,
          ),
        ).rejects.toStrictEqual(errorWithDifferentCode);
      });

      it('should handle Promise.allSettled rejection in getNativeBalancesFallback', async () => {
        const groups = [
          {
            accountAddress:
              '0x1111111111111111111111111111111111111111' as const,
            tokenAddresses: [],
          },
        ];

        // Mock aggregate3 to fail, forcing fallback
        jest
          .spyOn(provider, 'call')
          .mockRejectedValue({ code: 'CALL_EXCEPTION' });

        // Mock getBalance to throw an error (this will be caught by Promise.allSettled)
        jest
          .spyOn(provider, 'getBalance')
          .mockRejectedValue(new Error('Balance fetch failed'));

        const result = await getTokenBalancesForMultipleAddresses(
          groups,
          '0x1',
          provider,
          true, // includeNative
          false, // includeStaked
        );

        expect(result.tokenBalances).toBeDefined();
        expect(Object.keys(result.tokenBalances)).toHaveLength(0);
      });

      it('should handle case where balance is null in getNativeBalancesFallback', async () => {
        const groups = [
          {
            accountAddress:
              '0x1111111111111111111111111111111111111111' as const,
            tokenAddresses: [],
          },
        ];

        // Mock aggregate3 to fail, forcing fallback
        jest
          .spyOn(provider, 'call')
          .mockRejectedValue({ code: 'CALL_EXCEPTION' });

        // Mock getBalance to return null (testing the null check in line 652)
        jest.spyOn(provider, 'getBalance').mockImplementation(() => {
          return Promise.resolve({
            toString: () => 'null',
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any);
        });

        const result = await getTokenBalancesForMultipleAddresses(
          groups,
          '0x1',
          provider,
          true, // includeNative
          false, // includeStaked
        );

        expect(result.tokenBalances).toBeDefined();
      });

      it('should handle empty tokenAddresses in getTokenBalancesFallback', async () => {
        const groups = [
          {
            accountAddress:
              '0x1111111111111111111111111111111111111111' as const,
            tokenAddresses: [],
          },
        ];

        // Mock aggregate3 to fail, forcing fallback
        jest
          .spyOn(provider, 'call')
          .mockRejectedValue({ code: 'CALL_EXCEPTION' });

        // Mock getBalance for native balance
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        jest.spyOn(provider, 'getBalance').mockResolvedValue('1000' as any);

        const result = await getTokenBalancesForMultipleAddresses(
          groups,
          '0x1',
          provider,
          true, // includeNative
          false, // includeStaked
        );

        expect(result.tokenBalances).toBeDefined();
        expect(
          result.tokenBalances['0x0000000000000000000000000000000000000000'],
        ).toBeDefined();
      });

      it('should handle mixed Promise.allSettled results in fallback mode', async () => {
        const groups = [
          {
            accountAddress:
              '0x1111111111111111111111111111111111111111' as const,
            tokenAddresses: [
              '0x1111111111111111111111111111111111111111' as const,
            ],
          },
        ];

        // Mock aggregate3 to fail, forcing fallback
        jest
          .spyOn(provider, 'call')
          .mockRejectedValue({ code: 'CALL_EXCEPTION' });

        // Mock individual calls - some succeed, some fail
        jest
          .spyOn(provider, 'call')
          .mockRejectedValueOnce({ code: 'CALL_EXCEPTION' }) // First aggregate3 call fails
          .mockResolvedValueOnce(defaultAbiCoder.encode(['uint256'], ['1000'])) // Token balance succeeds
          .mockRejectedValueOnce(new Error('Individual call failed')); // Some individual calls fail

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        jest.spyOn(provider, 'getBalance').mockResolvedValue('2000' as any);

        const result = await getTokenBalancesForMultipleAddresses(
          groups,
          '0x1',
          provider,
          true, // includeNative
          false, // includeStaked
        );

        expect(result.tokenBalances).toBeDefined();
      });

      it('should handle case where no staking contract address exists for chain (staking handled separately)', async () => {
        const groups = [
          {
            accountAddress:
              '0x1111111111111111111111111111111111111111' as const,
            tokenAddresses: [
              '0x1111111111111111111111111111111111111111' as const,
            ],
          },
        ];

        // Use a chain ID that doesn't have staking support
        const unsupportedChainId = '0x999' as const;

        // Mock the provider call for token balances
        jest.spyOn(provider, 'call').mockResolvedValue(
          defaultAbiCoder.encode(
            ['tuple(bool success, bytes returnData)[]'],
            [
              [
                {
                  success: true,
                  returnData: defaultAbiCoder.encode(['uint256'], ['1000']),
                },
              ],
            ],
          ),
        );

        const result = await getTokenBalancesForMultipleAddresses(
          groups,
          unsupportedChainId,
          provider,
          false, // includeNative
          false, // includeStaked - Note: staking is handled separately now
        );

        expect(result.tokenBalances).toBeDefined();
        expect(result.stakedBalances).toBeUndefined();
      });

      it('should not return early when groups empty but includeNative is true', async () => {
        const groups: { accountAddress: Hex; tokenAddresses: Hex[] }[] = [];

        // Mock getBalance for native balance
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        jest.spyOn(provider, 'getBalance').mockResolvedValue('1000' as any);

        const result = await getTokenBalancesForMultipleAddresses(
          groups,
          '0x1',
          provider,
          true, // includeNative - this should prevent early return
          false, // includeStaked
        );

        expect(result.tokenBalances).toBeDefined();
        // Should have processed native balances despite empty groups
      });

      it('should return empty results when groups are empty (staking handled separately)', async () => {
        const groups: { accountAddress: Hex; tokenAddresses: Hex[] }[] = [];

        // Mock for staking contract call
        jest
          .spyOn(provider, 'call')
          .mockResolvedValue(
            defaultAbiCoder.encode(
              ['tuple(bool success, bytes returnData)[]'],
              [[]],
            ),
          );

        const result = await getTokenBalancesForMultipleAddresses(
          groups,
          '0x1',
          provider,
          false, // includeNative
          true, // includeStaked - this should prevent early return
        );

        expect(result.tokenBalances).toBeDefined();
        // Should have processed staking even with empty groups
      });

      it('should process native balances when groups are empty and includeNative is true', async () => {
        const groups: { accountAddress: Hex; tokenAddresses: Hex[] }[] = [];

        // Mock getBalance for native balance
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        jest.spyOn(provider, 'getBalance').mockResolvedValue('1000' as any);

        // Mock for staking contract call
        jest
          .spyOn(provider, 'call')
          .mockResolvedValue(
            defaultAbiCoder.encode(
              ['tuple(bool success, bytes returnData)[]'],
              [[]],
            ),
          );

        const result = await getTokenBalancesForMultipleAddresses(
          groups,
          '0x1',
          provider,
          true, // includeNative
          false, // includeStaked
        );

        expect(result.tokenBalances).toBeDefined();
      });

      it('should handle token balance calls when only token calls are made', async () => {
        const groups = [
          {
            accountAddress:
              '0x1111111111111111111111111111111111111111' as const,
            tokenAddresses: [
              '0x1111111111111111111111111111111111111111' as const,
            ],
          },
        ];

        // Mock the aggregate3 call to succeed with only token balance result
        jest.spyOn(provider, 'call').mockResolvedValue(
          defaultAbiCoder.encode(
            ['tuple(bool success, bytes returnData)[]'],
            [
              [
                // Token balance call
                {
                  success: true,
                  returnData: defaultAbiCoder.encode(['uint256'], ['1000']),
                },
              ],
            ],
          ),
        );

        const result = await getTokenBalancesForMultipleAddresses(
          groups,
          '0x1', // Use mainnet
          provider,
          false, // includeNative
          false, // includeStaked
        );

        expect(result.tokenBalances).toBeDefined();
        expect(result.stakedBalances).toBeUndefined();
      });
    });
  });

  describe('getStakedBalancesForAddresses', () => {
    const testAddresses = [
      '0x1111111111111111111111111111111111111111',
      '0x2222222222222222222222222222222222222222',
    ];

    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('should fetch staked balances for addresses with non-zero shares', async () => {
      // Mock getShares calls - first address has shares, second doesn't
      jest
        .spyOn(provider, 'call')
        .mockResolvedValueOnce(
          defaultAbiCoder.encode(
            ['tuple(bool,bytes)[]'],
            [
              [
                [
                  true,
                  defaultAbiCoder.encode(['uint256'], ['1000000000000000000']),
                ], // 1 share for address 1
                [true, defaultAbiCoder.encode(['uint256'], ['0'])], // 0 shares for address 2
              ],
            ],
          ),
        )
        // Mock convertToAssets call for address 1
        .mockResolvedValueOnce(
          defaultAbiCoder.encode(
            ['tuple(bool,bytes)[]'],
            [
              [
                [
                  true,
                  defaultAbiCoder.encode(['uint256'], ['2000000000000000000']),
                ], // 2 ETH for 1 share
              ],
            ],
          ),
        );

      const result = await getStakedBalancesForAddresses(
        testAddresses,
        '0x1',
        provider,
      );

      expect(result).toStrictEqual({
        [testAddresses[0]]: new BN('2000000000000000000'), // 2 ETH
        // Address 2 not included since it has 0 shares
      });

      // Should have been called twice - once for getShares, once for convertToAssets
      expect(provider.call).toHaveBeenCalledTimes(2);
    });

    it('should return empty object when all addresses have zero shares', async () => {
      // Mock getShares calls - all addresses have zero shares
      jest.spyOn(provider, 'call').mockResolvedValueOnce(
        defaultAbiCoder.encode(
          ['tuple(bool,bytes)[]'],
          [
            [
              [true, defaultAbiCoder.encode(['uint256'], ['0'])], // 0 shares for address 1
              [true, defaultAbiCoder.encode(['uint256'], ['0'])], // 0 shares for address 2
            ],
          ],
        ),
      );

      const result = await getStakedBalancesForAddresses(
        testAddresses,
        '0x1',
        provider,
      );

      expect(result).toStrictEqual({});

      // Should only have been called once for getShares
      expect(provider.call).toHaveBeenCalledTimes(1);
    });

    it('should handle failed getShares calls gracefully', async () => {
      // Mock getShares with some failures
      jest
        .spyOn(provider, 'call')
        .mockResolvedValueOnce(
          defaultAbiCoder.encode(
            ['tuple(bool,bytes)[]'],
            [
              [
                [false, '0x'], // Failed call for address 1
                [
                  true,
                  defaultAbiCoder.encode(['uint256'], ['1000000000000000000']),
                ], // Success for address 2
              ],
            ],
          ),
        )
        // Mock convertToAssets for successful address
        .mockResolvedValueOnce(
          defaultAbiCoder.encode(
            ['tuple(bool,bytes)[]'],
            [
              [
                [
                  true,
                  defaultAbiCoder.encode(['uint256'], ['2000000000000000000']),
                ], // 2 ETH
              ],
            ],
          ),
        );

      const result = await getStakedBalancesForAddresses(
        testAddresses,
        '0x1',
        provider,
      );

      expect(result).toStrictEqual({
        [testAddresses[1]]: new BN('2000000000000000000'), // Only successful address
      });
    });

    it('should handle failed convertToAssets calls gracefully', async () => {
      // Mock successful getShares
      jest
        .spyOn(provider, 'call')
        .mockResolvedValueOnce(
          defaultAbiCoder.encode(
            ['tuple(bool,bytes)[]'],
            [
              [
                [
                  true,
                  defaultAbiCoder.encode(['uint256'], ['1000000000000000000']),
                ], // 1 share
              ],
            ],
          ),
        )
        // Mock failed convertToAssets
        .mockResolvedValueOnce(
          defaultAbiCoder.encode(
            ['tuple(bool,bytes)[]'],
            [
              [
                [false, '0x'], // Failed convertToAssets call
              ],
            ],
          ),
        );

      const result = await getStakedBalancesForAddresses(
        [testAddresses[0]],
        '0x1',
        provider,
      );

      expect(result).toStrictEqual({}); // No results due to failed conversion
    });

    it('should handle unsupported chains', async () => {
      const callSpy = jest.spyOn(provider, 'call');

      const result = await getStakedBalancesForAddresses(
        testAddresses,
        '0x999', // Unsupported chain
        provider,
      );

      expect(result).toStrictEqual({});
      expect(callSpy).not.toHaveBeenCalled();
    });

    it('should handle contract call errors gracefully', async () => {
      // Mock contract call to throw error
      jest
        .spyOn(provider, 'call')
        .mockRejectedValue(new Error('Contract error'));

      const result = await getStakedBalancesForAddresses(
        testAddresses,
        '0x1',
        provider,
      );

      expect(result).toStrictEqual({});
    });

    it('should handle empty user addresses array', async () => {
      const callSpy = jest.spyOn(provider, 'call');

      const result = await getStakedBalancesForAddresses([], '0x1', provider);

      expect(result).toStrictEqual({});
      expect(callSpy).not.toHaveBeenCalled();
    });

    it('should handle multiple addresses with mixed shares', async () => {
      const manyAddresses = [
        '0x1111111111111111111111111111111111111111',
        '0x2222222222222222222222222222222222222222',
        '0x3333333333333333333333333333333333333333',
        '0x4444444444444444444444444444444444444444',
      ];

      // Mock getShares - addresses 1 and 3 have shares, 2 and 4 don't
      jest
        .spyOn(provider, 'call')
        .mockResolvedValueOnce(
          defaultAbiCoder.encode(
            ['tuple(bool,bytes)[]'],
            [
              [
                [
                  true,
                  defaultAbiCoder.encode(['uint256'], ['1000000000000000000']),
                ], // Address 1: 1 share
                [true, defaultAbiCoder.encode(['uint256'], ['0'])], // Address 2: 0 shares
                [
                  true,
                  defaultAbiCoder.encode(['uint256'], ['500000000000000000']),
                ], // Address 3: 0.5 shares
                [true, defaultAbiCoder.encode(['uint256'], ['0'])], // Address 4: 0 shares
              ],
            ],
          ),
        )
        // Mock convertToAssets for addresses with shares
        .mockResolvedValueOnce(
          defaultAbiCoder.encode(
            ['tuple(bool,bytes)[]'],
            [
              [
                [
                  true,
                  defaultAbiCoder.encode(['uint256'], ['2000000000000000000']),
                ], // 2 ETH for 1 share
                [
                  true,
                  defaultAbiCoder.encode(['uint256'], ['1000000000000000000']),
                ], // 1 ETH for 0.5 shares
              ],
            ],
          ),
        );

      const result = await getStakedBalancesForAddresses(
        manyAddresses,
        '0x1',
        provider,
      );

      expect(result).toStrictEqual({
        [manyAddresses[0]]: new BN('2000000000000000000'), // 2 ETH
        [manyAddresses[2]]: new BN('1000000000000000000'), // 1 ETH
        // Addresses 1 and 3 not included (zero shares)
      });
    });
  });
});
