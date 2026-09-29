import { TransactionType } from '@metamask/transaction-controller';
import type { TransactionMeta } from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';

import { CHAIN_ID_MONAD, MUSD_MONAD_ADDRESS } from '../constants.js';
import type { TransactionPayControllerMessenger } from '../types.js';
import { findRecentChompVaultDeposit, withChompRecovery } from './chomp.js';
import { rpcRequest } from './provider.js';

jest.mock('./provider');

const MONEY_ACCOUNT_ADDRESS =
  '0x1111111111111111111111111111111111111111' as Hex;
const CHOMP_TX_HASH =
  '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef' as Hex;
const FROM_BLOCK = '0x100' as Hex;
const SOURCE_AMOUNT_RAW = '5000000'; // 5 mUSD (6 decimals)
// uint256 hex for 5000000 (>= source amount)
const TRANSFER_DATA_SUFFICIENT =
  '0x00000000000000000000000000000000000000000000000000000000004c4b40';
// uint256 hex for 4999999 (< source amount)
const TRANSFER_DATA_INSUFFICIENT =
  '0x00000000000000000000000000000000000000000000000000000000004c4b3f';

const SUBMITTED_HASH = '0x5eb' as Hex;

const MONEY_ACCOUNT_DEPOSIT = {
  id: 'tx-id',
  txParams: { from: MONEY_ACCOUNT_ADDRESS },
  type: TransactionType.moneyAccountDeposit,
} as unknown as TransactionMeta;

const NESTED_MONEY_ACCOUNT_DEPOSIT = {
  ...MONEY_ACCOUNT_DEPOSIT,
  nestedTransactions: [
    { type: TransactionType.tokenMethodApprove },
    { type: TransactionType.moneyAccountDeposit },
  ],
  type: TransactionType.batch,
} as unknown as TransactionMeta;

const OTHER_TRANSACTION = {
  ...MONEY_ACCOUNT_DEPOSIT,
  type: TransactionType.contractInteraction,
} as unknown as TransactionMeta;

const ERC20_TRANSFER_TOPIC =
  '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

function padAddress(address: string): string {
  return `0x${address.replace(/^0x/u, '').toLowerCase().padStart(64, '0')}`;
}

const MONEY_ACCOUNT_PADDED = padAddress(MONEY_ACCOUNT_ADDRESS);

function buildMusdTransferLog(
  txHash: Hex = CHOMP_TX_HASH,
  data: string = TRANSFER_DATA_SUFFICIENT,
): {
  address: string;
  topics: string[];
  data: string;
  transactionHash: Hex;
} {
  return {
    address: MUSD_MONAD_ADDRESS,
    data,
    topics: [
      ERC20_TRANSFER_TOPIC,
      MONEY_ACCOUNT_PADDED,
      padAddress('0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'),
    ],
    transactionHash: txHash,
  };
}

function buildMessenger(): TransactionPayControllerMessenger {
  return {} as TransactionPayControllerMessenger;
}

