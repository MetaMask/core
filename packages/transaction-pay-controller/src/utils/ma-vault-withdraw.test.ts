import { buildMoneyAccountWithdrawBatch } from '@metamask/money-account-utils';
import type { Hex } from '@metamask/utils';

import { CHAIN_ID_MONAD, MUSD_MONAD_ADDRESS } from '../constants.js';
import type { TransactionPayControllerMessenger } from '../types.js';
import type { SubmitMoneyAccountVaultWithdrawRequest } from './ma-vault-withdraw.js';
import { submitMoneyAccountVaultWithdraw } from './ma-vault-withdraw.js';
import {
  getMoneyAccountVaultConfig,
  isMoneyAccountVaultActionEnabled,
} from './money-account-vault-config.js';
import { getNetworkClientId } from './provider.js';

jest.mock('@metamask/money-account-utils');
jest.mock('./money-account-vault-config');
jest.mock('./provider');

const MONEY_ACCOUNT_ADDRESS =
  '0x1111111111111111111111111111111111111111' as Hex;
const IRON_ADDRESS = '0x2222222222222222222222222222222222222222' as Hex;
const PROVIDER = { request: jest.fn() };
const NETWORK_CLIENT_ID = 'monad-network-client';
const VAULT_CONFIG = {
  accountantAddress: '0x3333333333333333333333333333333333333333' as Hex,
  boringVault: '0x4444444444444444444444444444444444444444' as Hex,
  chainId: CHAIN_ID_MONAD,
  lensAddress: '0x5555555555555555555555555555555555555555' as Hex,
  tellerAddress: '0x6666666666666666666666666666666666666666' as Hex,
};

function getRequest(
  overrides: Partial<SubmitMoneyAccountVaultWithdrawRequest> = {},
): SubmitMoneyAccountVaultWithdrawRequest {
  return {
    amountInRaw: '5000000',
    autorampId: 'autoramp-id',
    chainId: CHAIN_ID_MONAD,
    moneyAccountAddress: MONEY_ACCOUNT_ADDRESS,
    quoteId: 'quote-id',
    quoteValidUntil: new Date(Date.now() + 60_000).toISOString(),
    recipient: IRON_ADDRESS,
    requestId: 'request-id',
    tokenAddress: MUSD_MONAD_ADDRESS,
    ...overrides,
  };
}

function getMessenger({
  balance = '5000000',
}: {
  balance?: string;
} = {}): {
  callMock: jest.Mock;
  messenger: TransactionPayControllerMessenger;
} {
  const callMock = jest.fn((action: string) => {
    if (action === 'NetworkController:getNetworkClientById') {
      return { provider: PROVIDER };
    }
    if (action === 'MoneyAccountBalanceService:getMoneyAccountBalance') {
      return Promise.resolve({
        musdBalance: '0',
        totalBalance: balance,
        vmusdValueInMusd: balance,
      });
    }
    if (action === 'TransactionController:addTransactionBatch') {
      return Promise.resolve({ batchId: '0xbatch' });
    }
    throw new Error(`Unexpected action: ${action}`);
  });

  return {
    callMock,
    messenger: {
      call: callMock,
    } as unknown as TransactionPayControllerMessenger,
  };
}

