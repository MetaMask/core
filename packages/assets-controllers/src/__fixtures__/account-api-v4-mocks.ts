import type { Hex } from '@metamask/utils';
import nock from 'nock';

export const mockResponse_accountsAPI_MultichainAccountBalances = (
  accountAddress: Hex,
) => ({
  count: 8,
  balances: [
    {
      object: 'token',
      address: '0x0000000000000000000000000000000000000000',
      symbol: 'MATIC',
      name: 'MATIC',
      type: 'native',
      decimals: 18,
      chainId: 137,
      balance: '168.699548832017288710',
      accountAddress: `eip155:137:${accountAddress}`,
    },
    {
      object: 'token',
      address: '0x2791bca1f2de4661ed88a30c99a7a9449aa84174',
      name: 'USD Coin (PoS)',
      symbol: 'USDC',
      decimals: 6,
      balance: '8.174688',
      chainId: 137,
      accountAddress: `eip155:137:${accountAddress}`,
    },
    {
      object: 'token',
      address: '0x53e0bca35ec356bd5dddfebbd1fc0fd03fabad39',
      name: 'ChainLink Token',
      symbol: 'LINK',
      decimals: 18,
      balance: '0.000734044925209136',
      chainId: 137,
      accountAddress: `eip155:137:${accountAddress}`,
    },
    {
      object: 'token',
      address: '0x6d80113e533a2c0fe82eabd35f1875dcea89ea97',
      name: 'Aave Polygon WMATIC',
      symbol: 'aPolWMATIC',
      decimals: 18,
      balance: '1.001966754893761781',
      chainId: 137,
      accountAddress: `eip155:137:${accountAddress}`,
    },
  ],
  unprocessedNetworks: [],
});

export const mockAPI_accountsAPI_MultichainAccountBalances = (
  accountAddress: Hex,
) =>
  nock('https://accounts.api.cx.metamask.io/v4/multiaccount/balances')
    .get('')
    .query({
      accountAddresses: `eip155:137:${accountAddress}`,
    })
    .reply(
      200,
      mockResponse_accountsAPI_MultichainAccountBalances(accountAddress),
    );