describe('chomp', () => {
  const rpcRequestMock = jest.mocked(rpcRequest);

  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('findRecentChompVaultDeposit', () => {
    it('returns the CHOMP tx hash when a Transfer log with sufficient amount is found', async () => {
      rpcRequestMock.mockResolvedValueOnce([buildMusdTransferLog()]);

      const result = await findRecentChompVaultDeposit({
        fromBlock: FROM_BLOCK,
        messenger: buildMessenger(),
        moneyAccountAddress: MONEY_ACCOUNT_ADDRESS,
        sourceAmountRaw: SOURCE_AMOUNT_RAW,
      });

      expect(result).toBe(CHOMP_TX_HASH);
      // Only eth_getLogs should have been called.
      expect(rpcRequestMock).toHaveBeenCalledTimes(1);
    });

    it('returns undefined when the mUSD transfer amount is below the required amount', async () => {
      rpcRequestMock.mockResolvedValueOnce([
        buildMusdTransferLog(CHOMP_TX_HASH, TRANSFER_DATA_INSUFFICIENT),
      ]);

      const result = await findRecentChompVaultDeposit({
        fromBlock: FROM_BLOCK,
        messenger: buildMessenger(),
        moneyAccountAddress: MONEY_ACCOUNT_ADDRESS,
        sourceAmountRaw: SOURCE_AMOUNT_RAW,
      });

      expect(result).toBeUndefined();
      expect(rpcRequestMock).toHaveBeenCalledTimes(1);
    });

    it('returns undefined when no mUSD Transfer logs are found', async () => {
      rpcRequestMock.mockResolvedValueOnce([]);

      const result = await findRecentChompVaultDeposit({
        fromBlock: FROM_BLOCK,
        messenger: buildMessenger(),
        moneyAccountAddress: MONEY_ACCOUNT_ADDRESS,
        sourceAmountRaw: SOURCE_AMOUNT_RAW,
      });

      expect(result).toBeUndefined();
      expect(rpcRequestMock).toHaveBeenCalledTimes(1);
    });

    it('queries eth_getLogs with the correct filter', async () => {
      rpcRequestMock.mockResolvedValueOnce([]);

      await findRecentChompVaultDeposit({
        fromBlock: FROM_BLOCK,
        messenger: buildMessenger(),
        moneyAccountAddress: MONEY_ACCOUNT_ADDRESS,
        sourceAmountRaw: SOURCE_AMOUNT_RAW,
      });

      expect(rpcRequestMock).toHaveBeenCalledWith(
        expect.objectContaining({
          chainId: CHAIN_ID_MONAD,
          method: 'eth_getLogs',
          params: [
            expect.objectContaining({
              address: MUSD_MONAD_ADDRESS,
              fromBlock: FROM_BLOCK,
              toBlock: 'latest',
              topics: [ERC20_TRANSFER_TOPIC, MONEY_ACCOUNT_PADDED, null],
            }),
          ],
        }),
      );
    });

    it('processes logs newest-first and returns the most recent match', async () => {
      const olderHash =
        '0x0000000000000000000000000000000000000000000000000000000000000001' as Hex;
      const newerHash =
        '0x0000000000000000000000000000000000000000000000000000000000000002' as Hex;

      rpcRequestMock.mockResolvedValueOnce([
        buildMusdTransferLog(olderHash),
        buildMusdTransferLog(newerHash),
      ]);

      const result = await findRecentChompVaultDeposit({
        fromBlock: FROM_BLOCK,
        messenger: buildMessenger(),
        moneyAccountAddress: MONEY_ACCOUNT_ADDRESS,
        sourceAmountRaw: SOURCE_AMOUNT_RAW,
      });

      expect(result).toBe(newerHash);
      expect(rpcRequestMock).toHaveBeenCalledTimes(1);
    });

    it('skips logs with insufficient amount and returns the first sufficient one', async () => {
      const insufficientHash =
        '0x0000000000000000000000000000000000000000000000000000000000000001' as Hex;

      rpcRequestMock.mockResolvedValueOnce([
        buildMusdTransferLog(insufficientHash, TRANSFER_DATA_INSUFFICIENT),
        buildMusdTransferLog(CHOMP_TX_HASH),
      ]);

      const result = await findRecentChompVaultDeposit({
        fromBlock: FROM_BLOCK,
        messenger: buildMessenger(),
        moneyAccountAddress: MONEY_ACCOUNT_ADDRESS,
        sourceAmountRaw: SOURCE_AMOUNT_RAW,
      });

      // Logs reversed: CHOMP_TX_HASH checked first (newer), passes amount check.
      expect(result).toBe(CHOMP_TX_HASH);
      expect(rpcRequestMock).toHaveBeenCalledTimes(1);
    });

    it('treats a log with data "0x" as zero amount and skips it', async () => {
      rpcRequestMock.mockResolvedValueOnce([
        buildMusdTransferLog(CHOMP_TX_HASH, '0x'),
      ]);

      const result = await findRecentChompVaultDeposit({
        fromBlock: FROM_BLOCK,
        messenger: buildMessenger(),
        moneyAccountAddress: MONEY_ACCOUNT_ADDRESS,
        sourceAmountRaw: SOURCE_AMOUNT_RAW,
      });

      expect(result).toBeUndefined();
    });
  });

  describe('withChompRecovery', () => {
    let submitMock: jest.Mock<Promise<{ transactionHash?: Hex }>>;

    function run(
      options: { fromBlock?: Hex; transaction?: TransactionMeta } = {},
    ): Promise<{ transactionHash?: Hex }> {
      const {
        fromBlock = 'fromBlock' in options ? undefined : FROM_BLOCK,
        transaction = MONEY_ACCOUNT_DEPOSIT,
      } = options;

      return withChompRecovery(
        {
          from: MONEY_ACCOUNT_ADDRESS,
          fromBlock,
          messenger: buildMessenger(),
          sourceAmountRaw: SOURCE_AMOUNT_RAW,
          transaction,
        },
        submitMock,
      );
    }

    beforeEach(() => {
      submitMock = jest
        .fn<Promise<{ transactionHash?: Hex }>, []>()
        .mockResolvedValue({ transactionHash: SUBMITTED_HASH });

      rpcRequestMock.mockResolvedValue([]);
    });

    describe('when the transaction is not a Money Account deposit', () => {
      it('submits without checking for CHOMP', async () => {
        const result = await run({ transaction: OTHER_TRANSACTION });

        expect(result).toStrictEqual({ transactionHash: SUBMITTED_HASH });
        expect(rpcRequestMock).not.toHaveBeenCalled();
      });

      it('surfaces submission errors unprefixed', async () => {
        submitMock.mockRejectedValue(new Error('batch failed'));

        await expect(run({ transaction: OTHER_TRANSACTION })).rejects.toThrow(
          /^batch failed$/u,
        );
      });
    });

    describe('when the transaction is a Money Account deposit', () => {
      it('skips submission when CHOMP has already vaulted the funds', async () => {
        rpcRequestMock.mockResolvedValue([buildMusdTransferLog()]);

        const result = await run();

        expect(result).toStrictEqual({ transactionHash: CHOMP_TX_HASH });
        expect(submitMock).not.toHaveBeenCalled();
      });

      it('detects a Money Account deposit nested in a batch', async () => {
        rpcRequestMock.mockResolvedValue([buildMusdTransferLog()]);

        const result = await run({ transaction: NESTED_MONEY_ACCOUNT_DEPOSIT });

        expect(result).toStrictEqual({ transactionHash: CHOMP_TX_HASH });
      });

      it('submits when CHOMP has not vaulted the funds', async () => {
        const result = await run();

        expect(result).toStrictEqual({ transactionHash: SUBMITTED_HASH });
        expect(rpcRequestMock).toHaveBeenCalledTimes(1);
      });

      it('submits when the CHOMP pre-check fails', async () => {
        rpcRequestMock.mockRejectedValue(new Error('network error'));

        const result = await run();

        expect(result).toStrictEqual({ transactionHash: SUBMITTED_HASH });
      });

      it('returns the CHOMP hash when CHOMP wins the race and submission fails', async () => {
        rpcRequestMock
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([buildMusdTransferLog()]);
        submitMock.mockRejectedValue(new Error('batch failed'));

        const result = await run();

        expect(result).toStrictEqual({ transactionHash: CHOMP_TX_HASH });
        expect(rpcRequestMock).toHaveBeenCalledTimes(2);
      });

      it('prefixes the submission error when CHOMP has not vaulted the funds', async () => {
        submitMock.mockRejectedValue(new Error('batch failed'));

        await expect(run()).rejects.toThrow(/^Vault: batch failed$/u);
      });

      it('prefixes the submission error when the CHOMP post-check fails', async () => {
        rpcRequestMock
          .mockResolvedValueOnce([])
          .mockRejectedValueOnce(new Error('rpc error'));
        submitMock.mockRejectedValue(new Error('batch failed'));

        await expect(run()).rejects.toThrow(/^Vault: batch failed$/u);
      });

      it('skips CHOMP checks when the settlement block is unknown', async () => {
        submitMock.mockRejectedValue(new Error('batch failed'));

        await expect(run({ fromBlock: undefined })).rejects.toThrow(
          /^Vault: batch failed$/u,
        );
        expect(rpcRequestMock).not.toHaveBeenCalled();
      });
    });
  });
});
