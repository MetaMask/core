import { jest } from '@jest/globals';
import type { TransactionMeta } from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';

import type {
  TransactionPayControllerMessenger,
  TransactionPayQuote,
} from '../../types.js';
import { submitMoneyAccountVaultDeposit } from '../../utils/ma-vault-deposit.js';
import { getTransferredAmountFromTxHash } from '../../utils/transaction.js';
import { MUSD_MONAD_FIAT_ASSET } from '../fiat/constants.js';
import { FALLBACK_HASH } from './constants.js';
import { submitPostRelayVaultDeposit } from './relay-post-ma-vault.js';
import type { RelayCompletionOutcome, RelayQuote } from './types.js';

jest.mock('../../utils/transaction');
jest.mock('../../utils/ma-vault-deposit');

const TRANSACTION_ID_MOCK = 'tx-id';
const MONEY_ACCOUNT_ADDRESS_MOCK =
  '0xf9611ffaa445d0c5e728b5a514747e85405ad19b' as Hex;
const TARGET_HASH_MOCK =
  '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890' as Hex;
const ON_CHAIN_AMOUNT_MOCK = '535000';
const MINIMUM_AMOUNT_MOCK = '530000';
const VAULT_HASH_MOCK =
  '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef' as Hex;

const TRANSACTION_MOCK = {
  id: TRANSACTION_ID_MOCK,
  txParams: { from: MONEY_ACCOUNT_ADDRESS_MOCK },
} as unknown as TransactionMeta;

function buildMessenger(): TransactionPayControllerMessenger {
  return {} as TransactionPayControllerMessenger;
}

function buildQuote(overrides?: {
  recipient?: Hex;
  from?: Hex;
  minimumAmount?: string;
}): TransactionPayQuote<RelayQuote> {
  return {
    request: {
      from: overrides?.from ?? MONEY_ACCOUNT_ADDRESS_MOCK,
      recipient: overrides?.recipient,
    },
    original: {
      details: {
        currencyOut: {
          minimumAmount: overrides?.minimumAmount ?? MINIMUM_AMOUNT_MOCK,
        },
      },
    },
  } as unknown as TransactionPayQuote<RelayQuote>;
}

function buildCompletion(targetHash?: Hex): RelayCompletionOutcome {
  return { status: 'success', targetHash };
}

