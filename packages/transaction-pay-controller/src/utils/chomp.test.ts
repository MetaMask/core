import type { Hex } from '@metamask/utils';

import { CHAIN_ID_MONAD, MUSD_MONAD_ADDRESS } from '../constants.js';
import type { TransactionPayControllerMessenger } from '../types.js';
import { findRecentChompVaultDeposit } from './chomp.js';
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
});
