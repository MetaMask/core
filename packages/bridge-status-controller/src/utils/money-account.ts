import {
  formatChainIdToHex,
  getNetworkClientIdByChainId,
} from '@metamask/bridge-controller';
import { Web3Provider } from '@ethersproject/providers';
import { type TransactionController } from '@metamask/transaction-controller';
import type {
  BridgeHistoryItem,
  BridgeStatusControllerMessenger,
} from '../types.js';
import { getReceivedERC20Amount } from './swap-received-amount.js';
import { getNetworkProviderByChainId } from './network.js';
import { getMoneyAccountDepositAssetAddress } from '@metamask/money-account-utils';
import { buildMoneyAccountDepositBatch } from '@metamask/money-account-utils';
import { ORIGIN_METAMASK } from '@metamask/controller-utils';

export const handleMoneyAccountDeposit = async ({
  messenger,
  historyItem: { depositConfig, quote, account, depositBatchId },
  txHash,
  addTransactionBatchFn,
}: {
  messenger: BridgeStatusControllerMessenger;
  historyItem: BridgeHistoryItem;
  txHash: string;
  addTransactionBatchFn: typeof TransactionController.prototype.addTransactionBatch;
}) => {
  if (!depositConfig) {
    return;
  }

  // Get actual received amount from receipt
  const provider = getNetworkProviderByChainId(messenger, quote.destChainId);
  if (!provider) {
    throw new Error(`No provider available for chain ${quote.destChainId}`);
  }
  const ethersProvider = new Web3Provider(provider);
  const txReceipt = await ethersProvider.getTransactionReceipt(txHash);
  const receivedAmount = getReceivedERC20Amount(
    quote.destWalletAddress ?? quote.walletAddress ?? account,
    quote.destAsset.address,
    txReceipt?.logs,
  );

  if (!receivedAmount) {
    throw new Error(`Missing received amount`);
  }

  const {
    boringVault,
    tellerAddress,
    accountantAddress,
    lensAddress,
    moneyAccountAddress,
    chainIdHex,
    isGasFeeSponsored,
  } = depositConfig;

  // Build txs
  const txs = buildMoneyAccountDepositBatch({
    amount: BigInt(receivedAmount.toNumber()),
    chainId: formatChainIdToHex(quote.destChainId),
    provider: ethersProvider,
    boringVault,
    tellerAddress,
    accountantAddress,
    lensAddress,
  });

  const networkClientId = getNetworkClientIdByChainId(messenger, chainIdHex);

  // Add tx batch
  return await addTransactionBatchFn({
    batchId: depositBatchId,
    disableHook: true,
    disableSequential: true,
    disableUpgrade: true,
    from: moneyAccountAddress,
    isGasFeeSponsored,
    isInternal: true,
    networkClientId,
    origin: ORIGIN_METAMASK,
    requireApproval: false,
    requiredAssets: [
      {
        address: getMoneyAccountDepositAssetAddress(chainIdHex),
        amount: '0x0',
        standard: 'erc20',
      },
    ],
    skipInitialGasEstimate: true,
    transactions: Object.values(txs),
  });
};
