import { Interface } from '@ethersproject/abi';
import type { TransactionMeta } from '@metamask/transaction-controller';
import { TransactionType } from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';

import {
  NATIVE_TOKEN_ADDRESS,
  TransactionPayStrategy,
} from '../../constants.js';
import type { TransactionPayQuote } from '../../types.js';
import { getNetworkClientId } from '../../utils/provider.js';
import {
  buildCaipAssetType,
  getLiveTokenBalance,
  getNativeToken,
  getTokenInfo,
} from '../../utils/token.js';
import { waitForTransactionConfirmed } from '../../utils/transaction.js';
import { fundFiatOrderFromTestSource } from './fiat-test-funding.js';
import type { FiatQuote } from './types.js';
import { deriveFiatAssetForFiatPayment } from './utils.js';

jest.mock('../../utils/provider');
jest.mock('../../utils/token');
jest.mock('../../utils/transaction');
jest.mock('./utils', () => ({
  ...jest.requireActual('./utils'),
  deriveFiatAssetForFiatPayment: jest.fn(),
}));

const CHAIN_ID_MOCK = '0x8f' as Hex;
const FIAT_ASSET_ADDRESS_MOCK =
  '0x2222222222222222222222222222222222222222' as Hex;
const FUNDING_SOURCE_MOCK = '0x3333333333333333333333333333333333333333' as Hex;
const MONEY_ACCOUNT_ADDRESS_MOCK =
  '0x4444444444444444444444444444444444444444' as Hex;
const RECIPIENT_ADDRESS_MOCK =
  '0x5555555555555555555555555555555555555555' as Hex;
const TX_HASH_MOCK = '0xtxhash' as Hex;
const TX_ID_MOCK = 'funding-tx-id';
const TOKEN_TRANSFER_INTERFACE = new Interface([
  'function transfer(address to, uint256 amount)',
]);

const TRANSACTION_MOCK = {
  id: 'tx-id',
  txParams: {
    from: MONEY_ACCOUNT_ADDRESS_MOCK,
  },
  type: TransactionType.moneyAccountDeposit,
} as TransactionMeta;

function getFiatQuoteMock({
  isDirectMusdMoneyAccount = false,
  sourceTokenAddress = FIAT_ASSET_ADDRESS_MOCK,
}: {
  isDirectMusdMoneyAccount?: boolean;
  sourceTokenAddress?: Hex;
} = {}): TransactionPayQuote<FiatQuote> {
  return {
    dust: { fiat: '0', usd: '0' },
    estimatedDuration: 1,
    fees: {
      metaMask: { fiat: '0', usd: '0' },
      provider: { fiat: '0', usd: '0' },
      sourceNetwork: {
        estimate: { fiat: '0', human: '0', raw: '0', usd: '0' },
        max: { fiat: '0', human: '0', raw: '0', usd: '0' },
      },
      targetNetwork: { fiat: '0', usd: '0' },
    },
    original: {
      rampsQuote: {
        provider: '/providers/test',
        quote: {
          amountOut: 12.34,
        },
      } as never,
      relayQuote: {} as never,
    },
    request: {
      from: RECIPIENT_ADDRESS_MOCK,
      isDirectMusdMoneyAccount,
      recipient: MONEY_ACCOUNT_ADDRESS_MOCK,
      sourceBalanceRaw: '12340000',
      sourceChainId: CHAIN_ID_MOCK,
      sourceTokenAddress,
      sourceTokenAmount: '12340000',
      targetAmountMinimum: '12340000',
      targetChainId: CHAIN_ID_MOCK,
      targetTokenAddress: sourceTokenAddress,
    },
    sourceAmount: { fiat: '0', human: '0', raw: '12340000', usd: '0' },
    strategy: TransactionPayStrategy.Fiat,
    targetAmount: { fiat: '0', usd: '0' },
  };
}

