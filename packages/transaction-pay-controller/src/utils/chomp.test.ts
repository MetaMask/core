import type { Hex } from '@metamask/utils';

import { CHAIN_ID_MONAD, MUSD_MONAD_ADDRESS } from '../constants.js';
import type { TransactionPayControllerMessenger } from '../types.js';
import { findRecentChompVaultDeposit } from './chomp.js';
import { rpcRequest } from './provider.js';

jest.mock('./provider');

const MONEY_ACCOUNT_ADDRESS =
  '0x1111111111111111111111111111111111111111' as Hex;
const BORING_VAULT_ADDRESS =
  '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as Hex;
const OTHER_RECIPIENT = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as Hex;
const CHOMP_TX_HASH =
  '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef' as Hex;
const FROM_BLOCK = '0x100' as Hex;
const SOURCE_AMOUNT_RAW = '5000000'; // 5 mUSD (6 decimals)
// uint256 hex for 5000000 (exact source amount)
const TRANSFER_DATA_EXACT =
  '0x00000000000000000000000000000000000000000000000000000000004c4b40';
// uint256 hex for 5000001 (above source amount)
const TRANSFER_DATA_ABOVE =
  '0x00000000000000000000000000000000000000000000000000000000004c4b41';
// uint256 hex for 4999999 (< source amount)
const TRANSFER_DATA_INSUFFICIENT =
  '0x00000000000000000000000000000000000000000000000000000000004c4b3f';

const ERC20_TRANSFER_TOPIC =
  '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

function padAddress(address: string): string {
  return `0x${address.replace(/^0x/u, '').toLowerCase().padStart(64, '0')}`;
}

const MONEY_ACCOUNT_PADDED = padAddress(MONEY_ACCOUNT_ADDRESS);
const BORING_VAULT_PADDED = padAddress(BORING_VAULT_ADDRESS);

