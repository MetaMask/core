import { validateBridgeStatusResponse } from './validators';

const BridgeTxStatusResponses = {
  STATUS_PENDING_VALID: {
    status: 'PENDING',
    bridge: 'across',
    srcChain: {
      chainId: 42161,
      txHash:
        '0x76a65e4cea35d8732f0e3250faed00ba764ad5a0e7c51cb1bafbc9d76ac0b325',
      amount: '991250000000000',
      token: {
        address: '0x0000000000000000000000000000000000000000',
        assetId:
          'eip155:42161/erc20:0x82af49447d8a07e3bd95bd0d56f35241523fbab1',
        chainId: 42161,
        symbol: 'ETH',
        decimals: 18,
        name: 'ETH',
        coinKey: 'ETH',
        logoURI:
          'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2/logo.png',
        priceUSD: '2550.12',
        icon: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2/logo.png',
      },
    },
    destChain: {
      chainId: 10,
      token: {},
    },
  },
  STATUS_PENDING_VALID_MISSING_FIELDS: {
    status: 'PENDING',
    srcChain: {
      chainId: 42161,
      txHash:
        '0x5cbda572c686a5a57fe62735325e408f9164f77a4787df29ce13edef765adaa9',
    },
  },
  STATUS_PENDING_VALID_MISSING_FIELDS_2: {
    status: 'PENDING',
    bridge: 'hop',
    srcChain: {
      chainId: 42161,
      txHash:
        '0x5cbda572c686a5a57fe62735325e408f9164f77a4787df29ce13edef765adaa9',
      amount: '991250000000000',
      token: {
        chainId: 42161,
        assetId:
          'eip155:42161/erc20:0x82af49447d8a07e3bd95bd0d56f35241523fbab1',
        address: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
        symbol: 'ETH',
        name: 'Ethereum',
        decimals: 18,
        icon: 'https://media.socket.tech/tokens/all/ETH',
        logoURI: 'https://media.socket.tech/tokens/all/ETH',
        chainAgnosticId: null,
      },
    },
  },
  STATUS_PENDING_INVALID_MISSING_FIELDS: {
    status: 'PENDING',
    bridge: 'across',
    srcChain: {
      chainId: 42161,
      txHash:
        '0x76a65e4cea35d8732f0e3250faed00ba764ad5a0e7c51cb1bafbc9d76ac0b325',
      amount: '991250000000000',
      token: {
        address: '0x0000000000000000000000000000000000000000',
        assetId:
          'eip155:42161/erc20:0x82af49447d8a07e3bd95bd0d56f35241523fbab1',
        chainId: 42161,
        symbol: 'ETH',
        decimals: 18,
        name: 'ETH',
        coinKey: 'ETH',
        logoURI:
          'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2/logo.png',
        priceUSD: '2550.12',
        icon: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2/logo.png',
      },
    },
    destChain: {
      token: {},
    },
  },
  STATUS_COMPLETE_VALID: {
    status: 'COMPLETE',
    isExpectedToken: true,
    bridge: 'across',
    srcChain: {
      chainId: 10,
      txHash:
        '0x9fdc426692aba1f81e145834602ed59ed331054e5b91a09a673cb12d4b4f6a33',
      amount: '4956250000000000',
      token: {
        address: '0x0000000000000000000000000000000000000000',
        assetId: 'eip155:10/erc20:0x4200000000000000000000000000000000000006',
        chainId: 10,
        symbol: 'ETH',
        decimals: 18,
        name: 'ETH',
        coinKey: 'ETH',
        logoURI:
          'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2/logo.png',
        priceUSD: '2649.21',
        icon: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2/logo.png',
      },
    },
    destChain: {
      chainId: 42161,
      txHash:
        '0x3a494e672717f9b1f2b64a48a19985842d82d0747400fccebebc7a4e99c8eaab',
      amount: '4926701727965948',
      token: {
        address: '0x0000000000000000000000000000000000000000',
        assetId: 'eip155:8453/erc20:0x4200000000000000000000000000000000000006',
        chainId: 42161,
        symbol: 'ETH',
        decimals: 18,
        name: 'ETH',
        coinKey: 'ETH',
        logoURI:
          'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2/logo.png',
        priceUSD: '2648.72',
        icon: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2/logo.png',
      },
    },
  },
  STATUS_COMPLETE_VALID_MISSING_FIELDS: {
    status: 'COMPLETE',
    bridge: 'across',
    srcChain: {
      chainId: 10,
      txHash:
        '0x9fdc426692aba1f81e145834602ed59ed331054e5b91a09a673cb12d4b4f6a33',
      amount: '4956250000000000',
      token: {
        address: '0x0000000000000000000000000000000000000000',
        assetId: 'eip155:10/erc20:0x4200000000000000000000000000000000000006',
        chainId: 10,
        symbol: 'ETH',
        decimals: 18,
        name: 'ETH',
        coinKey: 'ETH',
        logoURI:
          'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2/logo.png',
        priceUSD: '2649.21',
        icon: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2/logo.png',
      },
    },
    destChain: {
      chainId: 42161,
      txHash:
        '0x3a494e672717f9b1f2b64a48a19985842d82d0747400fccebebc7a4e99c8eaab',
      amount: '4926701727965948',
      token: {
        assetId: 'eip155:8453/erc20:0x4200000000000000000000000000000000000006',
        address: '0x0000000000000000000000000000000000000000',
        chainId: 42161,
        symbol: 'ETH',
        decimals: 18,
        name: 'ETH',
        coinKey: 'ETH',
        logoURI:
          'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2/logo.png',
        priceUSD: '2648.72',
        icon: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2/logo.png',
      },
    },
  },
  STATUS_COMPLETE_VALID_MISSING_FIELDS_2: {
    status: 'COMPLETE',
    isExpectedToken: false,
    bridge: 'across',
    srcChain: {
      chainId: 10,
      txHash:
        '0x4c57876fad21fb5149af5a58a4aba2ca9d6b212014505dd733b75667ca4f0f2b',
      amount: '991250000000000',
      token: {
        chainId: 10,
        assetId: 'eip155:10/erc20:0x4200000000000000000000000000000000000006',
        address: '0x4200000000000000000000000000000000000006',
        symbol: 'WETH',
        name: 'Wrapped Ether',
        decimals: 18,
        icon: 'https://media.socket.tech/tokens/all/WETH',
        // logoURI: 'https://media.socket.tech/tokens/all/WETH',
        // chainAgnosticId: 'ETH',
      },
    },
    destChain: {
      chainId: 8453,
      txHash:
        '0x60c4cad7c3eb14c7b3ace40cd4015b90927dadacbdc8673f404bea6a5603844b',
      amount: '988339336750062',
      token: {
        chainId: 8453,
        assetId: 'eip155:8453/erc20:0x4200000000000000000000000000000000000006',
        address: '0x4200000000000000000000000000000000000006',
        symbol: 'WETH',
        name: 'Wrapped Ether',
        decimals: 18,
        icon: null,
        // logoURI: null,
        // chainAgnosticId: null,
      },
    },
  },
  STATUS_COMPLETE_INVALID_MISSING_FIELDS: {
    status: 'COMPLETE',
    isExpectedToken: true,
    bridge: 'across',
  },
  STATUS_FAILED_VALID: {
    status: 'FAILED',
    bridge: 'across',
    srcChain: {
      chainId: 42161,
      txHash:
        '0x4c57876fad21fb5149af5a58a4aba2ca9d6b212014505dd733b75667ca4f0f2b',
      token: {},
    },
  },
  STATUS_SQUID_VALID: {
    status: 'COMPLETE',
    isExpectedToken: true,
    bridge: 'axelar',
    srcChain: {
      chainId: 10,
      txHash:
        '0x9fdc426692aba1f81e145834602ed59ed331054e5b91a09a673cb12d4b4f6a33',
    },
    destChain: {
      chainId: 42161,
      txHash:
        '0x3a494e672717f9b1f2b64a48a19985842d82d0747400fccebebc7a4e99c8eaab',
    },
  },
};