function getMessengerMock(): {
  addTransactionMock: jest.Mock;
  messenger: never;
} {
  const addTransactionMock = jest.fn().mockResolvedValue({
    result: Promise.resolve(TX_HASH_MOCK),
    transactionMeta: { id: TX_ID_MOCK },
  });

  return {
    addTransactionMock,
    messenger: {
      call: jest.fn((action: string, ...args: unknown[]) => {
        if (action === 'TransactionController:addTransaction') {
          return addTransactionMock(...args);
        }

        throw new Error(`Unexpected action: ${action}`);
      }),
    } as never,
  };
}

describe('fundFiatOrderFromTestSource', () => {
  const deriveFiatAssetForFiatPaymentMock = jest.mocked(
    deriveFiatAssetForFiatPayment,
  );
  const getLiveTokenBalanceMock = jest.mocked(getLiveTokenBalance);
  const getNativeTokenMock = jest.mocked(getNativeToken);
  const getNetworkClientIdMock = jest.mocked(getNetworkClientId);
  const getTokenInfoMock = jest.mocked(getTokenInfo);
  const buildCaipAssetTypeMock = jest.mocked(buildCaipAssetType);
  const waitForTransactionConfirmedMock = jest.mocked(
    waitForTransactionConfirmed,
  );

  beforeEach(() => {
    jest.resetAllMocks();

    deriveFiatAssetForFiatPaymentMock.mockReturnValue({
      address: FIAT_ASSET_ADDRESS_MOCK,
      chainId: CHAIN_ID_MOCK,
    });
    getLiveTokenBalanceMock
      .mockResolvedValueOnce('12340000')
      .mockResolvedValueOnce('1');
    getNativeTokenMock.mockReturnValue(NATIVE_TOKEN_ADDRESS);
    getNetworkClientIdMock.mockReturnValue('network-client-id');
    getTokenInfoMock.mockReturnValue({ decimals: 6, symbol: 'MUSD' });
    buildCaipAssetTypeMock.mockReturnValue(
      `eip155:143/erc20:${FIAT_ASSET_ADDRESS_MOCK}` as never,
    );
    waitForTransactionConfirmedMock.mockResolvedValue();
  });

  function getFiatTestOptions({
    testAmountOverride,
  }: { testAmountOverride?: string } = {}): {
    testAmountOverride: string | undefined;
    testFundingSource: Hex;
  } {
    return {
      testAmountOverride,
      testFundingSource: FUNDING_SOURCE_MOCK,
    };
  }

  function buildTokenTransferData(recipient: Hex, amountRaw: string): Hex {
    return TOKEN_TRANSFER_INTERFACE.encodeFunctionData('transfer', [
      recipient,
      amountRaw,
    ]) as Hex;
  }

  it('transfers ERC-20 fiat asset from test source and returns synthetic completed order', async () => {
    const { addTransactionMock, messenger } = getMessengerMock();

    const order = await fundFiatOrderFromTestSource({
      fiat: getFiatTestOptions(),
      messenger,
      quote: getFiatQuoteMock(),
      transaction: TRANSACTION_MOCK,
    });

    expect(addTransactionMock).toHaveBeenCalledWith(
      {
        data: buildTokenTransferData(RECIPIENT_ADDRESS_MOCK, '12340000'),
        from: FUNDING_SOURCE_MOCK,
        to: FIAT_ASSET_ADDRESS_MOCK,
        value: '0x0',
      },
      expect.objectContaining({
        isInternal: true,
        networkClientId: 'network-client-id',
        requireApproval: false,
        type: TransactionType.simpleSend,
      }),
    );
    expect(waitForTransactionConfirmedMock).toHaveBeenCalledWith(
      TX_ID_MOCK,
      messenger,
    );
    expect(order).toStrictEqual(
      expect.objectContaining({
        cryptoAmount: 12.34,
        status: 'COMPLETED',
        txHash: TX_HASH_MOCK,
      }),
    );
  });

  it('uses Money Account recipient and request source asset for direct mUSD quotes', async () => {
    const { addTransactionMock, messenger } = getMessengerMock();

    const order = await fundFiatOrderFromTestSource({
      fiat: getFiatTestOptions({ testAmountOverride: '0.1' }),
      messenger,
      quote: getFiatQuoteMock({ isDirectMusdMoneyAccount: true }),
      transaction: TRANSACTION_MOCK,
    });

    expect(deriveFiatAssetForFiatPaymentMock).not.toHaveBeenCalled();
    expect(addTransactionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: buildTokenTransferData(MONEY_ACCOUNT_ADDRESS_MOCK, '100000'),
        to: FIAT_ASSET_ADDRESS_MOCK,
      }),
      expect.anything(),
    );
    expect(order).toStrictEqual(
      expect.objectContaining({
        cryptoAmount: '0.1',
      }),
    );
  });

  it('submits native fiat asset transfer when fiat asset is native', async () => {
    deriveFiatAssetForFiatPaymentMock.mockReturnValue({
      address: NATIVE_TOKEN_ADDRESS,
      chainId: CHAIN_ID_MOCK,
    });
    getLiveTokenBalanceMock.mockReset();
    getLiveTokenBalanceMock.mockResolvedValue('12340001');
    const { addTransactionMock, messenger } = getMessengerMock();

    await fundFiatOrderFromTestSource({
      fiat: getFiatTestOptions(),
      messenger,
      quote: getFiatQuoteMock({ sourceTokenAddress: NATIVE_TOKEN_ADDRESS }),
      transaction: TRANSACTION_MOCK,
    });

    expect(addTransactionMock).toHaveBeenCalledWith(
      {
        from: FUNDING_SOURCE_MOCK,
        to: RECIPIENT_ADDRESS_MOCK,
        value: '0xbc4b20',
      },
      expect.anything(),
    );
  });

  it('throws if test funding source has insufficient fiat asset balance', async () => {
    getLiveTokenBalanceMock.mockReset();
    getLiveTokenBalanceMock.mockResolvedValue('1');
    const { addTransactionMock, messenger } = getMessengerMock();

    await expect(
      fundFiatOrderFromTestSource({
        fiat: getFiatTestOptions(),
        messenger,
        quote: getFiatQuoteMock(),
        transaction: TRANSACTION_MOCK,
      }),
    ).rejects.toThrow('Fiat test funding source has insufficient MUSD');

    expect(addTransactionMock).not.toHaveBeenCalled();
  });

  it('throws if test funding source is missing', async () => {
    const { messenger } = getMessengerMock();

    await expect(
      fundFiatOrderFromTestSource({
        fiat: { testAmountOverride: '0.1' },
        messenger,
        quote: getFiatQuoteMock(),
        transaction: TRANSACTION_MOCK,
      }),
    ).rejects.toThrow('Missing fiat test funding source');
  });

  it('throws if fiat asset token info cannot be resolved', async () => {
    const { messenger } = getMessengerMock();

    getTokenInfoMock.mockReturnValue(undefined);

    await expect(
      fundFiatOrderFromTestSource({
        fiat: getFiatTestOptions(),
        messenger,
        quote: getFiatQuoteMock(),
        transaction: TRANSACTION_MOCK,
      }),
    ).rejects.toThrow('Unable to resolve fiat test funding token info');
  });

  it('throws if direct mUSD transaction is missing a Money Account address', async () => {
    const { messenger } = getMessengerMock();

    await expect(
      fundFiatOrderFromTestSource({
        fiat: getFiatTestOptions(),
        messenger,
        quote: getFiatQuoteMock({ isDirectMusdMoneyAccount: true }),
        transaction: { ...TRANSACTION_MOCK, txParams: {} } as TransactionMeta,
      }),
    ).rejects.toThrow('Missing Money Account address for fiat test funding');
  });

  it('throws if test funding source has insufficient native gas', async () => {
    getLiveTokenBalanceMock.mockReset();
    getLiveTokenBalanceMock
      .mockResolvedValueOnce('12340000')
      .mockResolvedValueOnce('0');
    const { addTransactionMock, messenger } = getMessengerMock();

    await expect(
      fundFiatOrderFromTestSource({
        fiat: getFiatTestOptions(),
        messenger,
        quote: getFiatQuoteMock(),
        transaction: TRANSACTION_MOCK,
      }),
    ).rejects.toThrow('Fiat test funding source has insufficient native gas');

    expect(addTransactionMock).not.toHaveBeenCalled();
  });
});
