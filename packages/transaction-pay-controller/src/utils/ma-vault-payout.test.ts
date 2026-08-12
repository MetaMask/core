import { buildMoneyAccountDepositBatch } from '@metamask/money-account-utils';
import type { Hex } from '@metamask/utils';

import { CHAIN_ID_MONAD, MUSD_MONAD_ADDRESS } from '../constants.js';
import type { TransactionPayControllerMessenger } from '../types.js';
import { submitMoneyAccountVaultDepositBatch } from './ma-vault-deposit.js';
import { submitMoneyAccountVaultDepositFromPayout } from './ma-vault-payout.js';
import {
  getMoneyAccountVaultConfig,
  isMoneyAccountVaultActionEnabled,
} from './money-account-vault-config.js';
import { getNetworkClientId } from './provider.js';
import { getTransferredAmountFromTxHash } from './transaction.js';

jest.mock('@metamask/money-account-utils');
jest.mock('./ma-vault-deposit');
jest.mock('./money-account-vault-config');
jest.mock('./provider');
jest.mock('./transaction');

const MONEY_ACCOUNT_ADDRESS =
  '0x1111111111111111111111111111111111111111' as Hex;
const PAYOUT_HASH =
  '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as Hex;
const VAULT_HASH =
  '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as Hex;
const PROVIDER = { request: jest.fn() };
const NETWORK_CLIENT_ID = 'monad-network-client';
const VAULT_CONFIG = {
  accountantAddress: '0x2222222222222222222222222222222222222222' as Hex,
  boringVault: '0x3333333333333333333333333333333333333333' as Hex,
  chainId: CHAIN_ID_MONAD,
  lensAddress: '0x4444444444444444444444444444444444444444' as Hex,
  tellerAddress: '0x5555555555555555555555555555555555555555' as Hex,
};

function getMessenger(): TransactionPayControllerMessenger {
  return {
    call: jest.fn((action: string) => {
      if (action === 'NetworkController:getNetworkClientById') {
        return { provider: PROVIDER };
      }
      throw new Error(`Unexpected action: ${action}`);
    }),
  } as unknown as TransactionPayControllerMessenger;
}

describe('submitMoneyAccountVaultDepositFromPayout', () => {
  const buildMoneyAccountDepositBatchMock = jest.mocked(
    buildMoneyAccountDepositBatch,
  );
  const getMoneyAccountVaultConfigMock = jest.mocked(
    getMoneyAccountVaultConfig,
  );
  const isMoneyAccountVaultActionEnabledMock = jest.mocked(
    isMoneyAccountVaultActionEnabled,
  );
  const getNetworkClientIdMock = jest.mocked(getNetworkClientId);
  const getTransferredAmountFromTxHashMock = jest.mocked(
    getTransferredAmountFromTxHash,
  );
  const submitMoneyAccountVaultDepositBatchMock = jest.mocked(
    submitMoneyAccountVaultDepositBatch,
  );

  beforeEach(() => {
    jest.resetAllMocks();
    getMoneyAccountVaultConfigMock.mockReturnValue(VAULT_CONFIG);
    isMoneyAccountVaultActionEnabledMock.mockReturnValue(true);
    getNetworkClientIdMock.mockReturnValue(NETWORK_CLIENT_ID);
    getTransferredAmountFromTxHashMock.mockResolvedValue({
      amountRaw: '5000000',
      blockNumber: '0x123',
    });
    buildMoneyAccountDepositBatchMock.mockResolvedValue({
      approveTx: {
        params: {
          data: '0xapprove',
          to: MUSD_MONAD_ADDRESS,
          value: '0x0',
        },
      },
      depositTx: {
        params: {
          data: '0xdeposit',
          to: VAULT_CONFIG.tellerAddress,
          value: '0x0',
        },
      },
    } as never);
    submitMoneyAccountVaultDepositBatchMock.mockResolvedValue({
      transactionHash: VAULT_HASH,
    });
  });

  it('resolves the Iron payout and submits a parentless vault batch', async () => {
    const messenger = getMessenger();

    const result = await submitMoneyAccountVaultDepositFromPayout(
      {
        moneyAccountAddress: MONEY_ACCOUNT_ADDRESS,
        transactionHash: PAYOUT_HASH,
        vaultDisabled: false,
      },
      messenger,
    );

    expect(getTransferredAmountFromTxHashMock).toHaveBeenCalledWith({
      chainId: CHAIN_ID_MONAD,
      messenger,
      tokenAddress: MUSD_MONAD_ADDRESS,
      txHash: PAYOUT_HASH,
      walletAddress: MONEY_ACCOUNT_ADDRESS,
    });
    expect(buildMoneyAccountDepositBatchMock).toHaveBeenCalledWith({
      amount: 5000000n,
      provider: expect.anything(),
      ...VAULT_CONFIG,
    });
    expect(submitMoneyAccountVaultDepositBatchMock).toHaveBeenCalledWith({
      depositCalls: [
        expect.objectContaining({ data: '0xapprove' }),
        expect.objectContaining({ data: '0xdeposit' }),
      ],
      fromBlock: '0x123',
      messenger,
      moneyAccountAddress: MONEY_ACCOUNT_ADDRESS,
      sourceAmountRaw: '5000000',
      vaultDisabled: false,
    });
    expect(result).toStrictEqual({ transactionHash: VAULT_HASH });
  });

  it('defaults vaultDisabled to false', async () => {
    const messenger = getMessenger();

    await submitMoneyAccountVaultDepositFromPayout(
      {
        moneyAccountAddress: MONEY_ACCOUNT_ADDRESS,
        transactionHash: PAYOUT_HASH,
      },
      messenger,
    );

    expect(getTransferredAmountFromTxHashMock).toHaveBeenCalledTimes(1);
  });

  it('rejects a payout without an mUSD transfer to the Money Account', async () => {
    getTransferredAmountFromTxHashMock.mockResolvedValue({
      amountRaw: undefined,
      blockNumber: '0x123',
    });

    await expect(
      submitMoneyAccountVaultDepositFromPayout(
        {
          moneyAccountAddress: MONEY_ACCOUNT_ADDRESS,
          transactionHash: PAYOUT_HASH,
          vaultDisabled: false,
        },
        getMessenger(),
      ),
    ).rejects.toThrow('Payout transaction has no mUSD transfer');

    expect(buildMoneyAccountDepositBatchMock).not.toHaveBeenCalled();
    expect(submitMoneyAccountVaultDepositBatchMock).not.toHaveBeenCalled();
  });

  it('returns without resolving the payout when vaulting is disabled', async () => {
    const result = await submitMoneyAccountVaultDepositFromPayout(
      {
        moneyAccountAddress: MONEY_ACCOUNT_ADDRESS,
        transactionHash: PAYOUT_HASH,
        vaultDisabled: true,
      },
      getMessenger(),
    );

    expect(result).toStrictEqual({ skipped: true });
    expect(getTransferredAmountFromTxHashMock).not.toHaveBeenCalled();
  });

  it('returns without resolving the payout when deposits are disabled', async () => {
    isMoneyAccountVaultActionEnabledMock.mockReturnValue(false);

    const result = await submitMoneyAccountVaultDepositFromPayout(
      {
        moneyAccountAddress: MONEY_ACCOUNT_ADDRESS,
        transactionHash: PAYOUT_HASH,
        vaultDisabled: false,
      },
      getMessenger(),
    );

    expect(result).toStrictEqual({ skipped: true });
    expect(getTransferredAmountFromTxHashMock).not.toHaveBeenCalled();
  });
});
