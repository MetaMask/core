import type { GetBalancesResponse } from '../types';

export const MOCK_GET_BALANCES_RESPONSE: GetBalancesResponse = {
  count: 6,
  balances: [
    {
      object: 'token',
      address: '0x0000000000000000000000000000000000000000',
      symbol: 'ETH',
      name: 'Ether',
      type: 'native',
      timestamp: '2015-07-30T03:26:13.000Z',
      decimals: 18,
      chainId: 1,
      balance: '0.026380882267770930',
    },
    {
      object: 'token',
      address: '0x4200000000000000000000000000000000000042',
      name: 'Optimism',
      symbol: 'OP',
      decimals: 18,
      balance: '5.250000000000000000',
      chainId: 10,
    },
    {
      object: 'token',
      address: '0x2791bca1f2de4661ed88a30c99a7a9449aa84174',
      name: 'USD Coin (PoS)',
      symbol: 'USDC',
      decimals: 6,
      balance: '22.484688',
      chainId: 137,
    },
    {
      object: 'token',
      address: '0x0000000000000000000000000000000000000000',
      symbol: 'MATIC',
      name: 'MATIC',
      type: 'native',
      timestamp: '2020-05-30T07:47:16.000Z',
      decimals: 18,
      chainId: 137,
      balance: '2.873547261071381088',
    },
    {
      object: 'token',
      address: '0x912ce59144191c1204e64559fe8253a0e49e6548',
      name: 'Arbitrum',
      symbol: 'ARB',
      decimals: 18,
      balance: '14.640000000000000000',
      chainId: 42161,
    },
    {
      object: 'token',
      address: '0xd83af4fbd77f3ab65c3b1dc4b38d7e67aecf599a',
      name: 'Linea Voyage XP',
      symbol: 'LXP',
      decimals: 18,
      balance: '100.000000000000000000',
      chainId: 59144,
    },
  ],
  unprocessedNetworks: [],
};

export const createMockGetBalancesResponse = (
  tokenAddrs: string[],
  chainId: number,
): GetBalancesResponse => ({
  count: tokenAddrs.length,
  balances: tokenAddrs.map((a) => ({
    object: 'token',
    address: a,
    name: 'Mock Token',
    symbol: 'MOCK',
    decimals: 18,
    balance: '10.18',
    chainId,
  })),
  unprocessedNetworks: [],
});
