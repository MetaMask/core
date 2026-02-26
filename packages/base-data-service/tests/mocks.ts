import nock from 'nock';

type MockReply = {
  status: nock.StatusCode;
  body?: nock.Body;
};

export function mockAssets(mockReply?: MockReply): nock.Scope {
  const reply = mockReply ?? {
    status: 200,
    body: [
      {
        assetId: 'eip155:1/erc20:0x6b175474e89094c44da98b954eedeac495271d0f',
        decimals: 18,
        name: 'Dai Stablecoin',
        symbol: 'DAI',
      },
      {
        assetId: 'bip122:000000000019d6689c085ae165831e93/slip44:0',
        decimals: 8,
        name: 'Bitcoin',
        symbol: 'BTC',
      },
      {
        assetId: 'eip155:1/slip44:60',
        decimals: 18,
        name: 'Ethereum',
        symbol: 'ETH',
      },
    ],
  };

  return nock('https://tokens.api.cx.metamask.io:443', {
    encodedQueryParams: true,
  })
    .get('/v3/assets')
    .query({
      assetIds:
        'eip155%3A1%2Fslip44%3A60%2Cbip122%3A000000000019d6689c085ae165831e93%2Fslip44%3A0%2Ceip155%3A1%2Ferc20%3A0x6b175474e89094c44da98b954eedeac495271d0f',
    })
    .reply(reply.status, reply.body);
}

