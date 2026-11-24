import type { TransactionMeta } from '@metamask/transaction-controller';
import type { CaipAssetType } from '@metamask/utils';
import { noop } from 'lodash-es';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { mockModuleExcept } from '../../tests/mock-module-except.js';
import type { TransactionData, TransactionPaymentToken } from '../types.js';
import { getEvmAccountAddress, getAssetAccount } from '../utils/account.js';
import type { AssetAccount } from '../utils/account.js';
import {
  getAssetBalance,
  getAssetFiatRate,
  getAssetInfo,
} from '../utils/token.js';
import { getTransaction } from '../utils/transaction.js';
import { updatePaymentToken } from './update-payment-token.js';

vi.mock(import('../utils/token.js'), async (importOriginal) =>
  mockModuleExcept(await importOriginal(), [
    'computeTokenAmounts',
    'getEvmAsset',
    'getNativeToken',
  ]),
);
vi.mock(import('../utils/account.js'));
vi.mock(import('../utils/transaction.js'));

const TOKEN_ADDRESS_MOCK = '0x123';
const ASSET_ID_MOCK: CaipAssetType = `eip155:1/erc20:${TOKEN_ADDRESS_MOCK}`;
const FROM_MOCK = '0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed';
const FROM_CHECKSUM_MOCK = '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed';
const FROM_ACCOUNT_ID_MOCK = 'from-account-id';
const OVERRIDE_ACCOUNT_ID_MOCK = 'override-account-id';
const TRANSACTION_ID_MOCK = '123-456';

const ACCOUNT_OVERRIDE_MOCK = 'override-account-uuid';
const OVERRIDE_ADDRESS_MOCK = '0x7890000000000000000000000000000000000000';

const PAYMENT_TOKEN_MOCK: TransactionPaymentToken = {
  assetId: ASSET_ID_MOCK,
  balanceFiat: '2.46',
  balanceHuman: '1.23',
  balanceRaw: '1230000',
  balanceUsd: '3.69',
  decimals: 6,
  symbol: 'TST',
};

const SOLANA_CHAIN_ID_MOCK = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp';
const SOLANA_ADDRESS_MOCK = '7Ec4QeG8wF3RnTjHDrTuYP8hVV7WYuPFyM4hZUodkG6Z';
const SOLANA_ACCOUNT_MOCK = {
  id: 'solana-account-uuid',
  address: SOLANA_ADDRESS_MOCK,
} as AssetAccount;
const SOL_ASSET_ID_MOCK: CaipAssetType = `${SOLANA_CHAIN_ID_MOCK}/slip44:501`;
const SPL_ASSET_ID_MOCK: CaipAssetType = `${SOLANA_CHAIN_ID_MOCK}/token:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`;

function createMessengerMock(
  transactionData: Record<string, unknown> = {},
): never {
  return {
    call: vi.fn((action: string) =>
      action === 'AccountsController:getState'
        ? {
            accountIdByAddress: {
              [FROM_MOCK]: FROM_ACCOUNT_ID_MOCK,
              [OVERRIDE_ADDRESS_MOCK]: OVERRIDE_ACCOUNT_ID_MOCK,
            },
          }
        : { transactionData },
    ),
  } as never;
}