describe('validators', () => {
  describe('bridgeStatusValidator', () => {
    it.each([
      {
        input: BridgeTxStatusResponses.STATUS_PENDING_VALID,
        description: 'valid pending bridge status',
      },
      {
        input: BridgeTxStatusResponses.STATUS_PENDING_VALID_MISSING_FIELDS,
        description: 'valid pending bridge status missing fields',
      },
      {
        input: BridgeTxStatusResponses.STATUS_PENDING_VALID_MISSING_FIELDS_2,
        description: 'valid pending bridge status missing fields 2',
      },
      {
        input: BridgeTxStatusResponses.STATUS_COMPLETE_VALID,
        description: 'valid complete bridge status',
      },
      {
        input: BridgeTxStatusResponses.STATUS_COMPLETE_VALID_MISSING_FIELDS_2,
        description: 'complete bridge status with missing fields 2',
      },
      {
        input: BridgeTxStatusResponses.STATUS_COMPLETE_VALID_MISSING_FIELDS,
        description: 'complete bridge status with missing fields',
      },
      {
        input: BridgeTxStatusResponses.STATUS_FAILED_VALID,
        description: 'valid failed bridge status',
      },
      {
        input: BridgeTxStatusResponses.STATUS_SQUID_VALID,
        description: 'valid squid bridge status',
      },
      {
        input: {
          status: 'COMPLETE',
          srcChain: {
            chainId: 1151111081099710,
            txHash:
              '33LfknAQsrLC1WzmNybkZWUtuGANRFHNupsQ1YLCnjXGXxbBE93BbVTeKLLdE7Sz3WUdxnFW5HQhPuUayrXyqWky',
          },
        },
        description: 'placeholder complete swap status',
      },
    ])(
      'should not throw for valid response for $description',
      ({ input }: { input: unknown }) => {
        expect(() => validateBridgeStatusResponse(input)).not.toThrow();
      },
    );

    it.each([
      {
        input: BridgeTxStatusResponses.STATUS_PENDING_INVALID_MISSING_FIELDS,
        description: 'pending bridge status with missing fields',
      },
      {
        input: BridgeTxStatusResponses.STATUS_COMPLETE_INVALID_MISSING_FIELDS,
        description: 'complete bridge status with missing fields',
      },
      {
        input: undefined,
        description: 'undefined',
      },
      {
        input: null,
        description: 'null',
      },
      {
        description: 'empty object',
        input: {},
      },
    ])(
      'should throw for invalid response for $description',
      ({ input }: { input: unknown }) => {
        const mockConsoleError = jest
          .spyOn(console, 'error')
          .mockImplementation((_message: string) => jest.fn());

        // eslint-disable-next-line jest/require-to-throw-message
        expect(() => validateBridgeStatusResponse(input)).toThrow();
        // eslint-disable-next-line jest/no-restricted-matchers
        expect(mockConsoleError.mock.calls).toMatchSnapshot();
      },
    );
  });
});
