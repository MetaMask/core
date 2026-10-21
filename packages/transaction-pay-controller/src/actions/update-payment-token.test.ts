import type { TransactionMeta } from '@metamask/transaction-controller';
import type { CaipAssetType } from '@metamask/utils';
import { noop } from 'lodash-es';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { mockModuleExcept } from '../../tests/mock-module-except.js';
import type { TransactionData, TransactionPaymentToken } from '../types.js';
import {
  getAssetBalance,
  getAssetFiatRate,
  getAssetInfo,
  getTokenBalance,
  getTokenFiatRate,
  getTokenInfo,
} from '../utils/token.js';
import { getTransaction } from '../utils/transaction.js';
import { updatePaymentToken } from './update-payment-token.js';

vi.mock(import('../utils/token.js'), async (importOriginal) =>
  mockModuleExcept(await importOriginal(), ['computeTokenAmounts']),
);
vi.mock(import('../utils/transaction.js'));

const TOKEN_ADDRESS_MOCK = '0x123';
const CHAIN_ID_MOCK = '0x1';
const FROM_MOCK = '0x456';
const TRANSACTION_ID_MOCK = '123-456';

const ACCOUNT_OVERRIDE_MOCK = '0x789';

const PAYMENT_TOKEN_MOCK: TransactionPaymentToken = {
  address: TOKEN_ADDRESS_MOCK,
  balanceFiat: '2.46',
  balanceHuman: '1.23',
  balanceRaw: '1230000',
  balanceUsd: '3.69',
  chainId: CHAIN_ID_MOCK,
  decimals: 6,
  symbol: 'TST',
};

const SOLANA_CHAIN_ID_MOCK = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp';
const SOLANA_ADDRESS_MOCK = '7Ec4QeG8wF3RnTjHDrTuYP8hVV7WYuPFyM4hZUodkG6Z';
const SOLANA_WALLET_ACCOUNT_ID_MOCK = 'solana-account-uuid';
const SOL_ASSET_ID_MOCK: CaipAssetType = `${SOLANA_CHAIN_ID_MOCK}/slip44:501`;
const SPL_ASSET_ID_MOCK: CaipAssetType = `${SOLANA_CHAIN_ID_MOCK}/token:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`;

function createMessengerMock(
  transactionData: Record<string, unknown> = {},
): never {
  return {
    call: vi.fn().mockReturnValue({ transactionData }),
  } as never;
}

function createNonEvmMessengerMock({
  accounts = {
    [SOLANA_WALLET_ACCOUNT_ID_MOCK]: {
      address: SOLANA_ADDRESS_MOCK,
      scopes: [SOLANA_CHAIN_ID_MOCK],
    },
  },
}: { accounts?: Record<string, unknown> } = {}): never {
  return {
    call: vi.fn((action: string) =>
      action === 'AccountsController:getState'
        ? { internalAccounts: { accounts } }
        : { transactionData: {} },
    ),
  } as never;
}

