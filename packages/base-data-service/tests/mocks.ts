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

export function mockTransactions(mockReply?: MockReply): nock.Scope {
  const reply = mockReply ?? {
    status: 200,
    body: {
      data: [
        {
          hash: '0x3fd0f0989c8307347492afd11e8f14929fe726e23939b2aec7c806658d7b96c8',
          timestamp: '2026-02-26T10:20:49.000Z',
          chainId: 8453,
          accountId: 'eip155:8453:0xd8da6bf26964af9d7eed9e03e53415d37aa96045',
          blockNumber: 42655951,
          blockHash:
            '0x0d950aa2dd400111cd70def5beeeb4e005a6c06b294a1b84e1ae2a2d082e2c4c',
          gas: 63681,
          gasUsed: 21062,
          gasPrice: '18814867',
          effectiveGasPrice: '18814867',
          nonce: 9070,
          cumulativeGasUsed: 32355593,
          methodId: null,
          value: '30000000000000',
          to: '0xd8da6bf26964af9d7eed9e03e53415d37aa96045',
          from: '0xfa783aa578a0f2d21756c5c6c5403494302a1eb1',
          isError: false,
          valueTransfers: [
            {
              from: '0xfa783aa578a0f2d21756c5c6c5403494302a1eb1',
              to: '0xd8da6bf26964af9d7eed9e03e53415d37aa96045',
              amount: '30000000000000',
              decimal: 18,
              transferType: 'normal',
            },
          ],
        },
        {
          hash: '0xa3e4916122815850f8aa6c0bdb8f9b075be3d2caa103003f955dfdf2816acf47',
          timestamp: '2026-02-26T08:27:23.000Z',
          chainId: 1,
          accountId: 'eip155:1:0xd8da6bf26964af9d7eed9e03e53415d37aa96045',
          blockNumber: 24539890,
          blockHash:
            '0xb69dd1d970207a8da49cb52fc1a0351cc39b61142646d8381c04656936fb07d2',
          gas: 25473,
          gasUsed: 21062,
          gasPrice: '62203661',
          effectiveGasPrice: '62203661',
          nonce: 13,
          cumulativeGasUsed: 23622367,
          methodId: null,
          value: '1000000000000000',
          to: '0xd8da6bf26964af9d7eed9e03e53415d37aa96045',
          from: '0x5931f36512899f6519aecd95f7189b817ab63ad9',
          isError: false,
          valueTransfers: [
            {
              from: '0x5931f36512899f6519aecd95f7189b817ab63ad9',
              to: '0xd8da6bf26964af9d7eed9e03e53415d37aa96045',
              amount: '1000000000000000',
              decimal: 18,
              transferType: 'normal',
            },
          ],
        },
        {
          hash: '0x95060cbd9d9d049c73da8e81b8f1349e561a1edd209d12693f9e771cba4bed04',
          timestamp: '2026-02-26T08:26:59.000Z',
          chainId: 1,
          accountId: 'eip155:1:0xd8da6bf26964af9d7eed9e03e53415d37aa96045',
          blockNumber: 24539888,
          blockHash:
            '0x8ca8ee27bbe0fe86d522a7639fed9ed39ed32aec0e234c4d3d84f91170119e09',
          gas: 25473,
          gasUsed: 21062,
          gasPrice: '59049965',
          effectiveGasPrice: '59049965',
          nonce: 11,
          cumulativeGasUsed: 32992820,
          methodId: null,
          value: '1000000000000000',
          to: '0xd8da6bf26964af9d7eed9e03e53415d37aa96045',
          from: '0x5931f36512899f6519aecd95f7189b817ab63ad9',
          isError: false,
          valueTransfers: [
            {
              from: '0x5931f36512899f6519aecd95f7189b817ab63ad9',
              to: '0xd8da6bf26964af9d7eed9e03e53415d37aa96045',
              amount: '1000000000000000',
              decimal: 18,
              transferType: 'normal',
            },
          ],
        },
        {
          hash: '0xd62d9036c6774e60955860ebdd8263bb2e04ea1d9f8a091203b8e450edd972a9',
          timestamp: '2026-02-26T08:26:35.000Z',
          chainId: 1,
          accountId: 'eip155:1:0xd8da6bf26964af9d7eed9e03e53415d37aa96045',
          blockNumber: 24539886,
          blockHash:
            '0xde57db8d6318c1720abfeacbf07752f40ca70249578c9e28ca128436c25aded8',
          gas: 25473,
          gasUsed: 21062,
          gasPrice: '59204928',
          effectiveGasPrice: '59204928',
          nonce: 10,
          cumulativeGasUsed: 33005174,
          methodId: null,
          value: '100000000000000',
          to: '0xd8da6bf26964af9d7eed9e03e53415d37aa96045',
          from: '0x5931f36512899f6519aecd95f7189b817ab63ad9',
          isError: false,
          valueTransfers: [
            {
              from: '0x5931f36512899f6519aecd95f7189b817ab63ad9',
              to: '0xd8da6bf26964af9d7eed9e03e53415d37aa96045',
              amount: '100000000000000',
              decimal: 18,
              transferType: 'normal',
            },
          ],
        },
        {
          hash: '0xa4f6ba45916ce0398da55fb2be4a603c19d0a7bc692edac71970a76a854a769a',
          timestamp: '2026-02-26T08:17:11.000Z',
          chainId: 1,
          accountId: 'eip155:1:0xd8da6bf26964af9d7eed9e03e53415d37aa96045',
          blockNumber: 24539839,
          blockHash:
            '0x4a92b6ae4d949a5f732ef0ff481dc61e00d8c129ec2eec9d26614e57b8f2c9d7',
          gas: 25473,
          gasUsed: 21062,
          gasPrice: '41188673',
          effectiveGasPrice: '41188673',
          nonce: 8,
          cumulativeGasUsed: 51579752,
          methodId: null,
          value: '1000000000000000',
          to: '0xd8da6bf26964af9d7eed9e03e53415d37aa96045',
          from: '0x5931f36512899f6519aecd95f7189b817ab63ad9',
          isError: false,
          valueTransfers: [
            {
              from: '0x5931f36512899f6519aecd95f7189b817ab63ad9',
              to: '0xd8da6bf26964af9d7eed9e03e53415d37aa96045',
              amount: '1000000000000000',
              decimal: 18,
              transferType: 'normal',
            },
          ],
        },
        {
          hash: '0x8ef436c3847ca66207fa7f1d903e0366f907701f63219042fca1540bf9af8fbb',
          timestamp: '2026-02-26T08:16:11.000Z',
          chainId: 1,
          accountId: 'eip155:1:0xd8da6bf26964af9d7eed9e03e53415d37aa96045',
          blockNumber: 24539834,
          blockHash:
            '0x18275f949d3eb177977250c34b87cbd5ed2ebc28d067f7cdb618a5620ed79928',
          gas: 25473,
          gasUsed: 21062,
          gasPrice: '42372579',
          effectiveGasPrice: '42372579',
          nonce: 6,
          cumulativeGasUsed: 53840387,
          methodId: null,
          value: '1000000000000000',
          to: '0xd8da6bf26964af9d7eed9e03e53415d37aa96045',
          from: '0x5931f36512899f6519aecd95f7189b817ab63ad9',
          isError: false,
          valueTransfers: [
            {
              from: '0x5931f36512899f6519aecd95f7189b817ab63ad9',
              to: '0xd8da6bf26964af9d7eed9e03e53415d37aa96045',
              amount: '1000000000000000',
              decimal: 18,
              transferType: 'normal',
            },
          ],
        },
        {
          hash: '0x4e11fd71425b8aef394a427a60908394391ed01391223eaab5bcb47527b9ed95',
          timestamp: '2026-02-26T06:19:41.000Z',
          chainId: 8453,
          accountId: 'eip155:8453:0xd8da6bf26964af9d7eed9e03e53415d37aa96045',
          blockNumber: 42648717,
          blockHash:
            '0x49bf09a1b790b59c07210518d86f1572d174bf01c573dae5defd314471513faa',
          gas: 100000,
          gasUsed: 21062,
          gasPrice: '6599218',
          effectiveGasPrice: '6599218',
          nonce: 488,
          cumulativeGasUsed: 16806862,
          methodId: null,
          value: '99880000',
          to: '0xd8da6bf26964af9d7eed9e03e53415d37aa96045',
          from: '0xf0e9286cfcb75c94ac19e99bcd93d814da55e304',
          isError: false,
          valueTransfers: [
            {
              from: '0xf0e9286cfcb75c94ac19e99bcd93d814da55e304',
              to: '0xd8da6bf26964af9d7eed9e03e53415d37aa96045',
              amount: '99880000',
              decimal: 18,
              transferType: 'normal',
            },
          ],
        },
        {
          hash: '0xa0993bcb4b1fe0877c1eb2b3414291fb4a94560fa191ddab5d4946f9ca6a173a',
          timestamp: '2026-02-26T04:51:47.000Z',
          chainId: 1,
          accountId: 'eip155:1:0xd8da6bf26964af9d7eed9e03e53415d37aa96045',
          blockNumber: 24538816,
          blockHash:
            '0x7a628393adbe09117e48d298b676a73108d40ab96e54345c87b027508a956851',
          gas: 31841,
          gasUsed: 21062,
          gasPrice: '158983234',
          effectiveGasPrice: '158983234',
          nonce: 10,
          cumulativeGasUsed: 18661650,
          methodId: null,
          value: '100000000000',
          to: '0xd8da6bf26964af9d7eed9e03e53415d37aa96045',
          from: '0xffe90d7897d56ef6c2a5953da34558015cccc85a',
          isError: false,
          valueTransfers: [
            {
              from: '0xffe90d7897d56ef6c2a5953da34558015cccc85a',
              to: '0xd8da6bf26964af9d7eed9e03e53415d37aa96045',
              amount: '100000000000',
              decimal: 18,
              transferType: 'normal',
            },
          ],
        },
        {
          hash: '0xea79462c31d6bf0a96409f5b49fa6a02464b45a48f5b3192329c2ea1887de57a',
          timestamp: '2026-02-26T04:19:13.000Z',
          chainId: 8453,
          accountId: 'eip155:8453:0xd8da6bf26964af9d7eed9e03e53415d37aa96045',
          blockNumber: 42645103,
          blockHash:
            '0x62ddcb78dc7abd9e6bca07c9a105afffb3d708b553ea74bcaac7c9b02b745fa9',
          gas: 359969,
          gasUsed: 237236,
          gasPrice: '6004066',
          effectiveGasPrice: '6004066',
          nonce: 752,
          cumulativeGasUsed: 31492867,
          methodId: '0x01020400',
          value: '0',
          to: '0x0000000000006ac72ed1d192fa28f0058d3f8806',
          from: '0xc723f2c210c4d29cfe35209340a6fb766d956982',
          isError: false,
          valueTransfers: [
            {
              from: '0xe6ede73fa975b5a2f8daf2a51945addee6413df5',
              to: '0xd8da6bf26964af9d7eed9e03e53415d37aa96045',
              amount: '150000',
              decimal: 6,
              contractAddress: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
              symbol: 'USDC',
              name: 'USD Coin',
              transferType: 'erc20',
            },
          ],
        },
        {
          hash: '0xd98b2afab4bb65ef6d8b5f0c726192f180a906f27c960c9dad11c60041474738',
          timestamp: '2026-02-26T02:38:01.000Z',
          chainId: 8453,
          accountId: 'eip155:8453:0xd8da6bf26964af9d7eed9e03e53415d37aa96045',
          blockNumber: 42642067,
          blockHash:
            '0xf612c40cd76c5e8b4140b5235130c8ceb23f10464b20e7c5c314037aa9e82f82',
          gas: 341543,
          gasUsed: 225000,
          gasPrice: '6493425',
          effectiveGasPrice: '6493425',
          nonce: 11197,
          cumulativeGasUsed: 25787493,
          methodId: '0x01020400',
          value: '0',
          to: '0x0000000000006ac72ed1d192fa28f0058d3f8806',
          from: '0x52fba7915b2b37f85100b543af54fba499228846',
          isError: false,
          valueTransfers: [
            {
              from: '0x74753ad4f1e5b1f0c25725f50796bb530636a912',
              to: '0xd8da6bf26964af9d7eed9e03e53415d37aa96045',
              amount: '150000',
              decimal: 6,
              contractAddress: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
              symbol: 'USDC',
              name: 'USD Coin',
              transferType: 'erc20',
            },
          ],
        },
      ],
      unprocessedNetworks: [
        'eip155:137:0xd8da6bf26964af9d7eed9e03e53415d37aa96045',
      ],
      pageInfo: {
        count: 10,
        hasNextPage: true,
        hasPreviousPage: false,
        startCursor: null,
        endCursor:
          'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJlaXAxNTU6MToweGQ4ZGE2YmYyNjk2NGFmOWQ3ZWVkOWUwM2U1MzQxNWQzN2FhOTYwNDUiOnsibGFzdFRpbWVzdGFtcCI6IjIwMjYtMDItMjZUMDI6Mzg6MDEuMDAwWiIsImhhc05leHRQYWdlIjp0cnVlfSwiZWlwMTU1OjEwOjB4ZDhkYTZiZjI2OTY0YWY5ZDdlZWQ5ZTAzZTUzNDE1ZDM3YWE5NjA0NSI6eyJsYXN0VGltZXN0YW1wIjoiMjAyNi0wMi0yNlQwMjozODowMS4wMDBaIiwiaGFzTmV4dFBhZ2UiOnRydWV9LCJlaXAxNTU6MTMyOToweGQ4ZGE2YmYyNjk2NGFmOWQ3ZWVkOWUwM2U1MzQxNWQzN2FhOTYwNDUiOnsibGFzdFRpbWVzdGFtcCI6IjIwMjYtMDItMjZUMDI6Mzg6MDEuMDAwWiIsImhhc05leHRQYWdlIjp0cnVlfSwiZWlwMTU1OjE0MzoweGQ4ZGE2YmYyNjk2NGFmOWQ3ZWVkOWUwM2U1MzQxNWQzN2FhOTYwNDUiOnsibGFzdFRpbWVzdGFtcCI6IjIwMjYtMDItMjZUMDI6Mzg6MDEuMDAwWiIsImhhc05leHRQYWdlIjp0cnVlfSwiZWlwMTU1OjQyMTYxOjB4ZDhkYTZiZjI2OTY0YWY5ZDdlZWQ5ZTAzZTUzNDE1ZDM3YWE5NjA0NSI6eyJsYXN0VGltZXN0YW1wIjoiMjAyNi0wMi0yNlQwMjozODowMS4wMDBaIiwiaGFzTmV4dFBhZ2UiOnRydWV9LCJlaXAxNTU6NTM0MzUyOjB4ZDhkYTZiZjI2OTY0YWY5ZDdlZWQ5ZTAzZTUzNDE1ZDM3YWE5NjA0NSI6eyJsYXN0VGltZXN0YW1wIjoiMjAyNi0wMi0yNlQwMjozODowMS4wMDBaIiwiaGFzTmV4dFBhZ2UiOnRydWV9LCJlaXAxNTU6NTY6MHhkOGRhNmJmMjY5NjRhZjlkN2VlZDllMDNlNTM0MTVkMzdhYTk2MDQ1Ijp7Imxhc3RUaW1lc3RhbXAiOiIyMDI2LTAyLTI2VDAyOjM4OjAxLjAwMFoiLCJoYXNOZXh0UGFnZSI6dHJ1ZX0sImVpcDE1NTo1OTE0NDoweGQ4ZGE2YmYyNjk2NGFmOWQ3ZWVkOWUwM2U1MzQxNWQzN2FhOTYwNDUiOnsibGFzdFRpbWVzdGFtcCI6IjIwMjYtMDItMjZUMDI6Mzg6MDEuMDAwWiIsImhhc05leHRQYWdlIjp0cnVlfSwiZWlwMTU1Ojg0NTM6MHhkOGRhNmJmMjY5NjRhZjlkN2VlZDllMDNlNTM0MTVkMzdhYTk2MDQ1Ijp7Imxhc3RUaW1lc3RhbXAiOiIyMDI2LTAyLTI2VDAyOjM4OjAxLjAwMFoiLCJoYXNOZXh0UGFnZSI6dHJ1ZX0sImVpcDE1NTo5OTk6MHhkOGRhNmJmMjY5NjRhZjlkN2VlZDllMDNlNTM0MTVkMzdhYTk2MDQ1Ijp7Imxhc3RUaW1lc3RhbXAiOiIyMDI2LTAyLTI2VDAyOjM4OjAxLjAwMFoiLCJoYXNOZXh0UGFnZSI6dHJ1ZX0sImlhdCI6MTc3MjEwMjAyNX0.NYLYAQ-7pTPd01t5Nz1VxP5tMBZvHOPf2PXZw7VInpM',
      },
    },
  };
  return nock('https://accounts.api.cx.metamask.io:443', {
    encodedQueryParams: true,
  })
    .get('/v4/multiaccount/transactions')
    .query({
      limit: '10',
      accountAddresses:
        'eip155%3A0%3A0xd8da6bf26964af9d7eed9e03e53415d37aa96045',
    })
    .reply(reply.status, reply.body);
}