export function mockTransactionsPage1(mockReply?: MockReply): nock.Scope {
  const reply = mockReply ?? {
    status: 200,
    body: {
      data: [
        {
          hash: '0xb398bcc8a9287ca18b5a7c4d6f52eaf4ae599d5ac85b860143f5293ed57724fb',
          timestamp: '2026-02-07T22:44:17.000Z',
          chainId: 8453,
          accountId: 'eip155:8453:0x4bbeeb066ed09b7aed07bf39eee0460dfa261520',
          blockNumber: 41857455,
          blockHash:
            '0x6700e8704b880e83081f3dadcf745eb5bb95ffd1c6557ecdd5dc78d0eb310e52',
          gas: 20037644,
          gasUsed: 19878709,
          gasPrice: '3289893',
          effectiveGasPrice: '3289893',
          nonce: 800,
          cumulativeGasUsed: 55796136,
          methodId: '0x9ec68f0f',
          value: '0',
          to: '0x671fdde61d38f00dffb4f8ce8701d0aabb4b405d',
          from: '0x6d052d8e0c666ed8011b966d94f240713cf08ea1',
          isError: false,
          valueTransfers: [
            {
              from: '0x671fdde61d38f00dffb4f8ce8701d0aabb4b405d',
              to: '0x4bbeeb066ed09b7aed07bf39eee0460dfa261520',
              amount: '100000000000000000000',
              decimal: 18,
              contractAddress: '0x491b67a94ec0a59b81b784f4719d0387c4510c36',
              symbol: 'PF',
              name: 'Purple Frog',
              transferType: 'erc20',
            },
          ],
        },
        {
          hash: '0x8e773bc374095ef6410b40b3c95e898077a30c70a9b74297738c60deb888dc34',
          timestamp: '2026-02-02T02:25:59.000Z',
          chainId: 1,
          accountId: 'eip155:1:0x4bbeeb066ed09b7aed07bf39eee0460dfa261520',
          blockNumber: 24366180,
          blockHash:
            '0x3e057041ce87230e33a95d9dc7b9018bd86d2982c00a9a4d43d2f8ae6e9c5bac',
          gas: 16000000,
          gasUsed: 13402794,
          gasPrice: '93000000',
          effectiveGasPrice: '93000000',
          nonce: 94,
          cumulativeGasUsed: 42756417,
          methodId: '0x60806040',
          value: '0',
          to: '0x0000000000000000000000000000000000000000',
          from: '0x07838cbd1a74c6ad20cab35cb464bb36c1c761e3',
          isError: false,
          valueTransfers: [
            {
              from: '0x340eb3a94d7e6802742d0a82c1afe852629f7b08',
              to: '0x4bbeeb066ed09b7aed07bf39eee0460dfa261520',
              amount: '10000000000000000',
              decimal: 18,
              contractAddress: '0x94f31ac896c9823d81cf9c2c93feceed4923218f',
              symbol: 'YFTE',
              name: 'YfTether.io',
              transferType: 'erc20',
            },
          ],
        },
        {
          hash: '0x3147f8bf154e854b27b24caf51ecb8e87ba625bb9c6b0bab60ac8f44057defc4',
          timestamp: '2026-01-16T20:16:16.000Z',
          chainId: 137,
          accountId: 'eip155:137:0x4bbeeb066ed09b7aed07bf39eee0460dfa261520',
          blockNumber: 81737302,
          blockHash:
            '0x397ad0a9bde0c50ade4ed009178a6d658abd7ee3fa32e34410e40be970ba0f13',
          gas: 119472,
          gasUsed: 98586,
          gasPrice: '295049518159',
          effectiveGasPrice: '295049518159',
          nonce: 999,
          cumulativeGasUsed: 874735,
          methodId: '0xd47e107e',
          value: '0',
          to: '0xe581b0a826de8c199be934604c1962ee306ba292',
          from: '0xca6e515cc0f52a255cb430c3c2e291e0b7c4476a',
          isError: false,
          valueTransfers: [
            {
              from: '0x0000000000000000000000000000000000000000',
              to: '0x4bbeeb066ed09b7aed07bf39eee0460dfa261520',
              tokenId: '1106',
              contractAddress: '0xe581b0a826de8c199be934604c1962ee306ba292',
              transferType: 'erc721',
            },
          ],
        },
      ],
      unprocessedNetworks: [],
      pageInfo: {
        count: 3,
        hasNextPage: true,
        hasPreviousPage: false,
        startCursor: null,
        endCursor:
          'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJlaXAxNTU6MToweDRiYmVlYjA2NmVkMDliN2FlZDA3YmYzOWVlZTA0NjBkZmEyNjE1MjAiOnsibGFzdFRpbWVzdGFtcCI6IjIwMjYtMDEtMTZUMjA6MTY6MTYuMDAwWiIsImhhc05leHRQYWdlIjp0cnVlfSwiZWlwMTU1OjEwOjB4NGJiZWViMDY2ZWQwOWI3YWVkMDdiZjM5ZWVlMDQ2MGRmYTI2MTUyMCI6eyJsYXN0VGltZXN0YW1wIjoiMjAyNi0wMS0xNlQyMDoxNjoxNi4wMDBaIiwiaGFzTmV4dFBhZ2UiOnRydWV9LCJlaXAxNTU6MTM3OjB4NGJiZWViMDY2ZWQwOWI3YWVkMDdiZjM5ZWVlMDQ2MGRmYTI2MTUyMCI6eyJsYXN0VGltZXN0YW1wIjoiMjAyNi0wMS0xNlQyMDoxNjoxNi4wMDBaIiwiaGFzTmV4dFBhZ2UiOnRydWV9LCJlaXAxNTU6NDIxNjE6MHg0YmJlZWIwNjZlZDA5YjdhZWQwN2JmMzllZWUwNDYwZGZhMjYxNTIwIjp7Imxhc3RUaW1lc3RhbXAiOiIyMDI2LTAxLTE2VDIwOjE2OjE2LjAwMFoiLCJoYXNOZXh0UGFnZSI6dHJ1ZX0sImVpcDE1NTo1MzQzNTI6MHg0YmJlZWIwNjZlZDA5YjdhZWQwN2JmMzllZWUwNDYwZGZhMjYxNTIwIjp7Imxhc3RUaW1lc3RhbXAiOiIyMDI2LTAxLTE2VDIwOjE2OjE2LjAwMFoiLCJoYXNOZXh0UGFnZSI6dHJ1ZX0sImVpcDE1NTo1NjoweDRiYmVlYjA2NmVkMDliN2FlZDA3YmYzOWVlZTA0NjBkZmEyNjE1MjAiOnsibGFzdFRpbWVzdGFtcCI6IjIwMjYtMDEtMTZUMjA6MTY6MTYuMDAwWiIsImhhc05leHRQYWdlIjp0cnVlfSwiZWlwMTU1OjU5MTQ0OjB4NGJiZWViMDY2ZWQwOWI3YWVkMDdiZjM5ZWVlMDQ2MGRmYTI2MTUyMCI6eyJsYXN0VGltZXN0YW1wIjoiMjAyNi0wMS0xNlQyMDoxNjoxNi4wMDBaIiwiaGFzTmV4dFBhZ2UiOnRydWV9LCJlaXAxNTU6ODQ1MzoweDRiYmVlYjA2NmVkMDliN2FlZDA3YmYzOWVlZTA0NjBkZmEyNjE1MjAiOnsibGFzdFRpbWVzdGFtcCI6IjIwMjYtMDEtMTZUMjA6MTY6MTYuMDAwWiIsImhhc05leHRQYWdlIjp0cnVlfSwiaWF0IjoxNzcyMTA4NzM4fQ.rlFQKUlm5rJjHynbXffMKzWw36qFva91GBcjOwjwPOw',
      },
    },
  };
  return nock('https://accounts.api.cx.metamask.io:443', {
    encodedQueryParams: true,
  })
    .get('/v4/multiaccount/transactions')
    .query({
      limit: '3',
      accountAddresses:
        'eip155%3A0%3A0x4bbeeb066ed09b7aed07bf39eee0460dfa261520',
    })
    .reply(reply.status, reply.body);
}

