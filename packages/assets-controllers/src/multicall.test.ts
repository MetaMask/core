import { defaultAbiCoder } from '@ethersproject/abi';
import { Contract } from '@ethersproject/contracts';
import { Web3Provider } from '@ethersproject/providers';
import { abiERC20 } from '@metamask/metamask-eth-abis';

import { multicallOrFallback } from './multicall';

const provider = new Web3Provider(jest.fn());

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
});