describe('submitPostRelayVaultDeposit', () => {
  const getTransferredAmountMock = jest.mocked(getTransferredAmountFromTxHash);
  const submitMoneyAccountVaultDepositMock = jest.mocked(
    submitMoneyAccountVaultDeposit,
  );

  beforeEach(() => {
    jest.resetAllMocks();
    submitMoneyAccountVaultDepositMock.mockResolvedValue({
      transactionHash: VAULT_HASH_MOCK,
    });
  });

  describe('resolvePostRelayAmount — on-chain path', () => {
    it('uses the on-chain transferred amount when targetHash is present and not FALLBACK_HASH', async () => {
      getTransferredAmountMock.mockResolvedValue({
        amountRaw: ON_CHAIN_AMOUNT_MOCK,
        blockNumber: undefined,
      });

      await submitPostRelayVaultDeposit({
        completion: buildCompletion(TARGET_HASH_MOCK),
        messenger: buildMessenger(),
        quote: buildQuote(),
        transaction: TRANSACTION_MOCK,
      });

      expect(getTransferredAmountMock).toHaveBeenCalledWith({
        messenger: expect.anything(),
        txHash: TARGET_HASH_MOCK,
        chainId: MUSD_MONAD_FIAT_ASSET.chainId,
        tokenAddress: MUSD_MONAD_FIAT_ASSET.address,
        walletAddress: MONEY_ACCOUNT_ADDRESS_MOCK,
      });
      expect(submitMoneyAccountVaultDepositMock).toHaveBeenCalledWith(
        expect.objectContaining({ sourceAmountRaw: ON_CHAIN_AMOUNT_MOCK }),
      );
    });

    it('prefers quote.request.recipient over quote.request.from for the on-chain lookup', async () => {
      const recipientAddress =
        '0xrecipient000000000000000000000000000001' as Hex;
      getTransferredAmountMock.mockResolvedValue({
        amountRaw: ON_CHAIN_AMOUNT_MOCK,
        blockNumber: undefined,
      });

      await submitPostRelayVaultDeposit({
        completion: buildCompletion(TARGET_HASH_MOCK),
        messenger: buildMessenger(),
        quote: buildQuote({ recipient: recipientAddress }),
        transaction: TRANSACTION_MOCK,
      });

      expect(getTransferredAmountMock).toHaveBeenCalledWith(
        expect.objectContaining({ walletAddress: recipientAddress }),
      );
    });

    it('falls back to transaction.txParams.from when quote has neither recipient nor from', async () => {
      getTransferredAmountMock.mockResolvedValue({
        amountRaw: ON_CHAIN_AMOUNT_MOCK,
        blockNumber: undefined,
      });
      const quote = {
        request: {},
        original: {
          details: { currencyOut: { minimumAmount: MINIMUM_AMOUNT_MOCK } },
        },
      } as unknown as TransactionPayQuote<RelayQuote>;

      await submitPostRelayVaultDeposit({
        completion: buildCompletion(TARGET_HASH_MOCK),
        messenger: buildMessenger(),
        quote,
        transaction: TRANSACTION_MOCK,
      });

      expect(getTransferredAmountMock).toHaveBeenCalledWith(
        expect.objectContaining({ walletAddress: MONEY_ACCOUNT_ADDRESS_MOCK }),
      );
    });

    it('falls back to quote minimum when getTransferredAmountFromTxHash returns no amount', async () => {
      getTransferredAmountMock.mockResolvedValue({
        amountRaw: undefined,
        blockNumber: undefined,
      });

      await submitPostRelayVaultDeposit({
        completion: buildCompletion(TARGET_HASH_MOCK),
        messenger: buildMessenger(),
        quote: buildQuote(),
        transaction: TRANSACTION_MOCK,
      });

      expect(submitMoneyAccountVaultDepositMock).toHaveBeenCalledWith(
        expect.objectContaining({ sourceAmountRaw: MINIMUM_AMOUNT_MOCK }),
      );
    });

    it('falls back to quote minimum when getTransferredAmountFromTxHash throws', async () => {
      getTransferredAmountMock.mockRejectedValue(new Error('rpc error'));

      await submitPostRelayVaultDeposit({
        completion: buildCompletion(TARGET_HASH_MOCK),
        messenger: buildMessenger(),
        quote: buildQuote(),
        transaction: TRANSACTION_MOCK,
      });

      expect(submitMoneyAccountVaultDepositMock).toHaveBeenCalledWith(
        expect.objectContaining({ sourceAmountRaw: MINIMUM_AMOUNT_MOCK }),
      );
    });
  });

  describe('resolvePostRelayAmount — fallback-hash path', () => {
    it('skips on-chain lookup and uses quote minimum when targetHash is FALLBACK_HASH', async () => {
      await submitPostRelayVaultDeposit({
        completion: buildCompletion(FALLBACK_HASH),
        messenger: buildMessenger(),
        quote: buildQuote(),
        transaction: TRANSACTION_MOCK,
      });

      expect(getTransferredAmountMock).not.toHaveBeenCalled();
      expect(submitMoneyAccountVaultDepositMock).toHaveBeenCalledWith(
        expect.objectContaining({ sourceAmountRaw: MINIMUM_AMOUNT_MOCK }),
      );
    });

    it('skips on-chain lookup and uses quote minimum when targetHash is undefined', async () => {
      await submitPostRelayVaultDeposit({
        completion: buildCompletion(undefined),
        messenger: buildMessenger(),
        quote: buildQuote(),
        transaction: TRANSACTION_MOCK,
      });

      expect(getTransferredAmountMock).not.toHaveBeenCalled();
      expect(submitMoneyAccountVaultDepositMock).toHaveBeenCalledWith(
        expect.objectContaining({ sourceAmountRaw: MINIMUM_AMOUNT_MOCK }),
      );
    });

    it('throws when quote minimum is missing and no on-chain amount is available', async () => {
      await expect(
        submitPostRelayVaultDeposit({
          completion: buildCompletion(FALLBACK_HASH),
          messenger: buildMessenger(),
          quote: buildQuote({ minimumAmount: '' }),
          transaction: TRANSACTION_MOCK,
        }),
      ).rejects.toThrow('Cannot resolve post-Relay vault deposit amount');
    });
  });

  describe('submitMoneyAccountVaultDeposit delegation', () => {
    it('calls submitMoneyAccountVaultDeposit with vaultDisabled=false and the resolved amount', async () => {
      getTransferredAmountMock.mockResolvedValue({
        amountRaw: ON_CHAIN_AMOUNT_MOCK,
        blockNumber: undefined,
      });

      await submitPostRelayVaultDeposit({
        completion: buildCompletion(TARGET_HASH_MOCK),
        messenger: buildMessenger(),
        quote: buildQuote(),
        transaction: TRANSACTION_MOCK,
      });

      expect(submitMoneyAccountVaultDepositMock).toHaveBeenCalledWith({
        messenger: expect.anything(),
        sourceAmountRaw: ON_CHAIN_AMOUNT_MOCK,
        transaction: TRANSACTION_MOCK,
        vaultDisabled: false,
      });
    });

    it('returns the transactionHash from submitMoneyAccountVaultDeposit', async () => {
      getTransferredAmountMock.mockResolvedValue({
        amountRaw: ON_CHAIN_AMOUNT_MOCK,
        blockNumber: undefined,
      });

      const result = await submitPostRelayVaultDeposit({
        completion: buildCompletion(TARGET_HASH_MOCK),
        messenger: buildMessenger(),
        quote: buildQuote(),
        transaction: TRANSACTION_MOCK,
      });

      expect(result).toStrictEqual({ transactionHash: VAULT_HASH_MOCK });
    });
  });
});
