import { jest } from '@jest/globals';

import { apiTransactionFixtures } from '../../test/fixtures/api-transactions.js';
import { mapApiTransaction } from './api-transaction-mapper.js';
import { formatAddressToAssetId } from './helpers/caip.js';

// Mock known-token lookup with the deterministic test table in `test/`.
jest.mock('./helpers/token-metadata', () => ({
  getKnownTokenMetadata: jest.requireActual('../../test/test-helpers')
    .getKnownTokenMetadata,
}));

const {
  subjectAddress,
  baseUsdc,
  mainnetUsdc,
  baseAaveUsdc,
  baseRecipientAddress,
  lineaMusd,
  lineaSenderAddress,
  bscContractCallerAddress,
  bscUniversalRouter,
  polygonRecipientAddress,
  wethContractAddress,
  zeroAddress,
  nftRecipientAddress,
  nftBuyerAddress,
  nftSellerAddress,
} = apiTransactionFixtures.addresses;

describe('mapApiTransaction', () => {
  it('maps an ERC-20 transfer sent by the account to a Send activity', () => {
    const item = mapApiTransaction(
      apiTransactionFixtures.mapArgs.mapsAnErc20TransferSent,
    );

    expect(item).toMatchObject({
      type: 'send',
      chainId: 'eip155:8453',
      status: 'success',
      timestamp: 1778593067000,
      data: {
        from: subjectAddress,
        to: baseRecipientAddress,
        token: {
          direction: 'out',
          symbol: 'USDC',
          assetId: formatAddressToAssetId(baseUsdc, 'eip155:8453'),
        },
      },
    });
  });

  it('maps an ERC-20 transfer with an incidental receive transfer to a Send activity', () => {
    const { transaction } =
      apiTransactionFixtures.mapArgs.mapsAnErc20TransferWith;
    const aaveLineaUsdc = transaction.to;
    const senderAddress = transaction.from;
    const recipientAddress = transaction.valueTransfers?.[1]?.to;

    const item = mapApiTransaction(
      apiTransactionFixtures.mapArgs.mapsAnErc20TransferWith,
    );

    expect(item).toMatchObject({
      type: 'send',
      chainId: 'eip155:59144',
      status: 'success',
      timestamp: 1778074371000,
      hash: transaction.hash,
      data: {
        from: senderAddress,
        to: recipientAddress,
        token: {
          direction: 'out',
          amount: '419402',
          decimals: 6,
          symbol: 'aLinUSDC',
          assetId: formatAddressToAssetId(aaveLineaUsdc, 'eip155:59144'),
        },
      },
    });
  });

  it('maps a native value contract call without method data to a Send activity', () => {
    const item = mapApiTransaction(
      apiTransactionFixtures.mapArgs.mapsANativeValueContractCall,
    );

    expect(item).toMatchObject({
      type: 'send',
      chainId: 'eip155:137',
      status: 'success',
      timestamp: 1779218832000,
      hash: '0x64d2f26c261178252fcad9dbb665cf40337b827a582066553dd6634eaeea9f0a',
      data: {
        from: subjectAddress,
        to: polygonRecipientAddress,
        token: {
          amount: '100000000000000000',
          assetId: 'eip155:137/slip44:966',
          decimals: 18,
          direction: 'out',
          symbol: 'MATIC',
        },
      },
    });
  });

  it('maps an approval without value transfers to an Approve spending cap activity with token metadata', () => {
    const item = mapApiTransaction(
      apiTransactionFixtures.mapArgs.mapsAnApprovalWithoutValueTransfers,
    );

    expect(item).toMatchObject({
      type: 'approveSpendingCap',
      chainId: 'eip155:8453',
      status: 'success',
      timestamp: 1779888027000,
      hash: '0x91f89897197afcc09ad98ec4282366fd7938d8a9609e4fc2a0aa2d070664bc27',
      data: {
        token: {
          direction: 'out',
          symbol: 'USDC',
          decimals: 6,
          assetId: formatAddressToAssetId(baseUsdc, 'eip155:8453'),
        },
      },
    });
  });

  it('falls back to value transfer contract address when approval to is invalid', () => {
    const item = mapApiTransaction(
      apiTransactionFixtures.mapArgs.fallsBackToValueTransferContract,
    );

    expect(item).toMatchObject({
      type: 'approveSpendingCap',
      chainId: 'eip155:59144',
      data: {
        token: {
          direction: 'out',
          symbol: 'mUSD',
          assetId: formatAddressToAssetId(lineaMusd, 'eip155:59144'),
        },
      },
    });
  });

  it('maps an approval with neither a valid to nor a contract transfer to an assetId-less spending cap', () => {
    const item = mapApiTransaction(
      apiTransactionFixtures.mapArgs.mapsAnApprovalWithNeitherA,
    );

    expect(item).toMatchObject({
      type: 'approveSpendingCap',
      chainId: 'eip155:59144',
      data: {
        token: undefined,
      },
    });
  });

  it('maps an ERC-20 transfer received by the account to a Receive activity', () => {
    const item = mapApiTransaction(
      apiTransactionFixtures.mapArgs.mapsAnErc20TransferReceived,
    );

    expect(item).toMatchObject({
      type: 'receive',
      chainId: 'eip155:59144',
      status: 'success',
      timestamp: 1777983327000,
      data: {
        from: lineaSenderAddress,
        to: subjectAddress,
        token: {
          direction: 'in',
          symbol: 'mUSD',
          assetId: formatAddressToAssetId(lineaMusd, 'eip155:59144'),
        },
      },
    });
  });

  it('maps an exchange transaction without a received token to a Swap activity with no destination', () => {
    const item = mapApiTransaction(
      apiTransactionFixtures.mapArgs.mapsAnExchangeTransactionWithoutA,
    );

    expect(item).toMatchObject({
      type: 'swap',
      chainId: 'eip155:59144',
      status: 'success',
      timestamp: 1778003873000,
      data: {
        sourceToken: {
          direction: 'out',
          symbol: 'mUSD',
        },
      },
    });
  });

  it('maps an exchange transaction with an internal ETH receive transfer to a Swap activity with native destination assetId', () => {
    const item = mapApiTransaction(
      apiTransactionFixtures.mapArgs.mapsAnExchangeTransactionWithAn,
    );

    expect(item).toMatchObject({
      type: 'swap',
      chainId: 'eip155:59144',
      status: 'success',
      timestamp: 1779930229000,
      hash: '0x80b974d5834e1047a78332369de3d4b988f0237ff8a418c9464217e55c542f2f',
      data: {
        sourceToken: {
          amount: '10000',
          decimals: 6,
          direction: 'out',
          assetId: formatAddressToAssetId(lineaMusd, 'eip155:59144'),
          symbol: 'mUSD',
        },
        destinationToken: {
          amount: '4894004361763',
          decimals: 18,
          direction: 'in',
          assetId: formatAddressToAssetId(
            '0x0000000000000000000000000000000000000000',
            'eip155:59144',
          ),
          symbol: 'ETH',
        },
      },
    });
  });

  it('maps the LiFi Linea USDC to ETH exchange to a Swap activity', () => {
    const lineaUsdc = '0x176211869ca2b568f2a7d4ee941e073a821ee1ff';

    const item = mapApiTransaction(
      apiTransactionFixtures.mapArgs.mapsTheLifiLineaUsdcTo,
    );

    expect(item).toMatchObject({
      type: 'swap',
      chainId: 'eip155:59144',
      status: 'success',
      timestamp: new Date('2026-01-16T21:09:00.000Z').getTime(),
      hash: '0x3ac43e7c4a1a4421304ada43b41acec4d71ad90abfa418e97e92540a26eef0a2',
      data: {
        sourceToken: {
          amount: '7934205',
          decimals: 6,
          direction: 'out',
          assetId: formatAddressToAssetId(lineaUsdc, 'eip155:59144'),
          symbol: 'USDC',
        },
        destinationToken: {
          amount: '2388594176642019',
          decimals: 18,
          direction: 'in',
          assetId: formatAddressToAssetId(
            '0x0000000000000000000000000000000000000000',
            'eip155:59144',
          ),
          symbol: 'ETH',
        },
      },
    });
  });

  it('maps an NFT sale with received native ETH to a Sell activity', () => {
    const item = mapApiTransaction(
      apiTransactionFixtures.mapArgs.mapsAnNftSaleWithReceived,
    );

    expect(item).toMatchObject({
      type: 'nftSell',
      chainId: 'eip155:1',
      status: 'success',
      timestamp: 1771884263000,
      data: {
        from: subjectAddress,
        to: nftRecipientAddress,
        token: {
          direction: 'out',
          symbol: 'BAE',
        },
        paymentToken: {
          direction: 'in',
          symbol: 'ETH',
        },
      },
    });
  });

  it('maps an OpenSea NFT sale paid in WETH to a Sell activity', () => {
    const sellerAddress = apiTransactionFixtures.addresses.openseaSellerAddress;

    const item = mapApiTransaction(
      apiTransactionFixtures.mapArgs.mapsAnOpenseaNftSalePaid,
    );

    expect(item).toMatchObject({
      type: 'nftSell',
      chainId: 'eip155:8453',
      status: 'success',
      timestamp: 1768427429000,
      hash: '0x0e7f29fa4af73f3708a7383a2fa8d0e09f6c6bf8a176bccf3a6b3259e2886bae',
      data: {
        from: sellerAddress,
        to: '0xbaf3ad6542f932cc0e0b54983e82e0cfb7c5a5a1',
        token: {
          direction: 'out',
          // name takes precedence over symbol for NFTs
          symbol: 'The Warplets',
        },
        paymentToken: {
          direction: 'in',
          symbol: 'WETH',
        },
      },
    });
  });

  it('maps a plain NFT send with no payment to a Send activity', () => {
    const item = mapApiTransaction(
      apiTransactionFixtures.mapArgs.mapsAPlainNftSendWith,
    );

    expect(item).toMatchObject({
      type: 'send',
      chainId: 'eip155:1',
      data: {
        token: {
          direction: 'out',
          symbol: 'BAE',
        },
      },
    });
  });

  it('maps an NFT purchase', () => {
    const item = mapApiTransaction(
      apiTransactionFixtures.mapArgs.mapsAnNftPurchase,
    );

    expect(item).toMatchObject({
      type: 'nftBuy',
      chainId: 'eip155:1',
      status: 'success',
      timestamp: 1780601507000,
      hash: '0x8719dadd883779624845106e61fd94af234411c30d73184a72f4daf1425c4595',
      data: {
        from: '0x107b2e855528f344556f8c766a6187326a2c2fa6',
        to: nftBuyerAddress,
        token: {
          direction: 'in',
          symbol: 'FLUF World: Scenes and Sounds',
        },
        paymentToken: {
          direction: 'out',
          symbol: 'ETH',
        },
      },
    });
  });

  it('maps an NFT purchase paid in WETH (ERC-20) to an nftBuy activity', () => {
    const item = mapApiTransaction(
      apiTransactionFixtures.mapArgs.mapsAnNftPurchasePaidIn,
    );

    expect(item).toMatchObject({
      type: 'nftBuy',
      data: {
        token: {
          direction: 'in',
          symbol: 'FLUF World: Scenes and Sounds',
        },
        paymentToken: {
          direction: 'out',
          symbol: 'WETH',
        },
      },
    });
  });

  it('maps an NFT transfer received without payment to a Receive activity', () => {
    const item = mapApiTransaction(
      apiTransactionFixtures.mapArgs.mapsAnNftTransferReceivedWithout,
    );

    expect(item).toMatchObject({
      type: 'receive',
      data: {
        from: nftSellerAddress,
        to: subjectAddress,
        token: { direction: 'in', symbol: 'FLUF World' },
      },
    });
  });

  it('maps an inbound NFT with an unrelated native send to a Receive activity', () => {
    const item = mapApiTransaction(
      apiTransactionFixtures.mapArgs.mapsAnNftReceiveWithUnrelatedNativeSend,
    );

    expect(item).toMatchObject({
      type: 'receive',
      data: {
        from: nftSellerAddress,
        to: nftBuyerAddress,
        token: { direction: 'in', symbol: 'FLUF World' },
      },
    });
    expect(item.type).not.toBe('nftBuy');
  });

  it('maps a plain NFT send (no NFT exchange, no payment) to a Send activity', () => {
    const item = mapApiTransaction(
      apiTransactionFixtures.mapArgs.mapsAPlainNftSendNo,
    );

    expect(item).toMatchObject({
      type: 'send',
      data: {
        from: subjectAddress,
        to: nftRecipientAddress,
        token: { direction: 'out', symbol: 'BAE' },
      },
    });
  });

  it('maps an NFT mint transfer to an nftMint activity without assetId', () => {
    const item = mapApiTransaction(
      apiTransactionFixtures.mapArgs.mapsAnNftMintTransferTo,
    );

    expect(item).toMatchObject({
      type: 'nftMint',
      chainId: 'eip155:59144',
      status: 'success',
      timestamp: 1778682863000,
      hash: '0x25805d4ae16935e6fa92add9dcee97db0127749d4244032a79489098a880210c',
      data: {
        from: zeroAddress,
        to: subjectAddress,
        token: {
          direction: 'in',
          symbol: 'TDN',
        },
      },
    });
  });

  it('maps an Aave supply contract call to a Lending deposit activity', () => {
    const item = mapApiTransaction(
      apiTransactionFixtures.mapArgs.mapsAnAaveSupplyContractCall,
    );

    expect(item).toMatchObject({
      type: 'lendingDeposit',
      chainId: 'eip155:8453',
      status: 'success',
      timestamp: 1778643089000,
      hash: '0x08d14578168f22001e95503469c63613bd9f3d3f60e81dbbf204fbd21f484bd9',
      data: {
        sourceToken: {
          amount: '100000',
          decimals: 6,
          direction: 'out',
          symbol: 'USDC',
          assetId: formatAddressToAssetId(baseUsdc, 'eip155:8453'),
        },
        destinationToken: {
          amount: '99999',
          decimals: 6,
          direction: 'in',
          symbol: 'aBasUSDC',
          assetId: formatAddressToAssetId(baseAaveUsdc, 'eip155:8453'),
        },
      },
    });
  });

  it('maps an Aave withdraw with a known method id to a Lending withdrawal activity', () => {
    const item = mapApiTransaction(
      apiTransactionFixtures.mapArgs.mapsAnAaveWithdrawWithA,
    );

    expect(item).toMatchObject({
      type: 'lendingWithdrawal',
      chainId: 'eip155:8453',
      status: 'success',
      timestamp: 1779893234000,
      hash: '0x26f4911467b538702c0945e4ec5e303de44c0c1c174897141d1b548ea3161795',
      data: {
        sourceToken: {
          amount: '100000',
          decimals: 6,
          direction: 'out',
          symbol: 'aBasUSDC',
          assetId: formatAddressToAssetId(baseAaveUsdc, 'eip155:8453'),
        },
        destinationToken: {
          amount: '200000',
          decimals: 6,
          direction: 'in',
          symbol: 'USDC',
          assetId: formatAddressToAssetId(baseUsdc, 'eip155:8453'),
        },
      },
    });
  });

  it('maps a DEPOSIT without an inbound transfer to a deposit activity', () => {
    const item = mapApiTransaction(
      apiTransactionFixtures.mapArgs.mapsADepositWithoutAnInbound,
    );

    expect(item).toMatchObject({
      type: 'deposit',
      chainId: 'eip155:1',
      status: 'success',
      timestamp: 1778593067000,
      hash: '0xabc123deposit00000000000000000000000000000000000000000000000001',
      data: {
        token: {
          amount: '1000000000000000000',
          decimals: 18,
          direction: 'out',
          symbol: 'ETH',
          assetId: formatAddressToAssetId(
            '0x0000000000000000000000000000000000000000',
            'eip155:1',
          ),
        },
      },
    });
  });

  // Captures the real Lido stETH stake response. NOTE: the backend returns this
  // as `CONTRACT_CALL` with the Lido submit method id (part of `supplyMethodIds`),
  // so `mapApiTransaction` currently returns `lendingDeposit`. `mapLocalTransaction`
  // maps the same stake (TransactionType.stakingDeposit) to `deposit`, so the two
  // mappers disagree on this transaction.
  it('maps a real Lido stake (CONTRACT_CALL + supply method id) to a lendingDeposit activity', () => {
    const item = mapApiTransaction(
      apiTransactionFixtures.mapArgs.mapsALidoStakeToA,
    );

    expect(item).toMatchObject({
      type: 'lendingDeposit',
      chainId: 'eip155:1',
      status: 'success',
      hash: '0xd8ca1456ed6305ec3d9c058f28a1ba48eb335ffcffd7d7c4321d3169c29e6a07',
      data: {
        from: subjectAddress,
        sourceToken: {
          direction: 'out',
          symbol: 'ETH',
          amount: '1000000000000',
        },
        destinationToken: {
          direction: 'in',
          symbol: 'stETH',
          amount: '999999999999',
        },
      },
    });
  });

  it('maps a WETH deposit to a Wrap activity', () => {
    const item = mapApiTransaction(
      apiTransactionFixtures.mapArgs.mapsAWethDepositToA,
    );

    expect(item).toMatchObject({
      type: 'wrap',
      chainId: 'eip155:1',
      status: 'success',
      timestamp: 1779975743000,
      hash: '0x6e448f5b8cf55534507770c1cb90ba14e723d03b4a46b4919a5847eb8d13b7b5',
      data: {
        sourceToken: {
          amount: '1000000000000',
          decimals: 18,
          direction: 'out',
          symbol: 'ETH',
          assetId: formatAddressToAssetId(
            '0x0000000000000000000000000000000000000000',
            'eip155:1',
          ),
        },
        destinationToken: {
          amount: '1000000000000',
          decimals: 18,
          direction: 'in',
          symbol: 'WETH',
          assetId: formatAddressToAssetId(wethContractAddress, 'eip155:1'),
        },
      },
    });
  });

  it('maps an Aave supply contract call with an uppercase method id to a Lending deposit activity', () => {
    const { transaction, ...rest } =
      apiTransactionFixtures.mapArgs.mapsAnAaveSupplyContractCall;
    const item = mapApiTransaction({
      ...rest,
      transaction: {
        ...transaction,
        methodId: transaction.methodId?.toUpperCase(),
      },
    });

    expect(item.type).toBe('lendingDeposit');
  });

  it('maps an Aave withdraw with an uppercase method id to a Lending withdrawal activity', () => {
    const { transaction, ...rest } =
      apiTransactionFixtures.mapArgs.mapsAnAaveWithdrawWithA;
    const item = mapApiTransaction({
      ...rest,
      transaction: {
        ...transaction,
        methodId: transaction.methodId?.toUpperCase(),
      },
    });

    expect(item.type).toBe('lendingWithdrawal');
  });

  it('maps a WETH deposit with an uppercase method id to a Wrap activity', () => {
    const { transaction, ...rest } =
      apiTransactionFixtures.mapArgs.mapsAWethDepositToA;
    const item = mapApiTransaction({
      ...rest,
      transaction: {
        ...transaction,
        methodId: transaction.methodId?.toUpperCase(),
      },
    });

    expect(item.type).toBe('wrap');
  });

  it('maps a WETH withdrawal to an Unwrap activity', () => {
    const item = mapApiTransaction(
      apiTransactionFixtures.mapArgs.mapsAWethWithdrawalToAn,
    );

    expect(item).toMatchObject({
      type: 'unwrap',
      chainId: 'eip155:1',
      status: 'success',
      timestamp: 1779977700000,
      hash: '0x8f2a1c9e4b7d30651234567890abcdef1234567890abcdef1234567890abcdef',
      data: {
        sourceToken: {
          amount: '1000000000000',
          decimals: 18,
          direction: 'out',
          symbol: 'WETH',
          assetId: formatAddressToAssetId(wethContractAddress, 'eip155:1'),
        },
        destinationToken: {
          amount: '1000000000000',
          decimals: 18,
          direction: 'in',
          symbol: 'ETH',
          assetId: formatAddressToAssetId(
            '0x0000000000000000000000000000000000000000',
            'eip155:1',
          ),
        },
      },
    });
  });

  it('maps a MetaMask mUSD bonus claim to a Claim mUSD bonus activity', () => {
    const item = mapApiTransaction(
      apiTransactionFixtures.mapArgs.mapsAMetamaskMusdBonusClaim,
    );

    expect(item).toMatchObject({
      type: 'claimMusdBonus',
      chainId: 'eip155:59144',
      status: 'success',
      timestamp: 1778633325000,
      hash: '0x875ded271a40278391fca5d71892231afd0cb9592f31bdf3b7c949906cb982c4',
      data: {
        from: subjectAddress,
        token: {
          direction: 'in',
          symbol: 'mUSD',
          assetId: formatAddressToAssetId(lineaMusd, 'eip155:59144'),
        },
      },
    });
  });

  it('maps a generic CLAIM with a received token to a claim activity', () => {
    const item = mapApiTransaction(
      apiTransactionFixtures.mapArgs.mapsAGenericClaimWithA,
    );

    expect(item).toMatchObject({
      type: 'claim',
      data: {
        from: subjectAddress,
        token: { direction: 'in', symbol: 'mUSD', amount: '5' },
      },
    });
  });

  it('maps a generic CLAIM with only a sent token to an outbound claim activity', () => {
    const item = mapApiTransaction(
      apiTransactionFixtures.mapArgs.mapsAGenericClaimWithOnly,
    );

    expect(item).toMatchObject({
      type: 'claim',
      data: { token: { direction: 'out', symbol: 'mUSD' } },
    });
  });

  it('maps a bridge withdraw to a Bridge activity', () => {
    const item = mapApiTransaction(
      apiTransactionFixtures.mapArgs.mapsABridgeWithdrawToA,
    );

    expect(item).toMatchObject({
      type: 'bridge',
      chainId: 'eip155:8453',
      status: 'success',
      timestamp: 1779941611000,
      hash: '0x9f81163d00374094411f44732738c6dea194551e4500bde9fd7ee60319aac766',
      data: {
        fees: [
          {
            amount: String(BigInt('0x24405') * BigInt('0x6fc23ac1d')),
            assetId: formatAddressToAssetId(
              '0x0000000000000000000000000000000000000000',
              'eip155:8453',
            ),
            decimals: 18,
            symbol: 'ETH',
            type: 'base',
          },
        ],
        sourceToken: {
          amount: '100000',
          decimals: 6,
          direction: 'out',
          symbol: 'USDC',
          assetId: formatAddressToAssetId(baseUsdc, 'eip155:8453'),
        },
      },
    });
  });

  it('maps an unrecognized transaction category to a contract interaction activity', () => {
    const item = mapApiTransaction(
      apiTransactionFixtures.mapArgs.mapsAnUnrecognizedTransactionCategoryTo,
    );

    expect(item).toMatchObject({
      type: 'contractInteraction',
      chainId: 'eip155:56',
      status: 'success',
      timestamp: 1778601880000,
      data: {
        from: bscContractCallerAddress,
        methodId: '0x174dea71',
        to: bscUniversalRouter,
        transactionCategory: 'CONTRACT_CALL',
        transactionProtocol: 'GENERIC',
        token: {
          direction: 'out',
          symbol: 'BNB',
        },
      },
    });
  });

  it('maps a contract interaction with no value transfers without a token', () => {
    const item = mapApiTransaction(
      apiTransactionFixtures.mapArgs.mapsAContractCallWithNoTransfers,
    );

    expect(item.type).toBe('contractInteraction');
    const token =
      item.type === 'contractInteraction' ? item.data.token : 'unset';
    expect(token).toBeUndefined();
  });

  it('maps the reported generic contract call to a contract interaction with its token amount', () => {
    const item = mapApiTransaction(
      apiTransactionFixtures.mapArgs.mapsTheReportedGenericContractCall,
    );

    expect(item).toMatchObject({
      type: 'contractInteraction',
      chainId: 'eip155:1',
      status: 'success',
      timestamp: 1777642787000,
      hash: '0xd206cc6c16974409bae072ce4cd1559743041af40c2bae84775a0bbb4dff5fee',
      data: {
        from: subjectAddress,
        methodId: '0xe9ae5c53',
        to: subjectAddress,
        transactionCategory: 'CONTRACT_CALL',
        transactionProtocol: undefined,
        token: {
          amount: '580060',
          assetId: formatAddressToAssetId(mainnetUsdc, 'eip155:1'),
          decimals: 6,
          direction: 'out',
          symbol: 'USDC',
        },
      },
    });
  });

  it('maps a contract call CONTRACT_CALL swap (differing symbols) to a Swap activity', () => {
    const item = mapApiTransaction(
      apiTransactionFixtures.mapArgs.mapsAContractCallContractCall,
    );

    expect(item).toMatchObject({
      type: 'swap',
      data: {
        sourceToken: { direction: 'out', symbol: 'USDC' },
        destinationToken: { direction: 'in', symbol: 'DAI' },
      },
    });
  });

  it('maps a failed transaction to a failed activity item', () => {
    const item = mapApiTransaction(
      apiTransactionFixtures.mapArgs.mapsAFailedTransactionToA,
    );

    expect(item.status).toBe('failed');
  });

  it('maps a Standard transaction on a chain outside the swaps registry without throwing', () => {
    expect(() =>
      mapApiTransaction(
        apiTransactionFixtures.mapArgs.mapsAStandardTransactionOnA,
      ),
    ).not.toThrow();

    const item = mapApiTransaction(
      apiTransactionFixtures.mapArgs.mapsAStandardTransactionOnA,
    );

    expect(item.type).toBe('send');
    expect(item.chainId).toBe('eip155:4657');
  });

  it('maps a Standard transaction with a native asset to a send with native token', () => {
    const item = mapApiTransaction(
      apiTransactionFixtures.mapArgs.mapsAStandardTransactionWithA,
    );

    expect(item).toMatchObject({
      type: 'send',
      chainId: 'eip155:1',
      data: {
        token: {
          amount: '1000000000000000000',
          symbol: 'ETH',
          direction: 'out',
          assetId: 'eip155:1/slip44:60',
        },
      },
    });
  });

  it('maps an APPROVE with only an inbound transfer (revoke) to an inbound spending cap', () => {
    const item = mapApiTransaction(
      apiTransactionFixtures.mapArgs.mapsAnApproveWithOnlyAn,
    );

    expect(item).toMatchObject({
      type: 'approveSpendingCap',
      data: {
        token: {
          direction: 'in',
          assetId: formatAddressToAssetId(mainnetUsdc, 'eip155:1'),
        },
      },
    });
  });

  it('maps an APPROVE for a known token to a spending cap with token metadata', () => {
    const mainnetUsdt = '0xdac17f958d2ee523a2206206994597c13d831ec7';
    const item = mapApiTransaction(
      apiTransactionFixtures.mapArgs.mapsAnApproveForAKnown,
    );

    expect(item).toMatchObject({
      type: 'approveSpendingCap',
      data: {
        token: {
          direction: 'out',
          symbol: 'USDT',
          decimals: 6,
          assetId: formatAddressToAssetId(mainnetUsdt, 'eip155:1'),
        },
      },
    });
  });

  it('maps a Standard inbound native transfer (no value transfers) to a Receive activity', () => {
    const item = mapApiTransaction(
      apiTransactionFixtures.mapArgs.mapsAStandardInboundNativeTransfer,
    );

    expect(item).toMatchObject({
      type: 'receive',
      chainId: 'eip155:1',
      data: {
        token: {
          amount: '1000000000000000000',
          symbol: 'ETH',
          direction: 'in',
          assetId: 'eip155:1/slip44:60',
        },
      },
    });
  });

  it('does not map a withdraw without a known method id to a lending withdrawal', () => {
    const { transaction, subjectAddress: fixtureSubjectAddress } =
      apiTransactionFixtures.mapArgs.mapsAnAaveWithdrawWithA;
    const item = mapApiTransaction({
      subjectAddress: fixtureSubjectAddress,
      transaction: {
        ...transaction,
        methodId: undefined,
      },
    });

    expect(item.type).not.toBe('lendingWithdrawal');
  });

  it('does not map a deposit without a wrap method id to a wrap activity', () => {
    const { transaction, subjectAddress: fixtureSubjectAddress } =
      apiTransactionFixtures.mapArgs.mapsAWethDepositToA;
    const item = mapApiTransaction({
      subjectAddress: fixtureSubjectAddress,
      transaction: {
        ...transaction,
        methodId: undefined,
      },
    });

    expect(item.type).not.toBe('wrap');
  });

  it('does not map a wrap when `to` is not the chain wrapped-native contract', () => {
    const { transaction, subjectAddress: fixtureSubjectAddress } =
      apiTransactionFixtures.mapArgs.mapsAWethDepositToA;
    const item = mapApiTransaction({
      subjectAddress: fixtureSubjectAddress,
      transaction: {
        ...transaction,
        to: '0x1111111111111111111111111111111111111111',
      },
    });

    expect(item.type).not.toBe('wrap');
  });

  it('does not map a wrap on a chain without a known wrapped-native contract', () => {
    const { transaction, subjectAddress: fixtureSubjectAddress } =
      apiTransactionFixtures.mapArgs.mapsAWethDepositToA;
    const item = mapApiTransaction({
      subjectAddress: fixtureSubjectAddress,
      transaction: {
        ...transaction,
        chainId: 999999,
      },
    });

    expect(item.type).not.toBe('wrap');
  });

  it('maps an unrecognized category with only an inbound transfer to a contract interaction with an inbound token', () => {
    const item = mapApiTransaction(
      apiTransactionFixtures.mapArgs.mapsAnUnrecognizedCategoryWithOnly,
    );

    expect(item).toMatchObject({
      type: 'contractInteraction',
      data: {
        token: {
          direction: 'in',
          amount: '12345',
          symbol: 'USDC',
        },
      },
    });
  });
});