export function mockTransactionsPage2(mockReply?: MockReply): nock.Scope {
  const reply = mockReply ?? {
    status: 200,
    body: {
      data: [
        {
          hash: '0xcecd28aa5bd781ffd2a6d960578ffc6c89ac390e8d02baebc977a827956394e9',
          timestamp: '2025-12-29T11:51:08.000Z',
          chainId: 56,
          accountId: 'eip155:56:0x4bbeeb066ed09b7aed07bf39eee0460dfa261520',
          blockNumber: 73342543,
          blockHash:
            '0xf229f9ef08e817dbcbb53595cb1e3a502107314b0b8b73a5f055770b457cd3f3',
          gas: 5825657,
          gasUsed: 5778628,
          gasPrice: '78650000',
          effectiveGasPrice: '78650000',
          nonce: 1746,
          cumulativeGasUsed: 8070157,
          methodId: '0x1239ec8c',
          value: '0',
          to: '0x72fe31aae72fea4e1f9048a8a3ca580eeba3cd58',
          from: '0x053577f23edd3d6bf15fc53db9ca8042d4796fa7',
          isError: false,
          valueTransfers: [
            {
              from: '0x053577f23edd3d6bf15fc53db9ca8042d4796fa7',
              to: '0x4bbeeb066ed09b7aed07bf39eee0460dfa261520',
              amount: '29006498000000000',
              decimal: 18,
              contractAddress: '0x18d0e455b3491e09210292d3953157a4bf104444',
              symbol: '比特币',
              name: '比特币',
              transferType: 'erc20',
            },
          ],
        },
        {
          hash: '0xdb40973b60f774a14616e6e2be7af6e426b559d29e25e9b2938b3a733f361b78',
          timestamp: '2025-12-22T09:18:48.000Z',
          chainId: 56,
          accountId: 'eip155:56:0x4bbeeb066ed09b7aed07bf39eee0460dfa261520',
          blockNumber: 72524170,
          blockHash:
            '0xd43d7bb4c06ccfc0ecd172ed08fccacb774ed29e1c58b727687c5b075bc3343d',
          gas: 85408,
          gasUsed: 56133,
          gasPrice: '52330000',
          effectiveGasPrice: '52330000',
          nonce: 104,
          cumulativeGasUsed: 24011496,
          methodId: '0xa9059cbb',
          value: '0',
          to: '0xcba411922349ecd7eec13aac1825b1ddca223fc8',
          from: '0x0325f3aa3ef51e24b3f31a0c390e0bc984b5490f',
          isError: false,
          valueTransfers: [
            {
              from: '0x0325f3aa3ef51e24b3f31a0c390e0bc984b5490f',
              to: '0x4bbeeb066ed09b7aed07bf39eee0460dfa261520',
              amount: '100000000000000000000',
              decimal: 18,
              contractAddress: '0xcba411922349ecd7eec13aac1825b1ddca223fc8',
              symbol: 'MOB',
              name: 'MOB',
              transferType: 'erc20',
            },
          ],
        },
        {
          hash: '0x07bb21d1937b66aab9dfe1632e4eee9b96e82f54f41f17b3cc4378ec0188af61',
          timestamp: '2025-12-14T12:55:16.000Z',
          chainId: 56,
          accountId: 'eip155:56:0x4bbeeb066ed09b7aed07bf39eee0460dfa261520',
          blockNumber: 71620155,
          blockHash:
            '0xe0e71f46bba84eb4060565b376bc3ede99a45e84fad2e6588bbd003e5e623313',
          gas: 30424536,
          gasUsed: 3138845,
          gasPrice: '50500000',
          effectiveGasPrice: '50500000',
          nonce: 968,
          cumulativeGasUsed: 18618033,
          methodId: '0x729ad39e',
          value: '0',
          to: '0xdd7eb7809d283ae3ffa880183f20e7016ebe8374',
          from: '0x6c604c63fb280ca69559f42f6c5a4a4bfcf661d5',
          isError: false,
          valueTransfers: [
            {
              from: '0x6c604c63fb280ca69559f42f6c5a4a4bfcf661d5',
              to: '0x4bbeeb066ed09b7aed07bf39eee0460dfa261520',
              amount: 1,
              tokenId: '0',
              contractAddress: '0xdd7eb7809d283ae3ffa880183f20e7016ebe8374',
              transferType: 'erc1155',
            },
          ],
        },
      ],
      unprocessedNetworks: [],
      pageInfo: {
        count: 3,
        hasNextPage: true,
        hasPreviousPage: false,
        startCursor: null,
        endCursor:
          'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJlaXAxNTU6MToweDRiYmVlYjA2NmVkMDliN2FlZDA3YmYzOWVlZTA0NjBkZmEyNjE1MjAiOnsibGFzdFRpbWVzdGFtcCI6IjIwMjUtMTItMTRUMTI6NTU6MTYuMDAwWiIsImhhc05leHRQYWdlIjp0cnVlfSwiZWlwMTU1OjEwOjB4NGJiZWViMDY2ZWQwOWI3YWVkMDdiZjM5ZWVlMDQ2MGRmYTI2MTUyMCI6eyJsYXN0VGltZXN0YW1wIjoiMjAyNS0xMi0xNFQxMjo1NToxNi4wMDBaIiwiaGFzTmV4dFBhZ2UiOnRydWV9LCJlaXAxNTU6MTM3OjB4NGJiZWViMDY2ZWQwOWI3YWVkMDdiZjM5ZWVlMDQ2MGRmYTI2MTUyMCI6eyJsYXN0VGltZXN0YW1wIjoiMjAyNS0xMi0xNFQxMjo1NToxNi4wMDBaIiwiaGFzTmV4dFBhZ2UiOnRydWV9LCJlaXAxNTU6NDIxNjE6MHg0YmJlZWIwNjZlZDA5YjdhZWQwN2JmMzllZWUwNDYwZGZhMjYxNTIwIjp7Imxhc3RUaW1lc3RhbXAiOiIyMDI1LTEyLTE0VDEyOjU1OjE2LjAwMFoiLCJoYXNOZXh0UGFnZSI6dHJ1ZX0sImVpcDE1NTo1MzQzNTI6MHg0YmJlZWIwNjZlZDA5YjdhZWQwN2JmMzllZWUwNDYwZGZhMjYxNTIwIjp7Imxhc3RUaW1lc3RhbXAiOiIyMDI1LTEyLTE0VDEyOjU1OjE2LjAwMFoiLCJoYXNOZXh0UGFnZSI6dHJ1ZX0sImVpcDE1NTo1NjoweDRiYmVlYjA2NmVkMDliN2FlZDA3YmYzOWVlZTA0NjBkZmEyNjE1MjAiOnsibGFzdFRpbWVzdGFtcCI6IjIwMjUtMTItMTRUMTI6NTU6MTYuMDAwWiIsImhhc05leHRQYWdlIjp0cnVlfSwiZWlwMTU1OjU5MTQ0OjB4NGJiZWViMDY2ZWQwOWI3YWVkMDdiZjM5ZWVlMDQ2MGRmYTI2MTUyMCI6eyJsYXN0VGltZXN0YW1wIjoiMjAyNS0xMi0xNFQxMjo1NToxNi4wMDBaIiwiaGFzTmV4dFBhZ2UiOnRydWV9LCJlaXAxNTU6ODQ1MzoweDRiYmVlYjA2NmVkMDliN2FlZDA3YmYzOWVlZTA0NjBkZmEyNjE1MjAiOnsibGFzdFRpbWVzdGFtcCI6IjIwMjUtMTItMTRUMTI6NTU6MTYuMDAwWiIsImhhc05leHRQYWdlIjp0cnVlfSwiaWF0IjoxNzcyMTA5NDE2fQ.FD0bOPSGwFLPJytoo9KCRxTcUuyDXDKfzAeIGRfJPQI',
      },
    },
  };
  return nock('https://accounts.api.cx.metamask.io:443', {
    encodedQueryParams: true,
  })
    .get('/v4/multiaccount/transactions')
    .query({
      limit: '3',
      accountAddresses:
        'eip155%3A0%3A0x4bbeeb066ed09b7aed07bf39eee0460dfa261520',
      cursor:
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJlaXAxNTU6MToweDRiYmVlYjA2NmVkMDliN2FlZDA3YmYzOWVlZTA0NjBkZmEyNjE1MjAiOnsibGFzdFRpbWVzdGFtcCI6IjIwMjYtMDEtMTZUMjA6MTY6MTYuMDAwWiIsImhhc05leHRQYWdlIjp0cnVlfSwiZWlwMTU1OjEwOjB4NGJiZWViMDY2ZWQwOWI3YWVkMDdiZjM5ZWVlMDQ2MGRmYTI2MTUyMCI6eyJsYXN0VGltZXN0YW1wIjoiMjAyNi0wMS0xNlQyMDoxNjoxNi4wMDBaIiwiaGFzTmV4dFBhZ2UiOnRydWV9LCJlaXAxNTU6MTM3OjB4NGJiZWViMDY2ZWQwOWI3YWVkMDdiZjM5ZWVlMDQ2MGRmYTI2MTUyMCI6eyJsYXN0VGltZXN0YW1wIjoiMjAyNi0wMS0xNlQyMDoxNjoxNi4wMDBaIiwiaGFzTmV4dFBhZ2UiOnRydWV9LCJlaXAxNTU6NDIxNjE6MHg0YmJlZWIwNjZlZDA5YjdhZWQwN2JmMzllZWUwNDYwZGZhMjYxNTIwIjp7Imxhc3RUaW1lc3RhbXAiOiIyMDI2LTAxLTE2VDIwOjE2OjE2LjAwMFoiLCJoYXNOZXh0UGFnZSI6dHJ1ZX0sImVpcDE1NTo1MzQzNTI6MHg0YmJlZWIwNjZlZDA5YjdhZWQwN2JmMzllZWUwNDYwZGZhMjYxNTIwIjp7Imxhc3RUaW1lc3RhbXAiOiIyMDI2LTAxLTE2VDIwOjE2OjE2LjAwMFoiLCJoYXNOZXh0UGFnZSI6dHJ1ZX0sImVpcDE1NTo1NjoweDRiYmVlYjA2NmVkMDliN2FlZDA3YmYzOWVlZTA0NjBkZmEyNjE1MjAiOnsibGFzdFRpbWVzdGFtcCI6IjIwMjYtMDEtMTZUMjA6MTY6MTYuMDAwWiIsImhhc05leHRQYWdlIjp0cnVlfSwiZWlwMTU1OjU5MTQ0OjB4NGJiZWViMDY2ZWQwOWI3YWVkMDdiZjM5ZWVlMDQ2MGRmYTI2MTUyMCI6eyJsYXN0VGltZXN0YW1wIjoiMjAyNi0wMS0xNlQyMDoxNjoxNi4wMDBaIiwiaGFzTmV4dFBhZ2UiOnRydWV9LCJlaXAxNTU6ODQ1MzoweDRiYmVlYjA2NmVkMDliN2FlZDA3YmYzOWVlZTA0NjBkZmEyNjE1MjAiOnsibGFzdFRpbWVzdGFtcCI6IjIwMjYtMDEtMTZUMjA6MTY6MTYuMDAwWiIsImhhc05leHRQYWdlIjp0cnVlfSwiaWF0IjoxNzcyMTA4NzM4fQ.rlFQKUlm5rJjHynbXffMKzWw36qFva91GBcjOwjwPOw',
    })
    .reply(reply.status, reply.body);
}
