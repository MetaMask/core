import { jest } from '@jest/globals';

import { localTransactionFixtures } from '../../test/fixtures/local-transactions.js';
import { formatAddressToAssetId } from './helpers/caip.js';
import { mapLocalTransaction } from './local-transaction-mapper.js';

jest.mock('./helpers/token-metadata', () => ({
  getKnownTokenMetadata: jest.requireActual('../../test/test-helpers')
    .getKnownTokenMetadata,
}));

const {
  from,
  to,
  baseUsdc,
  lineaDai,
  lineaMusd,
  wethContractAddress,
  mainnetUsdt,
} = localTransactionFixtures.addresses;

describe('mapLocalTransaction', () => {
  it('maps a pending native send to a Send activity', () => {
    const item = mapLocalTransaction(
      localTransactionFixtures.mapInputs.mapsAPendingNativeSendTo,
    );
    expect(item).toStrictEqual({
      type: 'send',
      chainId: 'eip155:1',
      status: 'pending',
      timestamp: 1716367781000,
      hash: '0xsend',
      data: {
        from,
        to,
        token: {
          amount: '0x1',
          assetId: 'eip155:1/slip44:60',
          decimals: 18,
          direction: 'out',
          symbol: 'ETH',
        },
      },
    });
  });
  it('maps a native send on an unknown chain without a ticker to a tokenless Send', () => {
    const item = mapLocalTransaction(
      localTransactionFixtures.mapInputs.mapsANativeSendOnAn,
    );
    expect(item).toStrictEqual({
      type: 'send',
      chainId: 'eip155:1338',
      status: 'success',
      timestamp: 1779392463306,
      hash: '0xnonative',
      data: {
        from,
        to,
        token: undefined,
      },
    });
  });
  it('maps a custom network native send without bridge native asset metadata', () => {
    const item = mapLocalTransaction(
      localTransactionFixtures.mapInputs.mapsACustomNetworkNativeSend,
    );
    expect(item).toStrictEqual({
      type: 'send',
      chainId: 'eip155:1338',
      status: 'success',
      timestamp: 1779392463306,
      hash: '0xcustomsend',
      data: {
        from,
        to,
        token: {
          amount: '0xde0b6b3a7640000',
          decimals: 18,
          direction: 'out',
          symbol: 'ETH',
        },
      },
    });
  });
  it('maps a USDC transfer with transferInformation', () => {
    const item = mapLocalTransaction(
      localTransactionFixtures.mapInputs
        .mapsAUsdcTransferWithTransferinformation,
    );
    expect(item).toStrictEqual({
      type: 'send',
      chainId: 'eip155:1',
      status: 'pending',
      timestamp: 1716367781000,
      hash: '0xtokensend',
      data: {
        from,
        to: localTransactionFixtures.addresses.mainnetUsdc,
        token: {
          amount: '20000',
          assetId: 'eip155:1/erc20:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
          decimals: 6,
          direction: 'out',
          symbol: 'USDC',
        },
      },
    });
  });
  it('maps a USDT transfer without transferInformation', () => {
    const item = mapLocalTransaction(
      localTransactionFixtures.mapInputs
        .mapsAUsdtTransferWithoutTransferinformation,
    );
    expect(item).toMatchObject({
      type: 'send',
      chainId: 'eip155:1',
      data: {
        from,
        to: localTransactionFixtures.addresses.mainnetUsdt,
        token: {
          assetId: 'eip155:1/erc20:0xdAC17F958D2ee523a2206206994597C13D831ec7',
          direction: 'out',
        },
      },
    });
  });
  it('leaves unknown token transfer symbols blank', () => {
    const item = mapLocalTransaction(
      localTransactionFixtures.mapInputs.leavesUnknownTokenTransferSymbolsBlank,
    );
    expect(item.type).toBe('send');
    if (item.type !== 'send') {
      throw new Error(`Expected send item, got ${item.type}`);
    }

    expect(item.data.token).toStrictEqual({
      assetId: 'eip155:1/erc20:0x1111111111111111111111111111111111111111',
      direction: 'out',
    });
  });
  it('falls back to the txParams to when transfer data lacks a recipient', () => {
    const item = mapLocalTransaction(
      localTransactionFixtures.mapInputs.fallsBackToTheTxparamsTo,
    );
    expect(item).toMatchObject({
      type: 'send',
      data: { to: mainnetUsdt },
    });
  });
  it('uses the original transaction type and primary transaction status', () => {
    const item = mapLocalTransaction(
      localTransactionFixtures.mapInputs.usesTheOriginalTransactionTypeAnd,
    );
    expect(item).toStrictEqual({
      type: 'approveSpendingCap',
      chainId: 'eip155:59144',
      status: 'pending',
      timestamp: 1716367881000,
      hash: '0xretry',
      data: {
        from,
        token: {
          assetId:
            'eip155:59144/erc20:0x239FD4B0c4DB49Fa8660E65B97619D43D0E0A79d',
          decimals: 0,
          direction: 'out',
          symbol: 'TDN',
        },
      },
    });
  });
  it('maps a Permit2 approve to an approve spending cap without the Permit2 contract as the token', () => {
    const item = mapLocalTransaction(
      localTransactionFixtures.mapInputs.mapsAPermit2Approve,
    );
    expect(item.type).toBe('approveSpendingCap');
    const token =
      item.type === 'approveSpendingCap' ? item.data.token : 'unset';
    expect(token).toBeUndefined();
  });
  it('falls back to transferInformation when txParams.to is not a valid address', () => {
    const item = mapLocalTransaction(
      localTransactionFixtures.mapInputs
        .fallsBackToTransferinformationWhenTxparams,
    );
    expect(item).toMatchObject({
      type: 'approveSpendingCap',
      data: {
        token: {
          direction: 'out',
          symbol: 'mUSD',
          assetId: formatAddressToAssetId(lineaMusd, 'eip155:59144'),
        },
      },
    });
  });
  it('omits the approved amount for a token approve (mirrors the API path)', () => {
    const item = mapLocalTransaction(
      localTransactionFixtures.mapInputs.omitsTheApprovedAmountForA,
    );
    expect(item).toMatchObject({
      type: 'approveSpendingCap',
      data: {
        token: {
          direction: 'out',
          symbol: 'mUSD',
          assetId: formatAddressToAssetId(lineaMusd, 'eip155:59144'),
        },
      },
    });
    expect(
      item.type === 'approveSpendingCap' ? item.data.token?.amount : 'unset',
    ).toBeUndefined();
  });
  it('maps a zero-amount token approve to a revoke spending cap', () => {
    const item = mapLocalTransaction(
      localTransactionFixtures.mapInputs.mapsAZeroAmountTokenApprove,
    );
    expect(item.type).toBe('approveSpendingCap');
  });
  it('maps a setApprovalForAll group type to an approve spending cap', () => {
    const item = mapLocalTransaction(
      localTransactionFixtures.mapInputs.mapsASetapprovalforallGroupTypeTo,
    );
    expect(item).toMatchObject({
      type: 'approveSpendingCap',
      data: {
        token: {
          direction: 'out',
          assetId: formatAddressToAssetId(baseUsdc, 'eip155:8453'),
        },
      },
    });
  });
  it('maps an increaseAllowance to an increase spending cap', () => {
    const item = mapLocalTransaction(
      localTransactionFixtures.mapInputs.mapsAnIncreaseallowanceToAnIncrease,
    );
    expect(item).toMatchObject({
      type: 'increaseSpendingCap',
      data: {
        token: {
          direction: 'out',
          assetId: formatAddressToAssetId(baseUsdc, 'eip155:8453'),
        },
      },
    });
  });
  it('maps an explicit lendingDeposit type', () => {
    const item = mapLocalTransaction(
      localTransactionFixtures.mapInputs.mapsAnExplicitLendingdepositType,
    );
    expect(item).toMatchObject({ type: 'lendingDeposit', data: { from } });
  });
  it('maps a stakingDeposit type to a deposit activity', () => {
    const item = mapLocalTransaction(
      localTransactionFixtures.mapInputs.mapsAStakingdepositTypeToA,
    );
    expect(item).toMatchObject({
      type: 'deposit',
      data: { from },
    });
  });
  it('maps an incoming token transfer to a Receive activity', () => {
    const item = mapLocalTransaction(
      localTransactionFixtures.mapInputs.mapsAnIncomingTokenTransferTo,
    );
    expect(item).toMatchObject({
      type: 'receive',
      data: {
        token: { direction: 'in', symbol: 'USDC', amount: '100000' },
      },
    });
  });
  it('maps an incoming native transfer to a Receive activity', () => {
    const item = mapLocalTransaction(
      localTransactionFixtures.mapInputs.mapsAnIncomingNativeTransferTo,
    );
    expect(item).toMatchObject({
      type: 'receive',
      data: { token: { direction: 'in', symbol: 'ETH' } },
    });
  });
  it('maps an mUSD conversion to a Convert activity', () => {
    const item = mapLocalTransaction(
      localTransactionFixtures.mapInputs.mapsAnMusdConversionToA,
    );
    expect(item).toStrictEqual({
      type: 'convert',
      chainId: 'eip155:59144',
      status: 'success',
      timestamp: 1779805800000,
      hash: '0xmusdconversion',
      data: {
        from,
        sourceToken: {
          assetId: formatAddressToAssetId(lineaDai, 'eip155:59144'),
          decimals: 18,
          direction: 'out',
          symbol: 'DAI',
        },
        destinationToken: {
          amount: '100099',
          assetId: formatAddressToAssetId(lineaMusd, 'eip155:59144'),
          decimals: 6,
          direction: 'in',
          symbol: 'mUSD',
        },
      },
    });
  });
  it('maps a Perps withdrawal local transaction to a Perps withdraw funds activity', () => {
    const item = mapLocalTransaction(
      localTransactionFixtures.mapInputs.mapsAPerpsWithdrawalLocalTransaction,
    );
    expect(item).toMatchObject({
      type: 'perpsWithdraw',
      chainId: 'eip155:42161',
      status: 'success',
      timestamp: 1780690942752,
      hash: '0xd5dbb4421d123fd16d16485c394a68b5a28d9b5da9d9973554258a9fd2e9ebf6',
      data: {
        fiat: {
          amount: '0.714705',
        },
        networkFee: {
          amount: '0',
        },
        token: {
          assetId: formatAddressToAssetId(
            '0xaf88d065e77c8cc2239327c5edb3a432268e5831',
            'eip155:42161',
          ),
          direction: 'out',
        },
      },
    });
  });
  it('maps a Perps deposit local transaction to a Perps add funds activity', () => {
    const item = mapLocalTransaction(
      localTransactionFixtures.mapInputs.mapsAPerpsDepositLocalTransaction,
    );
    expect(item).toMatchObject({
      type: 'perpsAddFunds',
      chainId: 'eip155:42161',
      status: 'success',
      timestamp: 1781185241609,
      hash: '0x3073fa67020abb1931ed043d7a8b6b020aa1004c9d0dd9ebd43ca5b9c10e9503',
      data: {
        fiat: {
          amount: '1.000169',
        },
        networkFee: {
          amount: '0.04143764111397638042',
        },
        token: {
          assetId: formatAddressToAssetId(
            '0xaf88d065e77c8cc2239327c5edb3a432268e5831',
            'eip155:42161',
          ),
          direction: 'out',
        },
      },
    });
  });
  it('maps a perps deposit without a target address to a tokenless add funds activity', () => {
    const item = mapLocalTransaction(
      localTransactionFixtures.mapInputs.mapsAPerpsDepositWithoutA,
    );
    expect(item).toMatchObject({
      type: 'perpsAddFunds',
      data: { token: undefined, fiat: undefined, networkFee: undefined },
    });
  });
  it('maps an Aave supply contract interaction to a Lending deposit activity', () => {
    const item = mapLocalTransaction(
      localTransactionFixtures.mapInputs.mapsAnAaveSupplyContractInteraction,
    );
    expect(item).toStrictEqual({
      type: 'lendingDeposit',
      chainId: 'eip155:8453',
      status: 'success',
      timestamp: 1779892154611,
      hash: '0x093844dd6200984f0e27d3c3a76b7a63b360bfb2136213237d693afd2cd69740',
      data: {
        from,
      },
    });
  });
  it('maps a native-asset Lido stake contract interaction to a Lending deposit activity', () => {
    const item = mapLocalTransaction(
      localTransactionFixtures.mapInputs
        .mapsALidoNativeStakeContractInteraction,
    );
    expect(item).toStrictEqual({
      type: 'lendingDeposit',
      chainId: 'eip155:1',
      status: 'success',
      timestamp: 1782912963672,
      hash: '0xd8ca1456ed6305ec3d9c058f28a1ba48eb335ffcffd7d7c4321d3169c29e6a07',
      data: {
        from,
      },
    });
  });
  it('maps a withdraw contract interaction from the received token transfer', () => {
    const item = mapLocalTransaction(
      localTransactionFixtures.mapInputs.mapsAWithdrawContractInteractionFrom,
    );
    expect(item).toStrictEqual({
      type: 'lendingWithdrawal',
      chainId: 'eip155:8453',
      status: 'success',
      timestamp: 1779912434153,
      hash: '0x26f4911467b538702c0945e4ec5e303de44c0c1c174897141d1b548ea3161795',
      data: {
        from,
        destinationToken: {
          amount: '200000',
          assetId: formatAddressToAssetId(baseUsdc, 'eip155:8453'),
          decimals: 6,
          direction: 'in',
          symbol: 'USDC',
        },
      },
    });
  });
  it('sets no destination token amount when the received transfer log data is not a valid amount', () => {
    const base =
      localTransactionFixtures.mapInputs.mapsAWithdrawContractInteractionFrom;
    const item = mapLocalTransaction({
      ...base,
      initialTransaction: {
        ...base.initialTransaction,
        txReceipt: {
          logs: (base.initialTransaction.txReceipt?.logs ?? []).map((log) => ({
            ...log,
            data: 'not-a-hex-amount',
          })),
        },
      },
    });
    expect(item.type).toBe('lendingWithdrawal');
    expect(
      item.type === 'lendingWithdrawal'
        ? item.data.destinationToken?.amount
        : 'unset',
    ).toBeUndefined();
  });
  it('maps a withdraw contract interaction without a matching log to no destination token', () => {
    const item = mapLocalTransaction(
      localTransactionFixtures.mapInputs
        .mapsAWithdrawContractInteractionWithout,
    );
    expect(item).toMatchObject({
      type: 'lendingWithdrawal',
      data: { from, destinationToken: undefined },
    });
  });
  it('maps bridge history token data to a local swap', () => {
    const item = mapLocalTransaction(
      localTransactionFixtures.mapInputs.mapsBridgeHistoryTokenDataTo,
    );
    expect(item).toMatchObject({
      type: 'swap',
      chainId: 'eip155:1',
      status: 'success',
      timestamp: 1779392463306,
      hash: '0xbridgeswap',
      data: {
        from,
        sourceToken: {
          amount: '10000000000000',
          assetId: 'eip155:1/slip44:60',
          decimals: 18,
          direction: 'out',
          symbol: 'ETH',
        },
        destinationToken: {
          amount: '19546',
          assetId: 'eip155:1/erc20:0xACa92e438df0B2401fF60Da7E4337B687a2435dA',
          decimals: 6,
          direction: 'in',
          symbol: 'MUSD',
        },
      },
    });
  });
  it('maps a swap without a destination token to a swap with only a source', () => {
    const item = mapLocalTransaction(
      localTransactionFixtures.mapInputs.mapsASwapWithoutADestination,
    );
    expect(item).toMatchObject({
      type: 'swap',
      data: { from },
    });
  });
  it('uses a bridge history activity status override', () => {
    const item = mapLocalTransaction(
      localTransactionFixtures.mapInputs.usesABridgeHistoryActivityStatus,
    );
    expect(item.status).toBe('failed');
  });
  it('maps a local bridge network fee from the transaction receipt', () => {
    const item = mapLocalTransaction(
      localTransactionFixtures.mapInputs.mapsALocalBridgeNetworkFee,
    );
    expect(item).toMatchObject({
      type: 'bridge',
      data: {
        fees: [
          {
            type: 'base',
            amount: String(BigInt('0x24405') * BigInt('0x6fc23ac1d')),
            assetId: 'eip155:42161/slip44:60',
            decimals: 18,
            symbol: 'ETH',
          },
        ],
      },
    });
  });
  it('maps swap metadata token symbols to a Swap activity', () => {
    const item = mapLocalTransaction(
      localTransactionFixtures.mapInputs.mapsSwapMetadataTokenSymbolsTo,
    );
    expect(item).toMatchObject({
      type: 'swap',
      chainId: 'eip155:8453',
      status: 'success',
      timestamp: 1716367781000,
      hash: '0xswap',
      data: { from },
    });
  });
  it('uses native source symbol for a legacy swap with native value and no source metadata', () => {
    const item = mapLocalTransaction(
      localTransactionFixtures.mapInputs.usesNativeSourceSymbolForA,
    );
    expect(item).toMatchObject({
      type: 'swap',
      data: { from },
    });
  });
  it('maps a legacy swap with an invalid native value without throwing', () => {
    const item = mapLocalTransaction(
      localTransactionFixtures.mapInputs.mapsALegacySwapWithAn,
    );
    expect(item).toMatchObject({
      type: 'swap',
      data: { from },
    });
  });
  it('maps a WETH9 deposit contract interaction to a Wrap activity', () => {
    const item = mapLocalTransaction(
      localTransactionFixtures.mapInputs.mapsAWeth9DepositContractInteraction,
    );
    expect(item).toStrictEqual({
      type: 'wrap',
      chainId: 'eip155:1',
      status: 'success',
      timestamp: 1716367781000,
      hash: '0xwrap',
      data: {
        from,
        sourceToken: {
          amount: '0x3782dace9d900000',
          assetId: 'eip155:1/slip44:60',
          decimals: 18,
          direction: 'out',
          symbol: 'ETH',
        },
        destinationToken: {
          amount: '0x3782dace9d900000',
          assetId: formatAddressToAssetId(wethContractAddress, 'eip155:1'),
          decimals: 18,
          direction: 'in',
        },
      },
    });
  });
  it('treats a WETH9 deposit with zero native value as a contract interaction', () => {
    const item = mapLocalTransaction(
      localTransactionFixtures.mapInputs.treatsAWeth9DepositWithZero,
    );
    expect(item.type).toBe('contractInteraction');
  });
  it('maps a WETH9 withdraw contract interaction to an Unwrap activity', () => {
    const unwrapAmount = '1000000000000000000';
    const item = mapLocalTransaction(
      localTransactionFixtures.mapInputs.mapsAWeth9WithdrawContractInteraction,
    );
    expect(item).toStrictEqual({
      type: 'unwrap',
      chainId: 'eip155:1',
      status: 'success',
      timestamp: 1716367781000,
      hash: '0xunwrap',
      data: {
        from,
        sourceToken: {
          amount: unwrapAmount,
          assetId: formatAddressToAssetId(wethContractAddress, 'eip155:1'),
          decimals: 18,
          direction: 'out',
        },
        destinationToken: {
          amount: unwrapAmount,
          assetId: 'eip155:1/slip44:60',
          decimals: 18,
          direction: 'in',
          symbol: 'ETH',
        },
      },
    });
  });
  it('maps a WETH9 unwrap with malformed amount data to an unwrap without amount', () => {
    const item = mapLocalTransaction(
      localTransactionFixtures.mapInputs.mapsAWeth9UnwrapWithMalformed,
    );
    expect(item).toMatchObject({
      type: 'unwrap',
      data: { destinationToken: { direction: 'in', symbol: 'ETH' } },
    });
  });
  it('maps a native value contract interaction with an outgoing token', () => {
    const item = mapLocalTransaction(
      localTransactionFixtures.mapInputs.mapsANativeValueContractInteraction,
    );
    expect(item).toStrictEqual({
      type: 'contractInteraction',
      chainId: 'eip155:1',
      status: 'success',
      timestamp: 1716367781000,
      hash: '0xcontract',
      data: {
        from,
        to,
        token: {
          amount: '0x3782dace9d900000',
          assetId: 'eip155:1/slip44:60',
          decimals: 18,
          direction: 'out',
          symbol: 'ETH',
        },
        methodId: '0xd0e30db0',
      },
    });
  });
  it('maps a zero-value contract interaction without a token', () => {
    const item = mapLocalTransaction(
      localTransactionFixtures.mapInputs.mapsAZeroValueContractInteraction,
    );
    expect(item).toMatchObject({
      type: 'contractInteraction',
      data: { from, to, methodId: '0x12345678' },
    });
    expect(
      item.type === 'contractInteraction' ? item.data.token : undefined,
    ).toBeUndefined();
  });
  it('maps a contract interaction without a value to a tokenless interaction', () => {
    const item = mapLocalTransaction(
      localTransactionFixtures.mapInputs.mapsAContractInteractionWithoutA,
    );
    expect(item.type).toBe('contractInteraction');
  });
  it('maps a contract interaction with an invalid value without throwing', () => {
    expect(() =>
      mapLocalTransaction(
        localTransactionFixtures.mapInputs.mapsAContractInteractionWithAn,
      ),
    ).not.toThrow();
    expect(
      mapLocalTransaction(
        localTransactionFixtures.mapInputs.mapsAContractInteractionWithAn,
      ).type,
    ).toBe('contractInteraction');
  });
  it('maps a local contract interaction with an incoming NFT simulation change to an NFT buy', () => {
    const item = mapLocalTransaction(
      localTransactionFixtures.mapInputs.mapsALocalContractInteractionWith,
    );
    expect(item).toStrictEqual({
      type: 'nftBuy',
      chainId: 'eip155:1',
      status: 'success',
      timestamp: 1780606867763,
      hash: '0x2fda37c5b591c30367649c3c317621429bb5c59ff6a77b0a8cd48b56897168bc',
      data: {
        from,
      },
    });
  });
  it('maps a smart transaction status to a pending activity', () => {
    expect(
      mapLocalTransaction(
        localTransactionFixtures.mapInputs.mapsASmartTransactionStatusTo,
      ).status,
    ).toBe('pending');
  });
  it('maps a successful smart transaction to a success activity', () => {
    expect(
      mapLocalTransaction(
        localTransactionFixtures.mapInputs.mapsASuccessfulSmartTransactionTo,
      ).status,
    ).toBe('success');
  });
  it('maps a cancelled smart transaction to a failed activity', () => {
    expect(
      mapLocalTransaction(
        localTransactionFixtures.mapInputs.mapsACancelledSmartTransactionTo,
      ).status,
    ).toBe('failed');
  });
  it('maps an unknown smart transaction status to a pending activity', () => {
    expect(
      mapLocalTransaction(
        localTransactionFixtures.mapInputs.mapsAnUnknownSmartTransactionStatus,
      ).status,
    ).toBe('pending');
  });
  it('maps a failed transaction receipt status to a failed activity', () => {
    expect(
      mapLocalTransaction(
        localTransactionFixtures.mapInputs.mapsAFailedTransactionReceiptStatus,
      ).status,
    ).toBe('failed');
  });
  it('maps a cancelled transaction group to a failed activity', () => {
    expect(
      mapLocalTransaction(
        localTransactionFixtures.mapInputs.mapsACancelledTransactionGroupTo,
      ).status,
    ).toBe('failed');
  });
  it('maps a dropped transaction to a failed activity', () => {
    expect(
      mapLocalTransaction(
        localTransactionFixtures.mapInputs.mapsADroppedTransactionToA,
      ).status,
    ).toBe('failed');
  });
  it('maps an unapproved transaction to a pending activity', () => {
    expect(
      mapLocalTransaction(
        localTransactionFixtures.mapInputs.mapsAnUnapprovedTransactionToA,
      ).status,
    ).toBe('pending');
  });
  it('maps a status outside the known set to a pending activity', () => {
    expect(
      mapLocalTransaction(
        localTransactionFixtures.mapInputs.mapsAStatusOutsideTheKnown,
      ).status,
    ).toBe('pending');
  });
  it('uses precomputed fees from the transaction group when present', () => {
    const fees = [{ type: 'base', amount: '7', symbol: 'ETH' }];
    const item = mapLocalTransaction(
      localTransactionFixtures.mapInputs.usesPrecomputedFeesFromTheTransaction,
    );
    expect(item).toMatchObject({ type: 'bridge', data: { fees } });
  });
  it('maps a local bridge fee using txParams gasPrice when no receipt price is present', () => {
    const item = mapLocalTransaction(
      localTransactionFixtures.mapInputs.mapsALocalBridgeFeeUsing,
    );
    expect(item).toMatchObject({
      type: 'bridge',
      data: {
        fees: [
          {
            type: 'base',
            amount: String(BigInt('0x100') * BigInt('0x10')),
            symbol: 'ETH',
          },
        ],
      },
    });
  });
  it('maps a local bridge with an invalid fee input to no fees', () => {
    const item = mapLocalTransaction(
      localTransactionFixtures.mapInputs.mapsALocalBridgeWithAn,
    );
    expect(item).toMatchObject({ type: 'bridge', data: { fees: undefined } });
  });
  it('maps a token transfer without a contract address to a tokenless send', () => {
    const item = mapLocalTransaction(
      localTransactionFixtures.mapInputs.mapsATokenTransferWithoutA,
    );
    expect(item.type).toBe('send');
    expect(item.type === 'send' ? item.data.token : 'unset').toBeUndefined();
  });
  it('maps a WETH9 unwrap with non-hex amount data to an unwrap without amount', () => {
    const item = mapLocalTransaction(
      localTransactionFixtures.mapInputs.mapsAWeth9UnwrapWithNon,
    );
    expect(item).toMatchObject({
      type: 'unwrap',
      data: { destinationToken: { direction: 'in', symbol: 'ETH' } },
    });
    expect(
      item.type === 'unwrap' ? item.data.sourceToken?.amount : 'unset',
    ).toBeUndefined();
  });
  it('falls back to initial transaction id and empty addresses when fields are missing', () => {
    const item = mapLocalTransaction(
      localTransactionFixtures.mapInputs.fallsBackToInitialTransactionId,
    );
    expect(item).toMatchObject({
      type: 'send',
      hash: 'primary-fallback-id',
      timestamp: 1716367781000,
      data: {
        from: '',
        to: '',
        token: { direction: 'out', symbol: 'ETH' },
      },
    });
    expect(
      item.type === 'send' ? item.data.token?.amount : 'unset',
    ).toBeUndefined();
  });
  it('handles token transfers on a chain without a wrapped-native token entry', () => {
    const item = mapLocalTransaction(
      localTransactionFixtures.mapInputs.handlesTokenTransfersOnAChain,
    );
    expect(item).toMatchObject({
      type: 'send',
      chainId: 'eip155:1338',
      data: { token: { direction: 'out' } },
    });
  });
  it('maps a token transfer with no calldata to a tokenless send', () => {
    const item = mapLocalTransaction(
      localTransactionFixtures.mapInputs.mapsATokenTransferWithNo,
    );
    expect(item.type).toBe('send');
  });
  it('wraps native value on a chain without canonical native asset metadata', () => {
    const item = mapLocalTransaction(
      localTransactionFixtures.mapInputs.wrapsNativeValueOnAChain,
    );
    expect(item).toMatchObject({
      type: 'wrap',
      chainId: 'eip155:1337',
      data: {
        destinationToken: {
          direction: 'in',
          decimals: 18,
          amount: '0x3782dace9d900000',
        },
      },
    });
  });
  it('defaults missing txParams fields when txParams is omitted', () => {
    const base = localTransactionFixtures.mapInputs.mapsAnMusdConversionWithNo;
    const item = mapLocalTransaction({
      ...base,
      initialTransaction: {
        chainId: base.initialTransaction.chainId,
        id: base.initialTransaction.id,
        hash: base.initialTransaction.hash,
        status: base.initialTransaction.status,
        time: base.initialTransaction.time,
        type: base.initialTransaction.type,
      },
      primaryTransaction: base.primaryTransaction,
    });

    expect(item).toMatchObject({
      type: 'convert',
      data: { from: '', destinationToken: undefined },
    });
  });
  it('maps an mUSD conversion for an unknown destination token without optional metadata fields', () => {
    const base = localTransactionFixtures.mapInputs.mapsAnMusdConversionWithNo;
    const item = mapLocalTransaction({
      ...base,
      initialTransaction: {
        ...base.initialTransaction,
        chainId: '0x53a',
        txParams: {
          from,
          to: 'not-an-address',
        },
      },
      primaryTransaction: {
        ...base.primaryTransaction,
        chainId: '0x53a',
        txParams: {
          from,
          to: 'not-an-address',
        },
      },
    });

    expect(item).toMatchObject({
      type: 'convert',
      data: {
        destinationToken: {
          direction: 'in',
        },
      },
    });
    expect(
      item.type === 'convert' ? item.data.destinationToken : undefined,
    ).toStrictEqual({ direction: 'in' });
  });
  it('maps an mUSD conversion with transferInformation amount to convert decimals from transferInformation', () => {
    const base = localTransactionFixtures.mapInputs.mapsAnMusdConversionToA;
    const item = mapLocalTransaction({
      ...base,
      initialTransaction: {
        ...base.initialTransaction,
        transferInformation: {
          amount: '100000',
          decimals: 6,
        },
      },
    });

    expect(item).toMatchObject({
      type: 'convert',
      data: {
        destinationToken: {
          direction: 'in',
          amount: '100000',
          decimals: 6,
        },
      },
    });
  });
  it('maps an mUSD conversion with no calldata to a convert without a destination amount', () => {
    const item = mapLocalTransaction(
      localTransactionFixtures.mapInputs.mapsAnMusdConversionWithNo,
    );
    expect(item).toMatchObject({
      type: 'convert',
      data: { destinationToken: { direction: 'in', symbol: 'mUSD' } },
    });
    expect(
      item.type === 'convert' ? item.data.destinationToken?.amount : 'unset',
    ).toBeUndefined();
  });
  it('maps an mUSD conversion with invalid calldata amount to a convert without a destination amount', () => {
    const base = localTransactionFixtures.mapInputs.mapsAnMusdConversionToA;
    const invalidAmountData = `0x${'0'.repeat(72)}zz${'0'.repeat(64)}`;
    const item = mapLocalTransaction({
      ...base,
      initialTransaction: {
        ...base.initialTransaction,
        txParams: {
          ...base.initialTransaction.txParams,
          data: invalidAmountData,
        },
      },
      primaryTransaction: {
        ...base.primaryTransaction,
        txParams: {
          ...base.primaryTransaction.txParams,
          data: invalidAmountData,
        },
      },
    });

    expect(item).toMatchObject({
      type: 'convert',
      data: { destinationToken: { direction: 'in', symbol: 'mUSD' } },
    });
    expect(
      item.type === 'convert' ? item.data.destinationToken?.amount : 'unset',
    ).toBeUndefined();
  });
  it('maps an mUSD conversion without a destination contract to a convert without a destination token', () => {
    const base = localTransactionFixtures.mapInputs.mapsAnMusdConversionWithNo;
    const item = mapLocalTransaction({
      ...base,
      initialTransaction: {
        ...base.initialTransaction,
        txParams: { from },
      },
      primaryTransaction: {
        ...base.primaryTransaction,
        txParams: { from },
      },
    });

    expect(item).toMatchObject({
      type: 'convert',
      data: { destinationToken: undefined },
    });
  });
  it('maps a token approve with no calldata to an approve spending cap', () => {
    const item = mapLocalTransaction(
      localTransactionFixtures.mapInputs.mapsATokenApproveWithNo,
    );
    expect(item).toMatchObject({
      type: 'approveSpendingCap',
      data: { token: { direction: 'out' } },
    });
  });
  it('ignores withdraw logs that have no recipient topic', () => {
    const item = mapLocalTransaction(
      localTransactionFixtures.mapInputs.ignoresWithdrawLogsThatHaveNo,
    );
    expect(item).toMatchObject({
      type: 'lendingWithdrawal',
      data: { destinationToken: undefined },
    });
  });
  it('maps a token transferFrom to a Send activity', () => {
    expect(
      mapLocalTransaction(
        localTransactionFixtures.mapInputs.mapsATokenTransferfromToA,
      ).type,
    ).toBe('send');
  });
  it('maps a safeTransferFrom to a Send activity', () => {
    expect(
      mapLocalTransaction(
        localTransactionFixtures.mapInputs.mapsASafetransferfromToASend,
      ).type,
    ).toBe('send');
  });
  it('maps a swapAndSend to a swap activity', () => {
    expect(
      mapLocalTransaction(
        localTransactionFixtures.mapInputs.mapsASwapandsendToASwap,
      ).type,
    ).toBe('swap');
  });
  it('maps a perpsDepositAndOrder to an add funds activity', () => {
    expect(
      mapLocalTransaction(
        localTransactionFixtures.mapInputs.mapsAPerpsdepositandorderToAnAdd,
      ).type,
    ).toBe('perpsAddFunds');
  });
  it('maps a bridgeApproval to an approve spending cap', () => {
    expect(
      mapLocalTransaction(
        localTransactionFixtures.mapInputs.mapsABridgeapprovalToAnApprove,
      ).type,
    ).toBe('approveSpendingCap');
  });
  it('maps a shieldSubscriptionApprove to an approve spending cap', () => {
    expect(
      mapLocalTransaction(
        localTransactionFixtures.mapInputs
          .mapsAShieldsubscriptionapproveToAnApprove,
      ).type,
    ).toBe('approveSpendingCap');
  });
  it('maps a tokenMethodSetApprovalForAll to an approve spending cap', () => {
    expect(
      mapLocalTransaction(
        localTransactionFixtures.mapInputs
          .mapsATokenmethodsetapprovalforallToAnApprove,
      ).type,
    ).toBe('approveSpendingCap');
  });
  it('omits the assetId when the token contract address cannot be encoded', () => {
    const item = mapLocalTransaction(
      localTransactionFixtures.mapInputs.omitsTheAssetidWhenTheToken,
    );
    expect(item.type).toBe('send');
    expect(item.type === 'send' ? item.data.token : undefined).toStrictEqual({
      direction: 'out',
    });
  });
  it('ignores withdraw logs that omit topics entirely', () => {
    const item = mapLocalTransaction(
      localTransactionFixtures.mapInputs.ignoresWithdrawLogsThatOmitTopics,
    );
    expect(item).toMatchObject({
      type: 'lendingWithdrawal',
      data: { destinationToken: undefined },
    });
  });
  it('maps musdClaim to claimMusdBonus with from address', () => {
    const item = mapLocalTransaction(
      localTransactionFixtures.mapInputs.mapsMusdclaimToClaimmusdbonusWithFrom,
    );
    expect(item).toMatchObject({
      type: 'claimMusdBonus',
      chainId: 'eip155:59144',
      status: 'pending',
      timestamp: 1778633325000,
      hash: '0xmusdclaim',
      data: {
        from,
      },
    });
  });
});