describe('Update Payment Token Action', () => {
  const getTokenInfoMock = vi.mocked(getTokenInfo);
  const getTokenFiatRateMock = vi.mocked(getTokenFiatRate);
  const getTokenBalanceMock = vi.mocked(getTokenBalance);
  const getTransactionMock = vi.mocked(getTransaction);
  const getAssetBalanceMock = vi.mocked(getAssetBalance);
  const getAssetFiatRateMock = vi.mocked(getAssetFiatRate);
  const getAssetInfoMock = vi.mocked(getAssetInfo);

  beforeEach(() => {
    vi.resetAllMocks();

    getTokenInfoMock.mockReturnValue({
      decimals: PAYMENT_TOKEN_MOCK.decimals,
      symbol: PAYMENT_TOKEN_MOCK.symbol,
    });

    getTokenFiatRateMock.mockReturnValue({
      fiatRate: '2',
      usdRate: '3',
    });

    getTokenBalanceMock.mockReturnValue('1230000');

    getTransactionMock.mockReturnValue({
      id: TRANSACTION_ID_MOCK,
      txParams: { from: FROM_MOCK },
    } as TransactionMeta);
  });

  it('updates payment token', () => {
    const updateTransactionDataMock = vi.fn();
    const messenger = createMessengerMock({
      [TRANSACTION_ID_MOCK]: {
        quoteError: {
          message: 'No route found',
          reason: 'no-quotes',
        },
      },
    });

    updatePaymentToken(
      {
        chainId: CHAIN_ID_MOCK,
        tokenAddress: TOKEN_ADDRESS_MOCK,
        transactionId: TRANSACTION_ID_MOCK,
      },
      {
        messenger,
        updateTransactionData: updateTransactionDataMock,
      },
    );

    expect(getTokenBalanceMock).toHaveBeenCalledWith(
      messenger,
      FROM_MOCK,
      CHAIN_ID_MOCK,
      TOKEN_ADDRESS_MOCK,
    );

    expect(updateTransactionDataMock).toHaveBeenCalledTimes(1);

    const transactionDataMock = {
      quoteError: {
        message: 'No route found',
        reason: 'no-quotes',
      },
    } as TransactionData;
    updateTransactionDataMock.mock.calls[0][1](transactionDataMock);

    // EVM payment token state is unchanged by non-EVM support, so no CAIP
    // fields are added.
    expect(transactionDataMock.paymentToken).toStrictEqual({
      address: TOKEN_ADDRESS_MOCK,
      balanceFiat: '2.46',
      balanceHuman: '1.23',
      balanceRaw: '1230000',
      balanceUsd: '3.69',
      chainId: CHAIN_ID_MOCK,
      decimals: 6,
      symbol: 'TST',
    });

    expect(transactionDataMock.fiatPayment).toStrictEqual({});
    expect(transactionDataMock.quoteError).toBeUndefined();
  });

  it('uses accountOverride for balance lookup when set', () => {
    const updateTransactionDataMock = vi.fn();
    const messenger = createMessengerMock({
      [TRANSACTION_ID_MOCK]: { accountOverride: ACCOUNT_OVERRIDE_MOCK },
    });

    updatePaymentToken(
      {
        chainId: CHAIN_ID_MOCK,
        tokenAddress: TOKEN_ADDRESS_MOCK,
        transactionId: TRANSACTION_ID_MOCK,
      },
      {
        messenger,
        updateTransactionData: updateTransactionDataMock,
      },
    );

    expect(getTokenBalanceMock).toHaveBeenCalledWith(
      messenger,
      ACCOUNT_OVERRIDE_MOCK,
      CHAIN_ID_MOCK,
      TOKEN_ADDRESS_MOCK,
    );
  });

  it('throws if token info not found', () => {
    getTokenInfoMock.mockReturnValue(undefined);

    expect(() =>
      updatePaymentToken(
        {
          chainId: CHAIN_ID_MOCK,
          tokenAddress: TOKEN_ADDRESS_MOCK,
          transactionId: TRANSACTION_ID_MOCK,
        },
        {
          messenger: createMessengerMock(),
          updateTransactionData: noop,
        },
      ),
    ).toThrow('Payment token not found');
  });

  it('throws if fiat rate not found', () => {
    getTokenFiatRateMock.mockReturnValue(undefined);

    expect(() =>
      updatePaymentToken(
        {
          chainId: CHAIN_ID_MOCK,
          tokenAddress: TOKEN_ADDRESS_MOCK,
          transactionId: TRANSACTION_ID_MOCK,
        },
        {
          messenger: createMessengerMock(),
          updateTransactionData: noop,
        },
      ),
    ).toThrow('Payment token not found');
  });

  it('resolves with zeroed fiat when rate not found and transaction is post-quote', () => {
    getTokenFiatRateMock.mockReturnValue(undefined);

    const updateTransactionDataMock = vi.fn();
    const messenger = createMessengerMock({
      [TRANSACTION_ID_MOCK]: { isPostQuote: true },
    });

    updatePaymentToken(
      {
        chainId: CHAIN_ID_MOCK,
        tokenAddress: TOKEN_ADDRESS_MOCK,
        transactionId: TRANSACTION_ID_MOCK,
      },
      {
        messenger,
        updateTransactionData: updateTransactionDataMock,
      },
    );

    expect(updateTransactionDataMock).toHaveBeenCalledTimes(1);

    const transactionDataMock = {} as TransactionData;
    updateTransactionDataMock.mock.calls[0][1](transactionDataMock);

    expect(transactionDataMock.paymentToken).toStrictEqual({
      address: TOKEN_ADDRESS_MOCK,
      balanceFiat: '0',
      balanceHuman: '1.23',
      balanceRaw: '1230000',
      balanceUsd: '0',
      chainId: CHAIN_ID_MOCK,
      decimals: 6,
      symbol: 'TST',
    });
  });

  it('uses actual fiat rate when available and transaction is post-quote', () => {
    const updateTransactionDataMock = vi.fn();
    const messenger = createMessengerMock({
      [TRANSACTION_ID_MOCK]: { isPostQuote: true },
    });

    updatePaymentToken(
      {
        chainId: CHAIN_ID_MOCK,
        tokenAddress: TOKEN_ADDRESS_MOCK,
        transactionId: TRANSACTION_ID_MOCK,
      },
      {
        messenger,
        updateTransactionData: updateTransactionDataMock,
      },
    );

    const transactionDataMock = {} as TransactionData;
    updateTransactionDataMock.mock.calls[0][1](transactionDataMock);

    expect(transactionDataMock.paymentToken).toStrictEqual(PAYMENT_TOKEN_MOCK);
  });

  it('throws if token info not found even when transaction is post-quote', () => {
    getTokenInfoMock.mockReturnValue(undefined);

    expect(() =>
      updatePaymentToken(
        {
          chainId: CHAIN_ID_MOCK,
          tokenAddress: TOKEN_ADDRESS_MOCK,
          transactionId: TRANSACTION_ID_MOCK,
        },
        {
          messenger: createMessengerMock({
            [TRANSACTION_ID_MOCK]: { isPostQuote: true },
          }),
          updateTransactionData: noop,
        },
      ),
    ).toThrow('Payment token not found');
  });

  it('throws if transaction not found', () => {
    getTransactionMock.mockReturnValue(undefined);

    expect(() =>
      updatePaymentToken(
        {
          chainId: CHAIN_ID_MOCK,
          tokenAddress: TOKEN_ADDRESS_MOCK,
          transactionId: TRANSACTION_ID_MOCK,
        },
        {
          messenger: createMessengerMock(),
          updateTransactionData: noop,
        },
      ),
    ).toThrow('Transaction not found');
  });
  describe('non-EVM payment token', () => {
    beforeEach(() => {
      getAssetInfoMock.mockReturnValue({ decimals: 9, symbol: 'SOL' });
      getAssetFiatRateMock.mockReturnValue({ fiatRate: '85', usdRate: '100' });
      getAssetBalanceMock.mockReturnValue('1500000000');
    });

    it('updates payment token from AssetsController state', () => {
      const updateTransactionDataMock = vi.fn();
      const messenger = createNonEvmMessengerMock();

      updatePaymentToken(
        {
          assetId: SOL_ASSET_ID_MOCK,
          transactionId: TRANSACTION_ID_MOCK,
          walletAccountId: SOLANA_WALLET_ACCOUNT_ID_MOCK,
        },
        {
          messenger,
          updateTransactionData: updateTransactionDataMock,
        },
      );

      expect(getAssetBalanceMock).toHaveBeenCalledWith(
        messenger,
        SOLANA_WALLET_ACCOUNT_ID_MOCK,
        SOL_ASSET_ID_MOCK,
      );
      expect(getTokenBalanceMock).not.toHaveBeenCalled();

      const transactionDataMock = {
        quoteError: { message: 'No route found', reason: 'no-quotes' },
      } as TransactionData;
      updateTransactionDataMock.mock.calls[0][1](transactionDataMock);

      expect(transactionDataMock.paymentToken).toStrictEqual({
        accountId: `${SOLANA_CHAIN_ID_MOCK}:${SOLANA_ADDRESS_MOCK}`,
        assetId: SOL_ASSET_ID_MOCK,
        balanceFiat: '127.5',
        balanceHuman: '1.5',
        balanceRaw: '1500000000',
        balanceUsd: '150',
        chainId: SOLANA_CHAIN_ID_MOCK,
        decimals: 9,
        symbol: 'SOL',
        walletAccountId: SOLANA_WALLET_ACCOUNT_ID_MOCK,
      });
      expect(transactionDataMock.fiatPayment).toStrictEqual({});
      expect(transactionDataMock.quoteError).toBeUndefined();
    });

    it('updates payment token for an SPL token', () => {
      getAssetInfoMock.mockReturnValue({ decimals: 6, symbol: 'USDC' });
      getAssetFiatRateMock.mockReturnValue({ fiatRate: '0.85', usdRate: '1' });
      getAssetBalanceMock.mockReturnValue('2500000');

      const updateTransactionDataMock = vi.fn();

      updatePaymentToken(
        {
          assetId: SPL_ASSET_ID_MOCK,
          transactionId: TRANSACTION_ID_MOCK,
          walletAccountId: SOLANA_WALLET_ACCOUNT_ID_MOCK,
        },
        {
          messenger: createNonEvmMessengerMock(),
          updateTransactionData: updateTransactionDataMock,
        },
      );

      const transactionDataMock = {} as TransactionData;
      updateTransactionDataMock.mock.calls[0][1](transactionDataMock);

      expect(transactionDataMock.paymentToken).toStrictEqual({
        accountId: `${SOLANA_CHAIN_ID_MOCK}:${SOLANA_ADDRESS_MOCK}`,
        assetId: SPL_ASSET_ID_MOCK,
        balanceFiat: '2.125',
        balanceHuman: '2.5',
        balanceRaw: '2500000',
        balanceUsd: '2.5',
        chainId: SOLANA_CHAIN_ID_MOCK,
        decimals: 6,
        symbol: 'USDC',
        walletAccountId: SOLANA_WALLET_ACCOUNT_ID_MOCK,
      });
    });

    it('throws if the asset is on an EVM chain', () => {
      expect(() =>
        updatePaymentToken(
          {
            assetId: 'eip155:1/slip44:60',
            transactionId: TRANSACTION_ID_MOCK,
            walletAccountId: SOLANA_WALLET_ACCOUNT_ID_MOCK,
          },
          {
            messenger: createNonEvmMessengerMock(),
            updateTransactionData: noop,
          },
        ),
      ).toThrow('EVM payment tokens must use tokenAddress and chainId');
    });

    it('throws if the account is not found', () => {
      expect(() =>
        updatePaymentToken(
          {
            assetId: SOL_ASSET_ID_MOCK,
            transactionId: TRANSACTION_ID_MOCK,
            walletAccountId: 'missing-account-uuid',
          },
          {
            messenger: createNonEvmMessengerMock(),
            updateTransactionData: noop,
          },
        ),
      ).toThrow('Payment token account not found');
    });

    it('throws if the account scopes do not include the asset chain', () => {
      expect(() =>
        updatePaymentToken(
          {
            assetId: 'bip122:000000000019d6689c085ae165831e93/slip44:0',
            transactionId: TRANSACTION_ID_MOCK,
            walletAccountId: SOLANA_WALLET_ACCOUNT_ID_MOCK,
          },
          {
            messenger: createNonEvmMessengerMock(),
            updateTransactionData: noop,
          },
        ),
      ).toThrow('Payment token account does not support the asset chain');
    });

    it('throws if asset info not found', () => {
      getAssetInfoMock.mockReturnValue(undefined);

      expect(() =>
        updatePaymentToken(
          {
            assetId: SOL_ASSET_ID_MOCK,
            transactionId: TRANSACTION_ID_MOCK,
            walletAccountId: SOLANA_WALLET_ACCOUNT_ID_MOCK,
          },
          {
            messenger: createNonEvmMessengerMock(),
            updateTransactionData: noop,
          },
        ),
      ).toThrow('Payment token not found');
    });

    it('throws if asset fiat rate not found', () => {
      getAssetFiatRateMock.mockReturnValue(undefined);

      expect(() =>
        updatePaymentToken(
          {
            assetId: SOL_ASSET_ID_MOCK,
            transactionId: TRANSACTION_ID_MOCK,
            walletAccountId: SOLANA_WALLET_ACCOUNT_ID_MOCK,
          },
          {
            messenger: createNonEvmMessengerMock(),
            updateTransactionData: noop,
          },
        ),
      ).toThrow('Payment token not found');
    });
  });
});