function buildMusdTransferLog({
  txHash = CHOMP_TX_HASH,
  data = TRANSFER_DATA_EXACT,
  to = BORING_VAULT_ADDRESS,
}: {
  txHash?: Hex;
  data?: string;
  to?: Hex;
} = {}): {
  address: string;
  topics: string[];
  data: string;
  transactionHash: Hex;
} {
  return {
    address: MUSD_MONAD_ADDRESS,
    data,
    topics: [ERC20_TRANSFER_TOPIC, MONEY_ACCOUNT_PADDED, padAddress(to)],
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
    it('returns the CHOMP tx hash when Transfer is to the vault with exact amount', async () => {
      rpcRequestMock.mockResolvedValueOnce([buildMusdTransferLog()]);

      const result = await findRecentChompVaultDeposit({
        fromBlock: FROM_BLOCK,
        messenger: buildMessenger(),
        moneyAccountAddress: MONEY_ACCOUNT_ADDRESS,
        sourceAmountRaw: SOURCE_AMOUNT_RAW,
        vaultAddress: BORING_VAULT_ADDRESS,
      });

      expect(result).toBe(CHOMP_TX_HASH);
      expect(rpcRequestMock).toHaveBeenCalledTimes(1);
    });

    it('returns undefined when Transfer is not to the vault', async () => {
      rpcRequestMock.mockResolvedValueOnce([
        buildMusdTransferLog({ to: OTHER_RECIPIENT }),
      ]);

      const result = await findRecentChompVaultDeposit({
        fromBlock: FROM_BLOCK,
        messenger: buildMessenger(),
        moneyAccountAddress: MONEY_ACCOUNT_ADDRESS,
        sourceAmountRaw: SOURCE_AMOUNT_RAW,
        vaultAddress: BORING_VAULT_ADDRESS,
      });

      expect(result).toBeUndefined();
      expect(rpcRequestMock).toHaveBeenCalledTimes(1);
    });

    it('returns undefined when the transfer amount does not exactly match', async () => {
      rpcRequestMock.mockResolvedValueOnce([
        buildMusdTransferLog({ data: TRANSFER_DATA_ABOVE }),
      ]);

      const result = await findRecentChompVaultDeposit({
        fromBlock: FROM_BLOCK,
        messenger: buildMessenger(),
        moneyAccountAddress: MONEY_ACCOUNT_ADDRESS,
        sourceAmountRaw: SOURCE_AMOUNT_RAW,
        vaultAddress: BORING_VAULT_ADDRESS,
      });

      expect(result).toBeUndefined();
      expect(rpcRequestMock).toHaveBeenCalledTimes(1);
    });

    it('returns undefined when the mUSD transfer amount is below the required amount', async () => {
      rpcRequestMock.mockResolvedValueOnce([
        buildMusdTransferLog({ data: TRANSFER_DATA_INSUFFICIENT }),
      ]);

      const result = await findRecentChompVaultDeposit({
        fromBlock: FROM_BLOCK,
        messenger: buildMessenger(),
        moneyAccountAddress: MONEY_ACCOUNT_ADDRESS,
        sourceAmountRaw: SOURCE_AMOUNT_RAW,
        vaultAddress: BORING_VAULT_ADDRESS,
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
        vaultAddress: BORING_VAULT_ADDRESS,
      });

      expect(result).toBeUndefined();
      expect(rpcRequestMock).toHaveBeenCalledTimes(1);
    });

    it('queries eth_getLogs filtered to transfers from the Money Account to the vault', async () => {
      rpcRequestMock.mockResolvedValueOnce([]);

      await findRecentChompVaultDeposit({
        fromBlock: FROM_BLOCK,
        messenger: buildMessenger(),
        moneyAccountAddress: MONEY_ACCOUNT_ADDRESS,
        sourceAmountRaw: SOURCE_AMOUNT_RAW,
        vaultAddress: BORING_VAULT_ADDRESS,
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
              topics: [
                ERC20_TRANSFER_TOPIC,
                MONEY_ACCOUNT_PADDED,
                BORING_VAULT_PADDED,
              ],
            }),
          ],
        }),
      );
    });

    it('processes logs newest-first and returns the most recent exact vault match', async () => {
      const olderHash =
        '0x0000000000000000000000000000000000000000000000000000000000000001' as Hex;
      const newerHash =
        '0x0000000000000000000000000000000000000000000000000000000000000002' as Hex;

      rpcRequestMock.mockResolvedValueOnce([
        buildMusdTransferLog({ txHash: olderHash }),
        buildMusdTransferLog({ txHash: newerHash }),
      ]);

      const result = await findRecentChompVaultDeposit({
        fromBlock: FROM_BLOCK,
        messenger: buildMessenger(),
        moneyAccountAddress: MONEY_ACCOUNT_ADDRESS,
        sourceAmountRaw: SOURCE_AMOUNT_RAW,
        vaultAddress: BORING_VAULT_ADDRESS,
      });

      expect(result).toBe(newerHash);
      expect(rpcRequestMock).toHaveBeenCalledTimes(1);
    });

    it('skips amount mismatches and returns the first exact vault match', async () => {
      const mismatchedHash =
        '0x0000000000000000000000000000000000000000000000000000000000000001' as Hex;

      rpcRequestMock.mockResolvedValueOnce([
        buildMusdTransferLog({
          txHash: mismatchedHash,
          data: TRANSFER_DATA_INSUFFICIENT,
        }),
        buildMusdTransferLog(),
      ]);

      const result = await findRecentChompVaultDeposit({
        fromBlock: FROM_BLOCK,
        messenger: buildMessenger(),
        moneyAccountAddress: MONEY_ACCOUNT_ADDRESS,
        sourceAmountRaw: SOURCE_AMOUNT_RAW,
        vaultAddress: BORING_VAULT_ADDRESS,
      });

      expect(result).toBe(CHOMP_TX_HASH);
      expect(rpcRequestMock).toHaveBeenCalledTimes(1);
    });

    it('treats a log with data "0x" as zero amount and skips it', async () => {
      rpcRequestMock.mockResolvedValueOnce([
        buildMusdTransferLog({ data: '0x' }),
      ]);

      const result = await findRecentChompVaultDeposit({
        fromBlock: FROM_BLOCK,
        messenger: buildMessenger(),
        moneyAccountAddress: MONEY_ACCOUNT_ADDRESS,
        sourceAmountRaw: SOURCE_AMOUNT_RAW,
        vaultAddress: BORING_VAULT_ADDRESS,
      });

      expect(result).toBeUndefined();
    });
  });
});