describe('submitMoneyAccountVaultWithdraw', () => {
  const buildMoneyAccountWithdrawBatchMock = jest.mocked(
    buildMoneyAccountWithdrawBatch,
  );
  const getMoneyAccountVaultConfigMock = jest.mocked(
    getMoneyAccountVaultConfig,
  );
  const isMoneyAccountVaultActionEnabledMock = jest.mocked(
    isMoneyAccountVaultActionEnabled,
  );
  const getNetworkClientIdMock = jest.mocked(getNetworkClientId);

  beforeEach(() => {
    jest.resetAllMocks();
    getMoneyAccountVaultConfigMock.mockReturnValue(VAULT_CONFIG);
    isMoneyAccountVaultActionEnabledMock.mockReturnValue(true);
    getNetworkClientIdMock.mockReturnValue(NETWORK_CLIENT_ID);
    buildMoneyAccountWithdrawBatchMock.mockResolvedValue({
      transferTx: {
        params: {
          data: '0xtransfer',
          to: MUSD_MONAD_ADDRESS,
          value: '0x0',
        },
        type: 'tokenMethodTransfer',
      },
      withdrawTx: {
        params: {
          data: '0xwithdraw',
          to: VAULT_CONFIG.tellerAddress,
          value: '0x0',
        },
        type: 'moneyAccountWithdraw',
      },
    } as never);
  });

  it('creates one user-confirmed atomic batch to the Iron address', async () => {
    const { callMock, messenger } = getMessenger();
    const request = getRequest();

    const result = await submitMoneyAccountVaultWithdraw(request, messenger);

    expect(buildMoneyAccountWithdrawBatchMock).toHaveBeenCalledWith({
      accountantAddress: VAULT_CONFIG.accountantAddress,
      amount: 5000000n,
      chainId: CHAIN_ID_MONAD,
      moneyAccountAddress: MONEY_ACCOUNT_ADDRESS,
      provider: expect.anything(),
      recipient: IRON_ADDRESS,
      tellerAddress: VAULT_CONFIG.tellerAddress,
    });
    expect(callMock).toHaveBeenCalledWith(
      'TransactionController:addTransactionBatch',
      expect.objectContaining({
        atomic: true,
        disableHook: true,
        disableSequential: true,
        disableUpgrade: true,
        from: MONEY_ACCOUNT_ADDRESS,
        isGasFeeSponsored: true,
        isInternal: true,
        networkClientId: NETWORK_CLIENT_ID,
        origin: 'metamask',
        requestId: 'request-id',
        requireApproval: true,
        transactions: [
          expect.objectContaining({
            params: expect.objectContaining({ data: '0xwithdraw' }),
          }),
          expect.objectContaining({
            params: expect.objectContaining({ data: '0xtransfer' }),
          }),
        ],
      }),
    );
    expect(result).toStrictEqual({ batchId: '0xbatch' });
  });

  it('rejects an amount above the withdrawable vmUSD value', async () => {
    const { messenger } = getMessenger({ balance: '4999999' });

    await expect(
      submitMoneyAccountVaultWithdraw(getRequest(), messenger),
    ).rejects.toThrow('Insufficient withdrawable vmUSD balance');

    expect(buildMoneyAccountWithdrawBatchMock).not.toHaveBeenCalled();
  });

  it('rejects when Money Account withdrawals are disabled', async () => {
    isMoneyAccountVaultActionEnabledMock.mockReturnValue(false);

    await expect(
      submitMoneyAccountVaultWithdraw(getRequest(), getMessenger().messenger),
    ).rejects.toThrow('Money Account vault withdrawal is disabled');

    expect(buildMoneyAccountWithdrawBatchMock).not.toHaveBeenCalled();
  });

  it.each([
    [{ amountInRaw: '0' }, 'Withdrawal amount must be greater than zero'],
    [{ amountInRaw: '-1' }, 'Withdrawal amount must be greater than zero'],
    [{ amountInRaw: 'invalid' }, 'Withdrawal amount must be greater than zero'],
    [{ quoteValidUntil: 'invalid' }, 'Iron quote expiry is invalid'],
    [
      { quoteValidUntil: new Date(Date.now() - 1_000).toISOString() },
      'Iron quote has expired',
    ],
    [{ chainId: '0x1' }, 'Pix withdrawal must use Monad'],
    [
      { tokenAddress: '0x7777777777777777777777777777777777777777' },
      'Pix withdrawal must use mUSD',
    ],
    [{ recipient: '0x1234' }, 'Iron recipient is invalid'],
    [
      { recipient: MONEY_ACCOUNT_ADDRESS },
      'Iron recipient must differ from the Money Account',
    ],
    [{ requestId: '' }, 'Missing Iron request identifiers'],
    [{ quoteId: '' }, 'Missing Iron request identifiers'],
    [{ autorampId: '' }, 'Missing Iron request identifiers'],
  ])('rejects invalid exact-out input %#', async (overrides, message) => {
    await expect(
      submitMoneyAccountVaultWithdraw(
        getRequest(overrides),
        getMessenger().messenger,
      ),
    ).rejects.toThrow(message);

    expect(buildMoneyAccountWithdrawBatchMock).not.toHaveBeenCalled();
  });
});
