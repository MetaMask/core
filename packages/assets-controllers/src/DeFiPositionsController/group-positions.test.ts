import { Hex } from '@metamask/utils';
import { GroupedPositions, groupPositions } from './group-positions';
import {
  MOCK_DEFI_RESPONSE_BORROW,
  MOCK_DEFI_RESPONSE_COMPLEX,
  MOCK_DEFI_RESPONSE_FAILED_ENTRY,
  MOCK_DEFI_RESPONSE_MULTI_CHAIN,
  MOCK_DEFI_RESPONSE_NO_PRICES,
} from './mocks/mock-responses';

describe('groupPositions', () => {
  it('groups multiple chains', () => {
    const result = groupPositions(MOCK_DEFI_RESPONSE_MULTI_CHAIN);

    expect(Object.keys(result).length).toEqual(2);
    expect(Object.keys(result)[0]).toEqual('0x1');
    expect(Object.keys(result)[1]).toEqual('0xe708');
  });

  it('does not display failed entries', () => {
    const result = groupPositions(MOCK_DEFI_RESPONSE_FAILED_ENTRY);

    const protocolResults = result['0x1'].protocols['aave-v3'];
    expect(protocolResults.positionTypes.supply).toBeDefined();
    expect(protocolResults.positionTypes.borrow).toBeUndefined();
  });

  it('handles results with no prices and displays them', () => {
    const result = groupPositions(MOCK_DEFI_RESPONSE_NO_PRICES);

    const supplyResults =
      result['0x1'].protocols['aave-v3'].positionTypes.supply!;
    expect(Object.values(supplyResults.positions).length).toEqual(2);
    expect(supplyResults.aggregatedMarketValue).toEqual(40);
  });

  it('substracts borrow positions from total market value', () => {
    const result = groupPositions(MOCK_DEFI_RESPONSE_BORROW);

    const protocolResults = result['0x1'].protocols['aave-v3'];
    expect(protocolResults.positionTypes.supply!.aggregatedMarketValue).toEqual(
      1540,
    );
    expect(protocolResults.positionTypes.borrow!.aggregatedMarketValue).toEqual(
      -1000,
    );
    expect(protocolResults.aggregatedMarketValue).toEqual(540);
  });

  it('verifies that the resulting object is valid', () => {
    const result = groupPositions(MOCK_DEFI_RESPONSE_COMPLEX);

    const expectedResult: {
      [key: Hex]: GroupedPositions;
    } = {
      '0x1': {
        aggregatedMarketValue: 540,
        protocols: {
          'aave-v3': {
            protocolDetails: {
              name: 'AaveV3',
              iconUrl: 'https://cryptologos.cc/logos/aave-aave-logo.png',
            },
            aggregatedMarketValue: 540,
            positionTypes: {
              supply: {
                aggregatedMarketValue: 1540,
                positions: [
                  {
                    address: '0x4d5F47FA6A74757f35C14fD3a6Ef8E3C9BC514E8',
                    name: 'Aave Ethereum WETH',
                    symbol: 'aEthWETH',
                    decimals: 18,
                    balanceRaw: '40000000000000000',
                    balance: 0.04,
                    marketValue: 40,
                    type: 'protocol',
                    tokens: [
                      {
                        address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
                        name: 'Wrapped Ether',
                        symbol: 'WETH',
                        decimals: 18,
                        type: 'underlying',
                        balanceRaw: '40000000000000000',
                        balance: 0.04,
                        price: 1000,
                        iconUrl:
                          'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2/logo.png',
                      },
                    ],
                  },
                  {
                    address: '0x5Ee5bf7ae06D1Be5997A1A72006FE6C607eC6DE8',
                    name: 'Aave Ethereum WBTC',
                    symbol: 'aEthWBTC',
                    decimals: 8,
                    balanceRaw: '300000000',
                    balance: 3,
                    marketValue: 1500,
                    type: 'protocol',
                    tokens: [
                      {
                        address: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
                        name: 'Wrapped BTC',
                        symbol: 'WBTC',
                        decimals: 8,
                        type: 'underlying',
                        balanceRaw: '300000000',
                        balance: 3,
                        price: 500,
                        iconUrl:
                          'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599/logo.png',
                      },
                    ],
                  },
                ],
              },
              borrow: {
                aggregatedMarketValue: -1000,
                positions: [
                  {
                    address: '0x6df1C1E379bC5a00a7b4C6e67A203333772f45A8',
                    name: 'Aave Ethereum Variable Debt USDT',
                    symbol: 'variableDebtEthUSDT',
                    decimals: 6,
                    balanceRaw: '1000000000',
                    marketValue: -1000,
                    type: 'protocol',
                    tokens: [
                      {
                        address: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
                        name: 'Tether USD',
                        symbol: 'USDT',
                        decimals: 6,
                        type: 'underlying',
                        balanceRaw: '1000000000',
                        balance: 1000,
                        price: 1,
                        iconUrl:
                          'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xdAC17F958D2ee523a2206206994597C13D831ec7/logo.png',
                      },
                    ],
                    balance: 1000,
                  },
                ],
              },
            },
          },
        },
      },
      '0xe708': {
        aggregatedMarketValue: 1345,
        protocols: {
          'uniswap-v3': {
            protocolDetails: {
              name: 'UniswapV3',
              iconUrl:
                'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984/logo.png',
            },
            aggregatedMarketValue: 1345,
            positionTypes: {
              supply: {
                aggregatedMarketValue: 1345,
                positions: [
                  {
                    address: '0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1',
                    tokenId: '123456',
                    name: 'USDC / AERO - 0.05%',
                    symbol: 'USDC / AERO - 0.05%',
                    decimals: 18,
                    balanceRaw: '5000000000000000',
                    balance: 0.005,
                    marketValue: 1345,
                    type: 'protocol',
                    tokens: [
                      {
                        address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
                        name: 'USD Coin',
                        symbol: 'USDC',
                        decimals: 6,
                        balanceRaw: '300000000',
                        type: 'underlying',
                        balance: 300,
                        price: 1,
                        iconUrl:
                          'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/base/assets/0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913/logo.png',
                      },
                      {
                        address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
                        name: 'USD Coin',
                        symbol: 'USDC',
                        decimals: 6,
                        balanceRaw: '20000000',
                        type: 'underlying-claimable',
                        balance: 20,
                        price: 1,
                        iconUrl:
                          'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/base/assets/0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913/logo.png',
                      },
                      {
                        address: '0x940181a94A35A4569E4529A3CDfB74e38FD98631',
                        name: 'Aerodrome',
                        symbol: 'AERO',
                        decimals: 18,
                        balanceRaw: '2000000000000000000000',
                        type: 'underlying',
                        balance: 2000,
                        price: 0.5,
                        iconUrl:
                          'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/base/assets/0x940181a94A35A4569E4529A3CDfB74e38FD98631/logo.png',
                      },
                      {
                        address: '0x940181a94A35A4569E4529A3CDfB74e38FD98631',
                        name: 'Aerodrome',
                        symbol: 'AERO',
                        decimals: 18,
                        balanceRaw: '50000000000000000000',
                        type: 'underlying-claimable',
                        balance: 50,
                        price: 0.5,
                        iconUrl:
                          'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/base/assets/0x940181a94A35A4569E4529A3CDfB74e38FD98631/logo.png',
                      },
                    ],
                  },
                ],
              },
            },
          },
        },
      },
    };

    expect(result).toEqual(expectedResult);
  });
});