describe('Update Payment Token Action', () => {
  const getTransactionMock = vi.mocked(getTransaction);
  const getEvmAccountAddressMock = vi.mocked(getEvmAccountAddress);
  const getAssetBalanceMock = vi.mocked(getAssetBalance);
  const getAssetFiatRateMock = vi.mocked(getAssetFiatRate);
  const getAssetInfoMock = vi.mocked(getAssetInfo);

  beforeEach(() => {
    vi.resetAllMocks();

    getAssetInfoMock.mockReturnValue({
      decimals: PAYMENT_TOKEN_MOCK.decimals,
      symbol: PAYMENT_TOKEN_MOCK.symbol,
    });

    getAssetFiatRateMock.mockReturnValue({
      fiatRate: '2',
      usdRate: '3',
    });

    getAssetBalanceMock.mockReturnValue('1230000');

    getEvmAccountAddressMock.mockImplementation(
      (_messenger, accountOverride, from) =>
        accountOverride === ACCOUNT_OVERRIDE_MOCK
          ? OVERRIDE_ADDRESS_MOCK
          : from,
    );

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
        assetId: ASSET_ID_MOCK,
        transactionId: TRANSACTION_ID_MOCK,
      },
      {
        messenger,
        updateTransactionData: updateTransactionDataMock,
      },
    );

    expect(getAssetInfoMock).toHaveBeenCalledWith(messenger, ASSET_ID_MOCK);
    expect(getAssetFiatRateMock).toHaveBeenCalledWith(messenger, ASSET_ID_MOCK);
    expect(getAssetBalanceMock).toHaveBeenCalledWith(
      messenger,
      FROM_ACCOUNT_ID_MOCK,
      ASSET_ID_MOCK,
    );

    expect(updateTransactionDataMock).toHaveBeenCalledTimes(1);

    const transactionDataMock = {
      quoteError: {
        message: 'No route found',
        reason: 'no-quotes',
      },
    } as TransactionData;
    updateTransactionDataMock.mock.calls[0][1](transactionDataMock);

    expect(transactionDataMock.paymentToken).toStrictEqual({
      assetId: ASSET_ID_MOCK,
      balanceFiat: '2.46',
      balanceHuman: '1.23',
      balanceRaw: '1230000',
      balanceUsd: '3.69',
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
        assetId: ASSET_ID_MOCK,
        transactionId: TRANSACTION_ID_MOCK,
      },
      {
        messenger,
        updateTransactionData: updateTransactionDataMock,
      },
    );

    expect(getEvmAccountAddressMock).toHaveBeenCalledWith(
      messenger,
      ACCOUNT_OVERRIDE_MOCK,
      FROM_MOCK,
    );
    expect(getAssetBalanceMock).toHaveBeenCalledWith(
      messenger,
      OVERRIDE_ACCOUNT_ID_MOCK,
      ASSET_ID_MOCK,
    );
  });

  it('falls back to the lowercase sender address for the account lookup', () => {
    const messenger = createMessengerMock();

    getTransactionMock.mockReturnValue({
      id: TRANSACTION_ID_MOCK,
      txParams: { from: FROM_CHECKSUM_MOCK },
    } as TransactionMeta);

    updatePaymentToken(
      {
        assetId: ASSET_ID_MOCK,
        transactionId: TRANSACTION_ID_MOCK,
      },
      {
        messenger,
        updateTransactionData: noop,
      },
    );

    expect(getAssetBalanceMock).toHaveBeenCalledWith(
      messenger,
      FROM_ACCOUNT_ID_MOCK,
      ASSET_ID_MOCK,
    );
  });

  it('uses a zero balance if the EVM account is not found', () => {
    const updateTransactionDataMock = vi.fn();

    getTransactionMock.mockReturnValue({
      id: TRANSACTION_ID_MOCK,
      txParams: { from: '0x9990000000000000000000000000000000000000' },
    } as TransactionMeta);

    updatePaymentToken(
      {
        assetId: ASSET_ID_MOCK,
        transactionId: TRANSACTION_ID_MOCK,
      },
      {
        messenger: createMessengerMock(),
        updateTransactionData: updateTransactionDataMock,
      },
    );

    expect(getAssetBalanceMock).not.toHaveBeenCalled();

    const transactionDataMock = {} as TransactionData;
    updateTransactionDataMock.mock.calls[0][1](transactionDataMock);

    expect(transactionDataMock.paymentToken?.balanceRaw).toBe('0');
  });

  it('throws if token info not found', () => {
    getAssetInfoMock.mockReturnValue(undefined);

    expect(() =>
      updatePaymentToken(
        {
          assetId: ASSET_ID_MOCK,
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
    getAssetFiatRateMock.mockReturnValue(undefined);

    expect(() =>
      updatePaymentToken(
        {
          assetId: ASSET_ID_MOCK,
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
    getAssetFiatRateMock.mockReturnValue(undefined);

    const updateTransactionDataMock = vi.fn();
    const messenger = createMessengerMock({
      [TRANSACTION_ID_MOCK]: { isPostQuote: true },
    });

    updatePaymentToken(
      {
        assetId: ASSET_ID_MOCK,
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
      assetId: ASSET_ID_MOCK,
      balanceFiat: '0',
      balanceHuman: '1.23',
      balanceRaw: '1230000',
      balanceUsd: '0',
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
        assetId: ASSET_ID_MOCK,
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
    getAssetInfoMock.mockReturnValue(undefined);

    expect(() =>
      updatePaymentToken(
        {
          assetId: ASSET_ID_MOCK,
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
          assetId: ASSET_ID_MOCK,
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
    const getAssetAccountMock = vi.mocked(getAssetAccount);

    beforeEach(() => {
      getAssetAccountMock.mockReturnValue(SOLANA_ACCOUNT_MOCK);
      getAssetInfoMock.mockReturnValue({ decimals: 9, symbol: 'SOL' });
      getAssetFiatRateMock.mockReturnValue({ fiatRate: '85', usdRate: '100' });
      getAssetBalanceMock.mockReturnValue('1500000000');
    });

    it('updates payment token from AssetsController state', () => {
      const updateTransactionDataMock = vi.fn();
      const messenger = createMessengerMock();

      updatePaymentToken(
        {
          assetId: SOL_ASSET_ID_MOCK,
          transactionId: TRANSACTION_ID_MOCK,
        },
        {
          messenger,
          updateTransactionData: updateTransactionDataMock,
        },
      );

      expect(getAssetAccountMock).toHaveBeenCalledWith(messenger, {
        accountOverride: undefined,
        assetId: SOL_ASSET_ID_MOCK,
        from: FROM_MOCK,
      });
      expect(getAssetBalanceMock).toHaveBeenCalledWith(
        messenger,
        SOLANA_ACCOUNT_MOCK.id,
        SOL_ASSET_ID_MOCK,
      );

      const transactionDataMock = {
        quoteError: { message: 'No route found', reason: 'no-quotes' },
      } as TransactionData;
      updateTransactionDataMock.mock.calls[0][1](transactionDataMock);

      expect(transactionDataMock.paymentToken).toStrictEqual({
        assetId: SOL_ASSET_ID_MOCK,
        balanceFiat: '127.5',
        balanceHuman: '1.5',
        balanceRaw: '1500000000',
        balanceUsd: '150',
        decimals: 9,
        symbol: 'SOL',
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
        },
        {
          messenger: createMessengerMock(),
          updateTransactionData: updateTransactionDataMock,
        },
      );

      const transactionDataMock = {} as TransactionData;
      updateTransactionDataMock.mock.calls[0][1](transactionDataMock);

      expect(transactionDataMock.paymentToken).toStrictEqual({
        assetId: SPL_ASSET_ID_MOCK,
        balanceFiat: '2.125',
        balanceHuman: '2.5',
        balanceRaw: '2500000',
        balanceUsd: '2.5',
        decimals: 6,
        symbol: 'USDC',
      });
    });

    it('resolves the account from accountOverride', () => {
      const messenger = createMessengerMock({
        [TRANSACTION_ID_MOCK]: { accountOverride: SOLANA_ACCOUNT_MOCK.id },
      });

      updatePaymentToken(
        {
          assetId: SOL_ASSET_ID_MOCK,
          transactionId: TRANSACTION_ID_MOCK,
        },
        {
          messenger,
          updateTransactionData: noop,
        },
      );

      expect(getAssetAccountMock).toHaveBeenCalledWith(messenger, {
        accountOverride: SOLANA_ACCOUNT_MOCK.id,
        assetId: SOL_ASSET_ID_MOCK,
        from: FROM_MOCK,
      });
    });

    it('throws if asset info not found', () => {
      getAssetInfoMock.mockReturnValue(undefined);

      expect(() =>
        updatePaymentToken(
          {
            assetId: SOL_ASSET_ID_MOCK,
            transactionId: TRANSACTION_ID_MOCK,
          },
          {
            messenger: createMessengerMock(),
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
          },
          {
            messenger: createMessengerMock(),
            updateTransactionData: noop,
          },
        ),
      ).toThrow('Payment token not found');
    });
  });
});
