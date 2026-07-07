import type { TransactionMeta } from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';

import type {
  QuoteRequest,
  TransactionPayControllerMessenger,
  TransactionPayQuote,
} from '../../types';
import { submitMoneyAccountVaultDeposit } from '../../utils/ma-vault-deposit';
import {
  getTransferredAmountFromTxHash,
  isPerpsWithdrawTransaction,
  isPredictWithdrawTransaction,
} from '../../utils/transaction';
import { MUSD_MONAD_FIAT_ASSET } from '../fiat/constants';
import { isMoneyAccountDepositTransaction } from '../fiat/utils';
import { FALLBACK_HASH } from './constants';
import {
  isPostRelayMoneyAccountVaultDeposit,
  submitPostRelayVaultDeposit,
} from './relay-post-ma-vault';
import type { RelayCompletionOutcome, RelayQuote } from './types';

jest.mock('../../utils/transaction');
jest.mock('../../utils/ma-vault-deposit');
jest.mock('../fiat/utils');

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

describe('isPostRelayMoneyAccountVaultDeposit', () => {
  const isMoneyAccountDepositTransactionMock = jest.mocked(
    isMoneyAccountDepositTransaction,
  );
  const isPerpsWithdrawTransactionMock = jest.mocked(isPerpsWithdrawTransaction);
  const isPredictWithdrawTransactionMock = jest.mocked(
    isPredictWithdrawTransaction,
  );

  const TRANSACTION_MOCK_2 = {
    id: 'tx-id-2',
    txParams: { from: '0xabc' as Hex },
  } as unknown as TransactionMeta;

  beforeEach(() => {
    jest.resetAllMocks();
    isMoneyAccountDepositTransactionMock.mockReturnValue(false);
    isPerpsWithdrawTransactionMock.mockReturnValue(false);
    isPredictWithdrawTransactionMock.mockReturnValue(false);
  });

  function buildRequest(
    overrides: Partial<QuoteRequest> = {},
  ): QuoteRequest {
    return {
      isMaxAmount: false,
      targetChainId: MUSD_MONAD_FIAT_ASSET.chainId,
      targetTokenAddress: MUSD_MONAD_FIAT_ASSET.address,
      ...overrides,
    } as unknown as QuoteRequest;
  }

  describe('Money Account deposit path', () => {
    it('returns true when isMaxAmount is true and transaction is a Money Account deposit', () => {
      isMoneyAccountDepositTransactionMock.mockReturnValue(true);

      expect(
        isPostRelayMoneyAccountVaultDeposit(
          buildRequest({ isMaxAmount: true }),
          TRANSACTION_MOCK_2,
        ),
      ).toBe(true);
    });

    it('returns false when isMaxAmount is false even if transaction is a Money Account deposit', () => {
      isMoneyAccountDepositTransactionMock.mockReturnValue(true);

      expect(
        isPostRelayMoneyAccountVaultDeposit(
          buildRequest({ isMaxAmount: false }),
          TRANSACTION_MOCK_2,
        ),
      ).toBe(false);
    });

    it('returns false when isMaxAmount is true but transaction is not a Money Account deposit', () => {
      isMoneyAccountDepositTransactionMock.mockReturnValue(false);

      expect(
        isPostRelayMoneyAccountVaultDeposit(
          buildRequest({ isMaxAmount: true }),
          TRANSACTION_MOCK_2,
        ),
      ).toBe(false);
    });
  });

  describe('Perps/Predict withdraw path', () => {
    it('returns true when transaction is a Perps withdrawal targeting mUSD on Monad', () => {
      isPerpsWithdrawTransactionMock.mockReturnValue(true);

      expect(
        isPostRelayMoneyAccountVaultDeposit(
          buildRequest({
            targetChainId: MUSD_MONAD_FIAT_ASSET.chainId,
            targetTokenAddress: MUSD_MONAD_FIAT_ASSET.address,
          }),
          TRANSACTION_MOCK_2,
        ),
      ).toBe(true);
    });

    it('returns true when transaction is a Predict withdrawal targeting mUSD on Monad', () => {
      isPredictWithdrawTransactionMock.mockReturnValue(true);

      expect(
        isPostRelayMoneyAccountVaultDeposit(
          buildRequest({
            targetChainId: MUSD_MONAD_FIAT_ASSET.chainId,
            targetTokenAddress: MUSD_MONAD_FIAT_ASSET.address,
          }),
          TRANSACTION_MOCK_2,
        ),
      ).toBe(true);
    });

    it('returns false when transaction is a Perps withdrawal but targetChainId does not match Monad', () => {
      isPerpsWithdrawTransactionMock.mockReturnValue(true);

      expect(
        isPostRelayMoneyAccountVaultDeposit(
          buildRequest({ targetChainId: '0x1' as Hex }),
          TRANSACTION_MOCK_2,
        ),
      ).toBe(false);
    });

    it('returns false when transaction is a Perps withdrawal but targetTokenAddress does not match mUSD', () => {
      isPerpsWithdrawTransactionMock.mockReturnValue(true);

      expect(
        isPostRelayMoneyAccountVaultDeposit(
          buildRequest({
            targetTokenAddress: '0xdeadbeef00000000000000000000000000000001' as Hex,
          }),
          TRANSACTION_MOCK_2,
        ),
      ).toBe(false);
    });

    it('matches targetTokenAddress case-insensitively', () => {
      isPerpsWithdrawTransactionMock.mockReturnValue(true);

      expect(
        isPostRelayMoneyAccountVaultDeposit(
          buildRequest({
            targetTokenAddress:
              MUSD_MONAD_FIAT_ASSET.address.toUpperCase() as Hex,
          }),
          TRANSACTION_MOCK_2,
        ),
      ).toBe(true);
    });

    it('returns false when neither Perps nor Predict withdraw nor MA deposit', () => {
      expect(
        isPostRelayMoneyAccountVaultDeposit(
          buildRequest(),
          TRANSACTION_MOCK_2,
        ),
      ).toBe(false);
    });
  });
});
