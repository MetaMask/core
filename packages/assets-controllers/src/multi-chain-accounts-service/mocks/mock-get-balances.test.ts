import {
  MOCK_GET_BALANCES_RESPONSE,
  createMockGetBalancesResponse,
} from './mock-get-balances';

describe('mock-get-balances', () => {
  describe('MOCK_GET_BALANCES_RESPONSE', () => {
    it('should have the correct count', () => {
      expect(MOCK_GET_BALANCES_RESPONSE.count).toBe(6);
    });

    it('should have balances array with correct length', () => {
      expect(MOCK_GET_BALANCES_RESPONSE.balances).toHaveLength(8);
    });

    it('should have empty unprocessedNetworks', () => {
      expect(MOCK_GET_BALANCES_RESPONSE.unprocessedNetworks).toStrictEqual([]);
    });

    it('should have native ETH token as first balance', () => {
      expect(MOCK_GET_BALANCES_RESPONSE.balances[0]).toStrictEqual({
        object: 'token',
        address: '0x0000000000000000000000000000000000000000',
        symbol: 'ETH',
        name: 'Ether',
        type: 'native',
        timestamp: '2015-07-30T03:26:13.000Z',
        decimals: 18,
        chainId: 1,
        balance: '0.026380882267770930',
      });
    });
  });

  describe('createMockGetBalancesResponse', () => {
    it('should create a response with correct count', () => {
      const tokenAddrs = ['0xtoken1', '0xtoken2', '0xtoken3'];
      const chainId = 1;

      const response = createMockGetBalancesResponse(tokenAddrs, chainId);

      expect(response.count).toBe(3);
    });

    it('should create balances for each token address', () => {
      const tokenAddrs = ['0xtoken1', '0xtoken2'];
      const chainId = 137;

      const response = createMockGetBalancesResponse(tokenAddrs, chainId);

      expect(response.balances).toHaveLength(2);
      expect(response.balances[0].address).toBe('0xtoken1');
      expect(response.balances[1].address).toBe('0xtoken2');
    });

    it('should set correct chainId for all balances', () => {
      const tokenAddrs = ['0xtoken1'];
      const chainId = 42161;

      const response = createMockGetBalancesResponse(tokenAddrs, chainId);

      expect(response.balances[0].chainId).toBe(42161);
    });

    it('should set default mock values for balance properties', () => {
      const tokenAddrs = ['0xtoken1'];
      const chainId = 1;

      const response = createMockGetBalancesResponse(tokenAddrs, chainId);

      expect(response.balances[0]).toStrictEqual({
        object: 'token',
        address: '0xtoken1',
        name: 'Mock Token',
        symbol: 'MOCK',
        decimals: 18,
        balance: '10.18',
        chainId: 1,
      });
    });

    it('should have empty unprocessedNetworks', () => {
      const response = createMockGetBalancesResponse(['0xtoken'], 1);

      expect(response.unprocessedNetworks).toStrictEqual([]);
    });

    it('should handle empty token addresses array', () => {
      const response = createMockGetBalancesResponse([], 1);

      expect(response.count).toBe(0);
      expect(response.balances).toHaveLength(0);
    });
  });
});

